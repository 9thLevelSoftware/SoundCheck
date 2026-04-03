/**
 * Ticketmaster Discovery API v2 Adapter
 *
 * Handles all communication with the Ticketmaster Discovery API including
 * authentication, rate limiting, pagination, and response normalization.
 * Follows the same adapter pattern as MusicBrainzService.
 *
 * Rate limits:
 * - 5 requests/second (enforced via 200ms delay between calls)
 * - 5000 requests/day (tracked in-memory, refuse calls at 4900)
 *
 * @see https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  TicketmasterEvent,
  TicketmasterSearchResponse,
  TicketmasterSearchParams,
  NormalizedEvent,
} from '../types/ticketmaster';
import { getRedis } from '../utils/redisRateLimiter';
import logger from '../utils/logger';

/** Maximum pages to fetch before attempting date-range subdivision */
const MAX_PAGES = 5;

/** Maximum items Ticketmaster allows via deep paging (size * page < 1000) */
const MAX_DEEP_PAGING_ITEMS = 1000;

/** Daily API call quota */
const DAILY_QUOTA = 5000;

/** Warn when approaching this many calls */
const DAILY_QUOTA_WARN = 4500;

/** Refuse calls at this count (reserve 100 for on-demand lookups) */
const DAILY_QUOTA_HARD_LIMIT = 4900;

/** Delay between API calls in ms (stay under 5/sec) */
const INTER_REQUEST_DELAY_MS = 200;

export class TicketmasterAdapter {
  private client: AxiosInstance;
  // CFR-BE-007: In-memory counter kept as fallback when Redis is unavailable
  private dailyCallCountFallback = 0;
  private dailyResetTime: number;

