/**
 * RegionSyncService -- Region-level event sync operations
 *
 * Extracted from EventSyncService as part of P1 service decomposition.
 * Handles:
 *   - Fetching events from Ticketmaster for a region
 *   - Date window management (30-day window)
 *   - Event normalization and initial processing
 */

import { TicketmasterAdapter } from '../TicketmasterAdapter';
import { NormalizedEvent } from '../../types/ticketmaster';
import logger from '../../utils/logger';
import { SyncRegion } from './SyncLogService';

export interface RegionSyncResult {
  events: NormalizedEvent[];
  eventsFetched: number;
}

export class RegionSyncService {
  private adapter: TicketmasterAdapter | null = null;
  private apiKeyConfigured: boolean;

  constructor() {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    this.apiKeyConfigured = !!apiKey;

    if (!this.apiKeyConfigured) {
      logger.info(
        '[RegionSyncService] TICKETMASTER_API_KEY not configured. Sync pipeline is disabled.'
      );
    } else {
      try {
        this.adapter = new TicketmasterAdapter();
      } catch (err) {
        logger.error('[RegionSyncService] Failed to initialize TicketmasterAdapter', {
          error: (err as Error).message,
        });
        this.apiKeyConfigured = false;
      }
    }
  }

  /**
   * Check if the sync service is properly configured
   */
  isConfigured(): boolean {
    return this.apiKeyConfigured && this.adapter !== null;
  }

  /**
   * Fetch all events for a region within the standard 30-day window.
   * Builds date window: today to today + 30 days
   */
  async fetchEventsForRegion(region: SyncRegion): Promise<RegionSyncResult> {
    if (!this.isConfigured()) {
      logger.info('[RegionSyncService] Sync skipped: Ticketmaster API key not configured');
      return { events: [], eventsFetched: 0 };
    }

    const latlong = `${region.latitude},${region.longitude}`;

    // Build date window: today to today + 30 days
    const now = new Date();
    const startDate = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');

    logger.info(`[RegionSyncService] Fetching events for region: ${region.label}`, {
      latlong,
      radius: region.radius_miles,
      startDate,
      endDate,
    });

    const events = await this.adapter!.fetchAllEventsForRegion(
      latlong,
      region.radius_miles,
      startDate,
      endDate
    );

    logger.info(`[RegionSyncService] Fetched ${events.length} events for region: ${region.label}`);

    return {
      events,
      eventsFetched: events.length,
    };
  }

  /**
   * Fetch events for a region with custom date range.
   * Used for on-demand or backfill syncs.
   */
  async fetchEventsForRegionWithDateRange(
    region: SyncRegion,
    startDate: Date,
    endDate: Date
  ): Promise<RegionSyncResult> {
    if (!this.isConfigured()) {
      return { events: [], eventsFetched: 0 };
    }

    const latlong = `${region.latitude},${region.longitude}`;
    const startDateStr = startDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const endDateStr = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');

    logger.info(`[RegionSyncService] Fetching events with custom date range: ${region.label}`, {
      latlong,
      radius: region.radius_miles,
      startDate: startDateStr,
      endDate: endDateStr,
    });

    const events = await this.adapter!.fetchAllEventsForRegion(
      latlong,
      region.radius_miles,
      startDateStr,
      endDateStr
    );

    return {
      events,
      eventsFetched: events.length,
    };
  }

  /**
   * Ingest a single Ticketmaster event on-demand.
   * Used for on-demand lookups when a user interacts with an event.
   */
  async ingestSingleEvent(tmEvent: any): Promise<NormalizedEvent | null> {
    if (!this.adapter) {
      // Even without the adapter, we can still normalize and ingest
      // as long as we have a TicketmasterAdapter instance for normalization
      const tempAdapter = new TicketmasterAdapter();
      return tempAdapter.normalizeEvent(tmEvent);
    }

    return this.adapter.normalizeEvent(tmEvent);
  }

  /**
   * Get the underlying adapter (for advanced use cases)
   * @deprecated Use the high-level methods instead
   */
  getAdapter(): TicketmasterAdapter | null {
    return this.adapter;
  }
}
