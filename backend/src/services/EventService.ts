import Database from '../config/database';
import { Event, EventLineupEntry } from '../types';
import { cache, CacheKeys, CacheTTL } from '../utils/cache';

interface CreateEventRequest {
  venueId: string;
  bandId?: string;
  eventDate: Date;
  eventName?: string;
  description?: string;
  doorsTime?: string;
  startTime?: string;
  endTime?: string;
  ticketUrl?: string;
  ticketPriceMin?: number;
  ticketPriceMax?: number;
  createdByUserId?: string;
  source?: string;
  lineup?: { bandId: string; setOrder?: number; isHeadliner?: boolean; setTime?: string }[];
}

export class EventService {
  private db = Database.getInstance();

  /**
   * Create a new event with lineup entries, or return existing one.
   * Events are unique by venue + band + date combination (for single-band compat).
   * For multi-band events, uses venue + date + event_name for dedup.
   *
   * Accepts either:
   * - { bandId } (old format): creates event + single lineup entry
   * - { lineup } (new format): creates event + multiple lineup entries
   */
  async createEvent(data: CreateEventRequest): Promise<Event> {
    try {
      const {
        venueId,
        bandId,
        eventDate,
        eventName,
        description,
        doorsTime,
        startTime,
        endTime,
        ticketUrl,
        ticketPriceMin,
        ticketPriceMax,
        createdByUserId,
        source,
        lineup,
      } = data;

      // Determine event source: explicit source, or 'user_created' when a user creates it
      const eventSource = source || (createdByUserId ? 'user_created' : undefined);
      const eventIsVerified = eventSource === 'user_created' ? false : undefined;

      // Build lineup entries from either bandId or lineup array
      const lineupEntries = lineup && lineup.length > 0
        ? lineup
        : bandId
          ? [{ bandId, setOrder: 0, isHeadliner: true }]
          : [];

      // For backward compat (single band): check existing event by venue+band+date
      if (bandId && (!lineup || lineup.length === 0)) {
        const existingEvent = await this.db.query(
          `SELECT e.id FROM events e
           JOIN event_lineup el ON e.id = el.event_id
           WHERE e.venue_id = $1 AND el.band_id = $2 AND e.event_date = $3`,
          [venueId, bandId, eventDate]
        );

        if (existingEvent.rows.length > 0) {
          return this.getEventById(existingEvent.rows[0].id);
        }
      }

      // Create event + lineup in a transaction
      const client = await this.db.getClient();
      try {
        await client.query('BEGIN');

        const eventResult = await client.query(
          `INSERT INTO events (
            venue_id, event_date, event_name, description,
            doors_time, start_time, end_time,
            ticket_url, ticket_price_min, ticket_price_max,
            created_by_user_id, source, is_verified
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *`,
          [
            venueId,
            eventDate,
            eventName || null,
            description || null,
            doorsTime || null,
            startTime || null,
            endTime || null,
            ticketUrl || null,
            ticketPriceMin || null,
            ticketPriceMax || null,
            createdByUserId || null,
            eventSource || null,
            eventIsVerified !== undefined ? eventIsVerified : null,
          ]
        );

        const eventId = eventResult.rows[0].id;

        // Insert lineup entries
        for (const entry of lineupEntries) {
          await client.query(
            `INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner, set_time)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (event_id, band_id) DO NOTHING`,
            [
              eventId,
              entry.bandId,
              entry.setOrder ?? 0,
              entry.isHeadliner ?? false,
              entry.setTime || null,
            ]
          );
        }

        await client.query('COMMIT');

        return this.getEventById(eventId);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Create event error:', error);
      throw error;
    }
  }

  /**
   * Get event by ID with full lineup, venue, and band details.
   * Returns Event with lineup array containing band info for each entry.
   */
  async getEventById(eventId: string): Promise<Event> {
    try {
      // Get event with venue
      const eventQuery = `
        SELECT
          e.*,
          v.id as v_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        WHERE e.id = $1
      `;

      const eventResult = await this.db.query(eventQuery, [eventId]);

      if (eventResult.rows.length === 0) {
        throw new Error('Event not found');
      }

      // Get lineup entries with band details
      const lineupQuery = `
        SELECT
          el.id, el.band_id, el.set_order, el.set_time, el.is_headliner,
          b.id as b_id, b.name as band_name, b.genre as band_genre,
          b.image_url as band_image
        FROM event_lineup el
        LEFT JOIN bands b ON el.band_id = b.id
        WHERE el.event_id = $1
        ORDER BY el.set_order ASC
      `;

      const lineupResult = await this.db.query(lineupQuery, [eventId]);

      // Get checkin count
      const countQuery = `
        SELECT COUNT(*) as checkin_count FROM checkins
        WHERE event_id = $1
      `;
      const countResult = await this.db.query(countQuery, [eventId]);

      return this.mapDbEventToEvent(
        eventResult.rows[0],
        lineupResult.rows,
        parseInt(countResult.rows[0].checkin_count || '0')
      );
    } catch (error) {
      console.error('Get event error:', error);
      throw error;
    }
  }

  /**
   * Get events at a specific venue
   */
  async getEventsByVenue(
    venueId: string,
    options: { upcoming?: boolean; limit?: number } = {}
  ): Promise<Event[]> {
    try {
      const { upcoming = true, limit = 50 } = options;

      let whereClause = 'WHERE e.venue_id = $1';
      if (upcoming) {
        whereClause += ' AND e.event_date >= CURRENT_DATE';
      }

      const query = `
        SELECT
          e.*,
          v.id as v_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) as checkin_count
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        ${whereClause}
        ORDER BY e.event_date ${upcoming ? 'ASC' : 'DESC'}
        LIMIT $2
      `;

      const result = await this.db.query(query, [venueId, limit]);

      return this.mapDbEventsWithHeadliner(result.rows);
    } catch (error) {
      console.error('Get events by venue error:', error);
      throw error;
    }
  }

  /**
   * Get events for a specific band
   */
  async getEventsByBand(
    bandId: string,
    options: { upcoming?: boolean; limit?: number } = {}
  ): Promise<Event[]> {
    try {
      const { upcoming = true, limit = 50 } = options;

      let whereClause = 'WHERE el.band_id = $1';
      if (upcoming) {
        whereClause += ' AND e.event_date >= CURRENT_DATE';
      }

      const query = `
        SELECT
          e.*,
          v.id as v_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) as checkin_count
        FROM events e
        JOIN event_lineup el ON e.id = el.event_id
        LEFT JOIN venues v ON e.venue_id = v.id
        ${whereClause}
        ORDER BY e.event_date ${upcoming ? 'ASC' : 'DESC'}
        LIMIT $2
      `;

      const result = await this.db.query(query, [bandId, limit]);

      return this.mapDbEventsWithHeadliner(result.rows);
    } catch (error) {
      console.error('Get events by band error:', error);
      throw error;
    }
  }

  /**
   * Get upcoming events (across all venues/bands)
   */
  async getUpcomingEvents(limit: number = 50): Promise<Event[]> {
    try {
      const query = `
        SELECT
          e.*,
          v.id as v_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) as checkin_count
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        WHERE e.event_date >= CURRENT_DATE AND e.is_cancelled = FALSE
        ORDER BY e.event_date ASC, e.created_at DESC
        LIMIT $1
      `;

      const result = await this.db.query(query, [limit]);

      return this.mapDbEventsWithHeadliner(result.rows);
    } catch (error) {
      console.error('Get upcoming events error:', error);
      throw error;
    }
  }

  /**
   * Get trending events (most check-ins in last 30 days)
   */
  async getTrendingEvents(limit: number = 20): Promise<Event[]> {
    try {
      const query = `
        SELECT
          e.*,
          v.id as v_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id AND c.is_hidden IS NOT TRUE) as checkin_count
        FROM events e
        LEFT JOIN venues v ON e.venue_id = v.id
        WHERE e.event_date >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY checkin_count DESC, e.event_date DESC
        LIMIT $1
      `;

      const result = await this.db.query(query, [limit]);

      return this.mapDbEventsWithHeadliner(result.rows);
    } catch (error) {
      console.error('Get trending events error:', error);
      throw error;
    }
  }

  /**
   * Delete an event (CASCADE handles lineup entries)
   */
  async deleteEvent(eventId: string): Promise<void> {
    try {
      await this.db.query('DELETE FROM events WHERE id = $1', [eventId]);
    } catch (error) {
      console.error('Delete event error:', error);
      throw error;
    }
  }

  /**
   * Find or create an event for a given venue+band+date.
   * Used by CheckinService during dual-write to ensure event_id is populated.
   *
   * If an event exists at this venue on this date with this band in the lineup,
   * returns it. Otherwise creates a new event + lineup entry.
   */
  async findOrCreateEvent(venueId: string, bandId: string, eventDate: Date): Promise<string> {
    try {
      // Look for existing event at this venue on this date with this band
      const existing = await this.db.query(
        `SELECT e.id FROM events e
         JOIN event_lineup el ON e.id = el.event_id
         WHERE e.venue_id = $1 AND el.band_id = $2 AND e.event_date = $3`,
        [venueId, bandId, eventDate]
      );

      if (existing.rows.length > 0) {
        return existing.rows[0].id;
      }

      // Check if there's an event at this venue on this date (without this band)
      // If so, add the band to the lineup
      const eventAtVenueDate = await this.db.query(
        `SELECT id FROM events
         WHERE venue_id = $1 AND event_date = $2
         LIMIT 1`,
        [venueId, eventDate]
      );

      if (eventAtVenueDate.rows.length > 0) {
        const eventId = eventAtVenueDate.rows[0].id;
        // Add band to existing event's lineup
        await this.db.query(
          `INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner)
           VALUES ($1, $2, 0, false)
           ON CONFLICT (event_id, band_id) DO NOTHING`,
          [eventId, bandId]
        );
        return eventId;
      }

      // No event found -- create new event + lineup entry
      const client = await this.db.getClient();
      try {
        await client.query('BEGIN');

        const eventResult = await client.query(
          `INSERT INTO events (venue_id, event_date, source)
           VALUES ($1, $2, 'checkin_created')
           RETURNING id`,
          [venueId, eventDate]
        );

        const eventId = eventResult.rows[0].id;

        await client.query(
          `INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner)
           VALUES ($1, $2, 0, true)`,
          [eventId, bandId]
        );

        await client.query('COMMIT');
        return eventId;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Find or create event error:', error);
      throw error;
    }
  }

  // ============================================
  // User event enrichment methods
  // ============================================

  /**
   * Find a user-created event at a specific venue+date that hasn't been
   * matched to a Ticketmaster event yet.
   *
   * Used by EventSyncService to check for auto-merge candidates before
   * creating a new event from Ticketmaster data.
   */
  async findUserCreatedEventAtVenueDate(
    venueId: string,
    eventDate: string,
  ): Promise<string | null> {
    try {
      const result = await this.db.query(
        `SELECT id FROM events
         WHERE venue_id = $1
           AND event_date::date = $2::date
           AND source = 'user_created'
           AND external_id IS NULL
         LIMIT 1`,
        [venueId, eventDate],
      );
      return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
      console.error('Find user-created event at venue+date error:', error);
      throw error;
    }
  }

  /**
   * Promote a user-created event to verified if 2+ unique users have
   * checked in. Implements PIPE-06 organic verification.
   *
   * Called by CheckinService (Phase 3) after each check-in to a
   * user-created event. The method is idempotent: once verified,
   * subsequent calls are no-ops (the WHERE clause filters out
   * already-verified events).
   *
   * Returns the event ID if promoted, null if not yet eligible.
   */
  async promoteIfVerified(eventId: string): Promise<string | null> {
    try {
      const result = await this.db.query(
        `UPDATE events SET is_verified = true, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND source = 'user_created'
           AND is_verified = false
           AND (SELECT COUNT(DISTINCT user_id) FROM checkins WHERE event_id = $1) >= 2
         RETURNING id`,
        [eventId],
      );
      return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
      console.error('Promote if verified error:', error);
      throw error;
    }
  }

  /**
   * Merge Ticketmaster data into an existing user-created event.
   *
   * Auto-merge: when the sync pipeline finds a Ticketmaster event at
   * the same venue+date as a user-created event, it enriches the user
   * record with TM data (external_id, name, ticket URL, prices, status)
   * and promotes it to source='ticketmaster' + is_verified=true.
   *
   * This prevents duplication and rewards users who created events early.
   */
  async mergeTicketmasterIntoUserEvent(
    userEventId: string,
    tmData: {
      externalId: string;
      eventName?: string;
      ticketUrl?: string;
      priceMin?: number | null;
      priceMax?: number | null;
      status?: string;
    },
  ): Promise<void> {
    try {
      await this.db.query(
        `UPDATE events SET
          external_id = $2,
          source = 'ticketmaster',
          event_name = COALESCE($3, event_name),
          ticket_url = COALESCE($4, ticket_url),
          ticket_price_min = COALESCE($5, ticket_price_min),
          ticket_price_max = COALESCE($6, ticket_price_max),
          status = COALESCE($7, status),
          is_verified = true,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [
          userEventId,
          tmData.externalId,
          tmData.eventName || null,
          tmData.ticketUrl || null,
          tmData.priceMin ?? null,
          tmData.priceMax ?? null,
          tmData.status || null,
        ],
      );
    } catch (error) {
      console.error('Merge Ticketmaster into user event error:', error);
      throw error;
    }
  }

  // ============================================
  // Nearby events (Phase 3)
  // ============================================

  /**
   * Get events happening today near given GPS coordinates.
   * Uses Haversine formula (same pattern as VenueService.getVenuesNear).
   * Returns events sorted by distance with distanceKm attached.
   */
  async getNearbyEvents(
    lat: number,
    lon: number,
    radiusKm: number = 10,
    limit: number = 20
  ): Promise<(Event & { distanceKm: number })[]> {
    try {
      const query = `
        SELECT * FROM (
          SELECT e.*,
                 v.id as v_id, v.name as venue_name, v.city as venue_city,
                 v.state as venue_state, v.image_url as venue_image,
                 (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) as checkin_count,
                 (6371 * acos(
                   cos(radians($1)) * cos(radians(v.latitude)) *
                   cos(radians(v.longitude) - radians($2)) +
                   sin(radians($1)) * sin(radians(v.latitude))
                 )) AS distance_km
          FROM events e
          JOIN venues v ON e.venue_id = v.id
          WHERE e.event_date = CURRENT_DATE
            AND e.is_cancelled = FALSE
            AND v.latitude IS NOT NULL
            AND v.longitude IS NOT NULL
        ) sub
        WHERE distance_km <= $3
        ORDER BY distance_km ASC
        LIMIT $4
      `;

      const result = await this.db.query(query, [lat, lon, radiusKm, limit]);

      if (result.rows.length === 0) return [];

      // Hydrate with lineup data using existing helper
      const events = await this.mapDbEventsWithHeadliner(result.rows);

      // Attach distanceKm from the subquery results
      return events.map((event, index) => ({
        ...event,
        distanceKm: parseFloat(result.rows[index].distance_km),
      }));
    } catch (error) {
      console.error('Get nearby events error:', error);
      throw error;
    }
  }

  // ============================================
  // Event Discovery methods (Phase 7)
  // ============================================

  /**
   * Get upcoming events near given GPS coordinates within a date range.
   * Uses Haversine formula with bounding box pre-filter for performance.
   * Cached with 300s TTL.
   */
  async getNearbyUpcoming(
    lat: number,
    lon: number,
    radiusKm: number = 50,
    days: number = 30,
    limit: number = 20
  ): Promise<(Event & { distanceKm: number })[]> {
    const cacheKey = CacheKeys.nearbyEvents(lat, lon, radiusKm);

    return cache.getOrSet(cacheKey, async () => {
      try {
        const query = `
          SELECT * FROM (
            SELECT e.*,
                   v.id as v_id, v.name as venue_name, v.city as venue_city,
                   v.state as venue_state, v.image_url as venue_image,
                   (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) as checkin_count,
                   (6371 * acos(
                     cos(radians($1)) * cos(radians(v.latitude)) *
                     cos(radians(v.longitude) - radians($2)) +
                     sin(radians($1)) * sin(radians(v.latitude))
                   )) AS distance_km
            FROM events e
            JOIN venues v ON e.venue_id = v.id
            WHERE e.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($3 || ' days')::INTERVAL
              AND e.is_cancelled = FALSE
              AND v.latitude IS NOT NULL
              AND v.longitude IS NOT NULL
              AND v.latitude BETWEEN ($1 - $4 / 111.0) AND ($1 + $4 / 111.0)
              AND v.longitude BETWEEN ($2 - $4 / (111.0 * cos(radians($1)))) AND ($2 + $4 / (111.0 * cos(radians($1))))
          ) sub
          WHERE distance_km <= $4
          ORDER BY sub.event_date ASC, distance_km ASC
          LIMIT $5
        `;

        const result = await this.db.query(query, [lat, lon, days, radiusKm, limit]);

        if (result.rows.length === 0) return [];

        const events = await this.mapDbEventsWithHeadliner(result.rows);

        return events.map((event, index) => ({
          ...event,
          distanceKm: parseFloat(result.rows[index].distance_km),
        }));
      } catch (error) {
        console.error('Get nearby upcoming events error:', error);
        throw error;
      }
    }, CacheTTL.MEDIUM);
  }

  /**
   * Get trending events near user based on recent check-in activity.
   * Sorts by recent check-in count within the specified radius.
   * Cached with 300s TTL.
   */
  async getTrendingNearby(
    lat: number,
    lon: number,
    radiusKm: number = 50,
    days: number = 7,
    limit: number = 20
  ): Promise<(Event & { distanceKm: number })[]> {
    const cacheKey = CacheKeys.trendingEvents(lat, lon);

    return cache.getOrSet(cacheKey, async () => {
      try {
        const query = `
          SELECT * FROM (
            SELECT e.*,
                   v.id as v_id, v.name as venue_name, v.city as venue_city,
                   v.state as venue_state, v.image_url as venue_image,
                   (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id AND c.is_hidden IS NOT TRUE) as checkin_count,
                   (SELECT COUNT(*) FROM checkins c
                    WHERE c.event_id = e.id
                      AND c.created_at >= CURRENT_DATE - ($3 || ' days')::INTERVAL
                      AND c.is_hidden IS NOT TRUE
                   ) as recent_checkins,
                   (6371 * acos(
                     cos(radians($1)) * cos(radians(v.latitude)) *
                     cos(radians(v.longitude) - radians($2)) +
                     sin(radians($1)) * sin(radians(v.latitude))
                   )) AS distance_km
            FROM events e
            JOIN venues v ON e.venue_id = v.id
            WHERE e.event_date >= CURRENT_DATE
              AND e.event_date <= CURRENT_DATE + INTERVAL '30 days'
              AND e.is_cancelled = FALSE
              AND v.latitude IS NOT NULL
              AND v.longitude IS NOT NULL
              AND v.latitude BETWEEN ($1 - $4 / 111.0) AND ($1 + $4 / 111.0)
              AND v.longitude BETWEEN ($2 - $4 / (111.0 * cos(radians($1)))) AND ($2 + $4 / (111.0 * cos(radians($1))))
          ) sub
          WHERE distance_km <= $4
          ORDER BY recent_checkins DESC, distance_km ASC
          LIMIT $5
        `;

        const result = await this.db.query(query, [lat, lon, days, radiusKm, limit]);

        if (result.rows.length === 0) return [];

        const events = await this.mapDbEventsWithHeadliner(result.rows);

        return events.map((event, index) => ({
          ...event,
          distanceKm: parseFloat(result.rows[index].distance_km),
        }));
      } catch (error) {
        console.error('Get trending nearby events error:', error);
        throw error;
      }
    }, CacheTTL.MEDIUM);
  }

  /**
   * Get upcoming events filtered by genre.
   * Joins through event_lineup -> bands to match genre.
   * Cached with 300s TTL.
   */
  async getByGenre(
    genre: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Event[]> {
    const cacheKey = CacheKeys.genreEvents(genre);

    return cache.getOrSet(cacheKey, async () => {
      try {
        const query = `
          SELECT DISTINCT ON (e.id) e.*,
                 v.id as v_id, v.name as venue_name, v.city as venue_city,
                 v.state as venue_state, v.image_url as venue_image,
                 (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) as checkin_count
          FROM events e
          JOIN venues v ON e.venue_id = v.id
          JOIN event_lineup el ON e.id = el.event_id
          JOIN bands b ON el.band_id = b.id
          WHERE $1 = ANY(b.genres)
            AND e.event_date >= CURRENT_DATE
            AND e.is_cancelled = FALSE
          ORDER BY e.id, e.event_date ASC
          LIMIT $2 OFFSET $3
        `;

        const result = await this.db.query(query, [genre, limit, offset]);

        // Re-sort by event_date since DISTINCT ON requires ORDER BY e.id first
        result.rows.sort((a: any, b: any) => {
          const dateA = new Date(a.event_date).getTime();
          const dateB = new Date(b.event_date).getTime();
          return dateA - dateB;
        });

        return this.mapDbEventsWithHeadliner(result.rows);
      } catch (error) {
        console.error('Get events by genre error:', error);
        throw error;
      }
    }, CacheTTL.MEDIUM);
  }

  /**
   * Search events by event name, band name, venue name, or genre.
   * Uses pg_trgm similarity matching for fuzzy search.
   */
  async searchEvents(
    query: string,
    limit: number = 20
  ): Promise<Event[]> {
    try {
      const sql = `
        SELECT * FROM (
          SELECT DISTINCT ON (e.id) e.*,
                 v.id as v_id, v.name as venue_name, v.city as venue_city,
                 v.state as venue_state, v.image_url as venue_image,
                 (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) as checkin_count,
                 GREATEST(
                   similarity(COALESCE(e.event_name, ''), $1),
                   similarity(v.name, $1)
                 ) as relevance
          FROM events e
          JOIN venues v ON e.venue_id = v.id
          LEFT JOIN event_lineup el ON e.id = el.event_id
          LEFT JOIN bands b ON el.band_id = b.id
          WHERE e.event_date >= CURRENT_DATE AND e.is_cancelled = FALSE
            AND (
              COALESCE(e.event_name, '') ILIKE '%' || $1 || '%'
              OR v.name ILIKE '%' || $1 || '%'
              OR b.name ILIKE '%' || $1 || '%'
              OR EXISTS (SELECT 1 FROM unnest(b.genres) g WHERE g ILIKE '%' || $1 || '%')
            )
          ORDER BY e.id, relevance DESC
        ) sub
        ORDER BY relevance DESC
        LIMIT $2
      `;

      const result = await this.db.query(sql, [query, limit]);

      return this.mapDbEventsWithHeadliner(result.rows);
    } catch (error) {
      console.error('Search events error:', error);
      throw error;
    }
  }

  // ============================================
  // Private helper methods
  // ============================================

  /**
   * For list queries: fetch headliner band for each event and map to Event.
   * This keeps list queries efficient (single query + one headliner fetch).
   */
  async mapDbEventsWithHeadliner(rows: any[]): Promise<Event[]> {
    if (rows.length === 0) return [];

    const eventIds = rows.map((r: any) => r.id);

    // Batch fetch headliner bands for all events
    const lineupQuery = `
      SELECT
        el.event_id, el.id, el.band_id, el.set_order, el.set_time, el.is_headliner,
        b.id as b_id, b.name as band_name, b.genre as band_genre,
        b.image_url as band_image
      FROM event_lineup el
      LEFT JOIN bands b ON el.band_id = b.id
      WHERE el.event_id = ANY($1)
      ORDER BY el.set_order ASC
    `;

    const lineupResult = await this.db.query(lineupQuery, [eventIds]);

    // Group lineup entries by event_id
    const lineupByEvent: Record<string, any[]> = {};
    for (const row of lineupResult.rows) {
      if (!lineupByEvent[row.event_id]) {
        lineupByEvent[row.event_id] = [];
      }
      lineupByEvent[row.event_id].push(row);
    }

    return rows.map((row: any) => {
      const eventLineup = lineupByEvent[row.id] || [];
      return this.mapDbEventToEvent(
        row,
        eventLineup,
        parseInt(row.checkin_count || '0')
      );
    });
  }

  /**
   * Map database event row + lineup rows to Event type.
   * Includes backward-compat fields: bandId, band, showDate.
   */
  private mapDbEventToEvent(
    row: any,
    lineupRows: any[],
    checkinCount: number
  ): Event {
    // Build lineup entries
    const lineup: EventLineupEntry[] = lineupRows.map((lr: any) => ({
      id: lr.id,
      bandId: lr.band_id,
      setOrder: lr.set_order,
      setTime: lr.set_time,
      isHeadliner: lr.is_headliner || false,
      band: lr.band_name ? {
        id: lr.band_id,
        name: lr.band_name,
        genre: lr.band_genre,
        imageUrl: lr.band_image,
      } : undefined,
    }));

    // Find headliner (or first band) for backward compat
    const headliner = lineup.find(l => l.isHeadliner) || lineup[0];

    return {
      id: row.id,
      venueId: row.venue_id,
      eventDate: row.event_date,
      eventName: row.event_name,
      description: row.description,
      doorsTime: row.doors_time,
      startTime: row.start_time,
      endTime: row.end_time,
      ticketUrl: row.ticket_url,
      ticketPriceMin: row.ticket_price_min ? parseFloat(row.ticket_price_min) : undefined,
      ticketPriceMax: row.ticket_price_max ? parseFloat(row.ticket_price_max) : undefined,
      isSoldOut: row.is_sold_out || false,
      isCancelled: row.is_cancelled || false,
      eventType: row.event_type || 'concert',
      source: row.source || 'user_created',
      status: row.status || 'active',
      externalId: row.external_id,
      createdByUserId: row.created_by_user_id,
      isVerified: row.is_verified || false,
      totalCheckins: parseInt(row.total_checkins || '0'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      venue: row.venue_name ? {
        id: row.venue_id,
        name: row.venue_name,
        city: row.venue_city,
        state: row.venue_state,
        imageUrl: row.venue_image,
      } : undefined,
      lineup,
      checkinCount,
      // Backward-compat fields for mobile app
      bandId: headliner?.bandId,
      band: headliner?.band,
      showDate: row.event_date,
    };
  }
}