  constructor() {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        'TICKETMASTER_API_KEY environment variable is required. ' +
          'Get a free API key at https://developer.ticketmaster.com/'
      );
    }

    this.client = axios.create({
      baseURL: 'https://app.ticketmaster.com/discovery/v2',
      params: { apikey: apiKey },
      timeout: 10000,
    });

    // Set next midnight UTC as reset time
    this.dailyResetTime = this.getNextMidnightUTC();
  }

  /**
   * Search for music events by geographic coordinates.
   *
   * Returns raw Ticketmaster events plus pagination metadata.
   * Handles empty responses gracefully (_embedded.events may be missing).
   */
  async searchMusicEvents(params: TicketmasterSearchParams): Promise<{
    events: TicketmasterEvent[];
    page: { totalElements: number; totalPages: number; number: number; size: number };
  }> {
    await this.checkDailyQuota();

    const response = await this.client.get<TicketmasterSearchResponse>('/events.json', {
      params: {
        latlong: params.latlong,
        radius: params.radius,
        unit: 'miles',
        startDateTime: params.startDateTime,
        endDateTime: params.endDateTime,
        classificationName: 'music',
        size: params.size || 200,
        page: params.page || 0,
        sort: 'date,asc',
      },
    });

    await this.incrementDailyCount();

    const data = response.data;
    const events = data._embedded?.events || [];
    const page = data.page || { totalElements: 0, totalPages: 0, number: 0, size: 200 };

    return { events, page };
  }

  /**
   * Fetch all events for a geographic region within a date range.
   *
   * Paginates through all pages (max 5 pages = 1000 items).
   * If totalElements > 1000, subdivides the date range into halves
   * and recurses to capture all events.
   *
   * Returns normalized events ready for database ingestion.
   */
  async fetchAllEventsForRegion(
    latlong: string,
    radius: number,
    startDate: string,
    endDate: string
  ): Promise<NormalizedEvent[]> {
    const allNormalized: NormalizedEvent[] = [];

    // First page to check total count
    const firstResult = await this.searchMusicEvents({
      latlong,
      radius,
      startDateTime: startDate,
      endDateTime: endDate,
      size: 200,
      page: 0,
    });

    // Normalize first page results
    for (const tmEvent of firstResult.events) {
      const normalized = this.normalizeEvent(tmEvent);
      if (normalized) {
        allNormalized.push(normalized);
      }
    }

    // If more than 1000 total items, subdivide date range
    if (firstResult.page.totalElements > MAX_DEEP_PAGING_ITEMS) {
      logger.info('[TicketmasterAdapter] Result set exceeds 1000 items, subdividing date range', {
        totalElements: firstResult.page.totalElements,
        startDate,
        endDate,
      });

      // Clear first page results and recurse with subdivided ranges
      allNormalized.length = 0;

      const midDate = this.getMidpointDate(startDate, endDate);
      const firstHalf = await this.fetchAllEventsForRegion(latlong, radius, startDate, midDate);
      const secondHalf = await this.fetchAllEventsForRegion(latlong, radius, midDate, endDate);

      allNormalized.push(...firstHalf, ...secondHalf);

      // Deduplicate by externalId (events on the boundary date may appear in both halves)
      const seen = new Set<string>();
      const deduplicated: NormalizedEvent[] = [];
      for (const event of allNormalized) {
        if (!seen.has(event.externalId)) {
          seen.add(event.externalId);
          deduplicated.push(event);
        }
      }
      return deduplicated;
    }

    // Paginate through remaining pages (max 5 pages total)
    // Use parallel requests with Promise.all for better performance
    const totalPages = Math.min(firstResult.page.totalPages, MAX_PAGES);
    const pageNumbers: number[] = [];
    for (let page = 1; page < totalPages; page++) {
      pageNumbers.push(page);
    }

    if (pageNumbers.length > 0) {
      const pagePromises = pageNumbers.map(page =>
        this.fetchPageWithDelay(latlong, radius, startDate, endDate, page)
      );
      const pages = await Promise.all(pagePromises);

      for (const pageResult of pages) {
        for (const tmEvent of pageResult.events) {
          const normalized = this.normalizeEvent(tmEvent);
          if (normalized) {
            allNormalized.push(normalized);
          }
        }
      }
    }

    return allNormalized;
  }

  /**
   * Fetch a single event by its Ticketmaster event ID.
   * Returns null if the event is not found (404).
   */
  async getEventById(eventId: string): Promise<TicketmasterEvent | null> {
    await this.checkDailyQuota();

    try {
      const response = await this.client.get<TicketmasterEvent>(`/events/${eventId}.json`);
      await this.incrementDailyCount();
      return response.data;
    } catch (error) {
      const axiosErr = error as AxiosError;
      if (axiosErr.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Normalize a raw Ticketmaster event into the internal format.
   *
   * Skips events without a venue (virtual events, TBA).
   * Returns null for events that cannot be normalized.
   */
  normalizeEvent(tmEvent: TicketmasterEvent): NormalizedEvent | null {
    // Skip events without embedded venue data
    const tmVenue = tmEvent._embedded?.venues?.[0];
    if (!tmVenue) {
      logger.warn('[TicketmasterAdapter] Skipping event without venue', {
        eventId: tmEvent.id,
        eventName: tmEvent.name,
      });
      return null;
    }

    // Extract venue
    const venue: NormalizedEvent['venue'] = {
      externalId: tmVenue.id,
      name: tmVenue.name,
      address: tmVenue.address?.line1 || null,
      city: tmVenue.city?.name || null,
      state: tmVenue.state?.stateCode || null,
      country: tmVenue.country?.countryCode || null,
      postalCode: tmVenue.postalCode || null,
      lat: tmVenue.location?.latitude ? parseFloat(tmVenue.location.latitude) : null,
      lon: tmVenue.location?.longitude ? parseFloat(tmVenue.location.longitude) : null,
      timezone: tmVenue.timezone || null,
    };

    // Extract attractions (bands)
    const tmAttractions = tmEvent._embedded?.attractions || [];
    const attractions: NormalizedEvent['attractions'] = tmAttractions.map((attr) => {
      // Pick the first genre classification
      const genre = attr.classifications?.[0]?.genre?.name || null;
      // Pick the first image (prefer 16_9 ratio if available)
      const image16x9 = attr.images?.find((img) => img.ratio === '16_9');
      const imageUrl = image16x9?.url || attr.images?.[0]?.url || null;

      return {
        externalId: attr.id,
        name: attr.name,
        genre: genre !== 'Undefined' ? genre : null,
        imageUrl,
      };
    });

    // Map Ticketmaster status codes to our status values
    const status = this.mapStatus(tmEvent.dates.status.code);

    // Extract price range
    const priceMin = tmEvent.priceRanges?.[0]?.min ?? null;
    const priceMax = tmEvent.priceRanges?.[0]?.max ?? null;

    return {
      externalId: tmEvent.id,
      name: tmEvent.name,
      date: tmEvent.dates.start.localDate,
      startTime: tmEvent.dates.start.localTime || null,
      status,
      ticketUrl: tmEvent.url,
      priceMin,
      priceMax,
      venue,
      attractions,
    };
  }

  /**
   * Get the current daily API call count.
   * Useful for monitoring and health checks.
   */
  async getDailyCallCount(): Promise<number> {
    return this.getCurrentDailyCount();
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /**
   * Map Ticketmaster status code to our event status.
   */
  private mapStatus(code: string): NormalizedEvent['status'] {
    switch (code) {
      case 'onsale':
      case 'offsale':
        return 'active';
      case 'canceled':
        return 'cancelled';
      case 'postponed':
        return 'postponed';
      case 'rescheduled':
        return 'rescheduled';
      default:
        return 'active';
    }
  }

  /**
   * Calculate the midpoint date between two ISO 8601 datetime strings.
   * Used for date-range subdivision when results exceed 1000.
   */
  private getMidpointDate(startDate: string, endDate: string): string {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const mid = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2);
    return mid.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  /**
   * Check if we are within the daily API call quota.
   * Throws if quota is exhausted.
   */
  private async checkDailyQuota(): Promise<void> {
    const currentCount = await this.getCurrentDailyCount();

    if (currentCount >= DAILY_QUOTA_HARD_LIMIT) {
      throw new Error(
        `Ticketmaster daily API quota nearly exhausted (${currentCount}/${DAILY_QUOTA}). ` +
          'Refusing further calls to reserve capacity for on-demand lookups.'
      );
    }

    if (currentCount >= DAILY_QUOTA_WARN) {
      logger.warn('[TicketmasterAdapter] Approaching daily API quota', {
        current: currentCount,
        limit: DAILY_QUOTA,
      });
    }
  }

  /**
   * CFR-BE-007: Get the Redis key for today's daily counter.
   */
  private getDailyRedisKey(): string {
    return `ticketmaster:daily:${new Date().toISOString().slice(0, 10)}`;
  }

  /**
   * CFR-BE-007: Increment the daily call counter.
   * Uses Redis INCR when available; falls back to in-memory counter.
   * Redis key auto-expires after 25 hours (covers UTC day + buffer).
   */
  private async incrementDailyCount(): Promise<number> {
    const redis = getRedis();
    if (redis) {
      try {
        const key = this.getDailyRedisKey();
        const count = await redis.incr(key);
        if (count === 1) {
          // First increment today — set expiry to 25 hours from now
          await redis.expire(key, 90000);
        }
        return count;
      } catch (error) {
        logger.warn('[TicketmasterAdapter] Redis INCR failed, falling back to in-memory', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback: in-memory counter with midnight reset
    this.resetFallbackCounterIfNeeded();
    return ++this.dailyCallCountFallback;
  }

  /**
   * Get the current daily call count from Redis or in-memory fallback.
   */
  private async getCurrentDailyCount(): Promise<number> {
    const redis = getRedis();
    if (redis) {
      try {
        const key = this.getDailyRedisKey();
        const val = await redis.get(key);
        return val ? parseInt(val, 10) : 0;
      } catch {
        // Fall through to in-memory
      }
    }
    this.resetFallbackCounterIfNeeded();
    return this.dailyCallCountFallback;
  }

  /**
   * Reset the in-memory fallback counter if we've passed midnight UTC.
   */
  private resetFallbackCounterIfNeeded(): void {
    const now = Date.now();
    if (now >= this.dailyResetTime) {
      this.dailyCallCountFallback = 0;
      this.dailyResetTime = this.getNextMidnightUTC();
      logger.info('[TicketmasterAdapter] Daily API call counter reset (in-memory fallback)');
    }
  }

  /**
   * Get the Unix timestamp (ms) of the next midnight UTC.
   */
  private getNextMidnightUTC(): number {
    const now = new Date();
    const tomorrow = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
    );
    return tomorrow.getTime();
  }

  /**
   * Simple delay for rate limiting between API calls.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetch a page with built-in rate limiting delay.
   * Used for parallel page fetching with staggered delays.
   */
  private async fetchPageWithDelay(
    latlong: string,
    radius: number,
    startDate: string,
    endDate: string,
    page: number
  ): Promise<{ events: TicketmasterEvent[] }> {
    await this.delay(page * INTER_REQUEST_DELAY_MS);
    return this.searchMusicEvents({
      latlong,
      radius,
      startDateTime: startDate,
      endDateTime: endDate,
      size: 200,
      page,
    });
  }
}
