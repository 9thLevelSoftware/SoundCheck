/**
 * Event Sync Pipeline Orchestrator
 *
 * Coordinates the full Ticketmaster event ingestion pipeline:
 *   1. Load active sync regions
 *   2. Fetch events from Ticketmaster for each region
 *   3. Deduplicate via UPSERT on (source, external_id)
 *   4. Match/create bands via BandMatcher cascade
 *   5. Match/create venues via BandMatcher venue upsert
 *   6. Upsert event_lineup entries
 *   7. Detect status changes and notify affected users
 *   8. Log sync run to event_sync_log
 *
 * Graceful degradation:
 *   - Returns immediately if TICKETMASTER_API_KEY is not set
 *   - Per-event try/catch prevents one bad event from killing the sync
 *   - Per-region try/catch prevents one failed region from stopping others
 */

import Database from '../config/database';
import { TicketmasterAdapter } from './TicketmasterAdapter';
import { BandMatcher } from './BandMatcher';
import { EventService } from './EventService';
import { NormalizedEvent, TicketmasterEvent } from '../types/ticketmaster';

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    console.log(`[EventSyncService] ${msg}`, meta || ''),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    console.warn(`[EventSyncService] ${msg}`, meta || ''),
  error: (msg: string, meta?: Record<string, unknown>) =>
    console.error(`[EventSyncService] ${msg}`, meta || ''),
};

interface SyncCounters {
  events_fetched: number;
  events_created: number;
  events_updated: number;
  events_skipped: number;
  bands_created: number;
  bands_matched: number;
  venues_created: number;
}

interface SyncRegion {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radius_miles: number;
}

export class EventSyncService {
  private db = Database.getInstance();
  private bandMatcher = new BandMatcher();
  private eventService = new EventService();
  private adapter: TicketmasterAdapter | null = null;
  private apiKeyConfigured: boolean;

  constructor() {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    this.apiKeyConfigured = !!apiKey;

    if (!this.apiKeyConfigured) {
      logger.info('TICKETMASTER_API_KEY not configured. Sync pipeline is disabled.');
    } else {
      try {
        this.adapter = new TicketmasterAdapter();
      } catch (err) {
        logger.error('Failed to initialize TicketmasterAdapter', {
          error: (err as Error).message,
        });
        this.apiKeyConfigured = false;
      }
    }
  }

  /**
   * Run the full sync pipeline for all active regions (or a single region).
   *
   * Creates an event_sync_log entry, processes each region, and updates
   * the log with final counts and status.
   */
  async runSync(regionId?: string): Promise<void> {
    if (!this.apiKeyConfigured || !this.adapter) {
      logger.info('Sync skipped: Ticketmaster API key not configured');
      return;
    }

    // Create sync log entry
    const logResult = await this.db.query(
      `INSERT INTO event_sync_log (status, started_at)
       VALUES ('running', CURRENT_TIMESTAMP)
       RETURNING id`,
    );
    const syncLogId = logResult.rows[0].id;

    const counters: SyncCounters = {
      events_fetched: 0,
      events_created: 0,
      events_updated: 0,
      events_skipped: 0,
      bands_created: 0,
      bands_matched: 0,
      venues_created: 0,
    };

    try {
      // Load sync regions
      const regions = await this.loadSyncRegions(regionId);

      if (regions.length === 0) {
        logger.warn('No active sync regions found. Configure sync_regions to enable event sync.');
        await this.completeSyncLog(syncLogId, 'completed', counters);
        return;
      }

      logger.info(`Starting sync for ${regions.length} region(s)`);

      // Process each region
      for (const region of regions) {
        try {
          await this.syncRegion(region, counters);

          // Update region's last_synced_at
          await this.db.query(
            `UPDATE sync_regions SET last_synced_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [region.id],
          );
        } catch (regionErr) {
          logger.error(`Failed to sync region: ${region.label}`, {
            regionId: region.id,
            error: (regionErr as Error).message,
          });
          // Continue with next region
        }
      }

      // Complete sync log
      await this.completeSyncLog(syncLogId, 'completed', counters);

      logger.info('Sync completed', {
        ...counters,
        regions: regions.length,
      });
    } catch (err) {
      // Fatal error -- update log with failure
      const errorMessage = (err as Error).message || 'Unknown error';
      logger.error('Sync pipeline failed', { error: errorMessage });

      await this.completeSyncLog(syncLogId, 'failed', counters, errorMessage);
    }
  }

  /**
   * Ingest a single Ticketmaster event on-demand.
   *
   * Used by Plan 03 for on-demand lookups when a user interacts
   * with an event outside synced coverage. Normalizes the raw TM
   * event, resolves venue+bands, and upserts event+lineup.
   *
   * Returns the database event ID or null if the event has no venue.
   */
  async ingestSingleEvent(tmEvent: TicketmasterEvent): Promise<string | null> {
    if (!this.adapter) {
      // Even without the adapter, we can still normalize and ingest
      // as long as we have a TicketmasterAdapter instance for normalization
      const tempAdapter = new TicketmasterAdapter();
      const normalized = tempAdapter.normalizeEvent(tmEvent);
      if (!normalized) return null;
      return this.processEvent(normalized);
    }

    const normalized = this.adapter.normalizeEvent(tmEvent);
    if (!normalized) return null;
    return this.processEvent(normalized);
  }

  // ─── Private Methods ──────────────────────────────────────────────

  /**
   * Load active sync regions from the database.
   * If regionId is provided, loads only that specific region.
   */
  private async loadSyncRegions(regionId?: string): Promise<SyncRegion[]> {
    if (regionId) {
      const result = await this.db.query(
        `SELECT id, label, latitude, longitude, radius_miles
         FROM sync_regions
         WHERE id = $1 AND is_active = true`,
        [regionId],
      );
      return result.rows;
    }

    const result = await this.db.query(
      `SELECT id, label, latitude, longitude, radius_miles
       FROM sync_regions
       WHERE is_active = true
       ORDER BY last_synced_at ASC NULLS FIRST`,
    );
    return result.rows;
  }

  /**
   * Sync events for a single geographic region.
   *
   * Builds a 30-day date window, fetches all events from Ticketmaster,
   * and processes each one (venue match, band match, event upsert, lineup).
   */
  private async syncRegion(region: SyncRegion, counters: SyncCounters): Promise<void> {
    const latlong = `${region.latitude},${region.longitude}`;

    // Build date window: today to today + 30 days
    const now = new Date();
    const startDate = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');

    logger.info(`Fetching events for region: ${region.label}`, {
      latlong,
      radius: region.radius_miles,
      startDate,
      endDate,
    });

    const events = await this.adapter!.fetchAllEventsForRegion(
      latlong,
      region.radius_miles,
      startDate,
      endDate,
    );

    counters.events_fetched += events.length;

    logger.info(`Fetched ${events.length} events for region: ${region.label}`);

    // Process each event
    for (const event of events) {
      try {
        await this.processEvent(event, counters);
      } catch (eventErr) {
        logger.error(`Failed to process event: ${event.name}`, {
          externalId: event.externalId,
          error: (eventErr as Error).message,
        });
        counters.events_skipped++;
      }
    }
  }

  /**
   * Process a single normalized event:
   *   1. Resolve venue via BandMatcher
   *   2. Resolve bands via BandMatcher
   *   3. Upsert event (dedup on source + external_id)
   *   4. Upsert lineup entries
   *   5. Detect status changes
   *
   * Returns the event ID from the database.
   */
  private async processEvent(
    event: NormalizedEvent,
    counters?: SyncCounters,
  ): Promise<string | null> {
    // Step 1: Resolve venue
    const venueResult = await this.bandMatcher.matchOrCreateVenue(event.venue);
    if (counters && venueResult.isNew) {
      counters.venues_created++;
    }

    // Step 2: Resolve bands
    const bandIds: Array<{ bandId: string; isNew: boolean }> = [];
    for (const attraction of event.attractions) {
      const bandResult = await this.bandMatcher.matchOrCreateBand(
        attraction.name,
        attraction.externalId,
        attraction.genre || undefined,
        attraction.imageUrl || undefined,
      );
      bandIds.push({
        bandId: bandResult.bandId,
        isNew: bandResult.matchType === 'created',
      });
      if (counters) {
        if (bandResult.matchType === 'created') {
          counters.bands_created++;
        } else {
          counters.bands_matched++;
        }
      }
    }

    // Step 3: Auto-merge check -- if a user-created event exists at the same
    // venue+date, merge Ticketmaster data into it rather than creating a duplicate
    const existingUserEvent = await this.eventService.findUserCreatedEventAtVenueDate(
      venueResult.venueId,
      event.date,
    );
    if (existingUserEvent) {
      await this.eventService.mergeTicketmasterIntoUserEvent(existingUserEvent, {
        externalId: event.externalId,
        eventName: event.name,
        ticketUrl: event.ticketUrl,
        priceMin: event.priceMin,
        priceMax: event.priceMax,
        status: event.status,
      });

      // Upsert lineup entries for the merged event
      for (let i = 0; i < bandIds.length; i++) {
        await this.db.query(
          `INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (event_id, band_id) DO NOTHING`,
          [existingUserEvent, bandIds[i].bandId, i, i === 0],
        );
      }

      if (counters) {
        counters.events_updated++;
      }

      logger.info('Auto-merged Ticketmaster data into user-created event', {
        userEventId: existingUserEvent,
        externalId: event.externalId,
        eventName: event.name,
      });

      return existingUserEvent;
    }

    // Step 4: Check existing event status before upsert (for status change detection)
    const existingResult = await this.db.query(
      `SELECT id, status FROM events WHERE source = 'ticketmaster' AND external_id = $1`,
      [event.externalId],
    );
    const oldStatus = existingResult.rows.length > 0 ? existingResult.rows[0].status : null;

    // Step 5: Upsert event
    const upsertResult = await this.db.query(
      `INSERT INTO events (
        venue_id, event_date, event_name, start_time,
        ticket_url, ticket_price_min, ticket_price_max,
        source, external_id, is_verified, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ticketmaster', $8, true, $9)
      ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL
      DO UPDATE SET
        event_name = EXCLUDED.event_name,
        ticket_url = EXCLUDED.ticket_url,
        ticket_price_min = EXCLUDED.ticket_price_min,
        ticket_price_max = EXCLUDED.ticket_price_max,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, (xmax = 0) AS is_new`,
      [
        venueResult.venueId,
        event.date,
        event.name,
        event.startTime,
        event.ticketUrl,
        event.priceMin,
        event.priceMax,
        event.externalId,
        event.status,
      ],
    );

    const eventId = upsertResult.rows[0].id;
    const isNew = upsertResult.rows[0].is_new;

    if (counters) {
      if (isNew) {
        counters.events_created++;
      } else {
        counters.events_updated++;
      }
    }

    // Step 6: Upsert lineup entries
    for (let i = 0; i < bandIds.length; i++) {
      await this.db.query(
        `INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (event_id, band_id) DO NOTHING`,
        [eventId, bandIds[i].bandId, i, i === 0],
      );
    }

    // Step 7: Detect status changes and notify users
    if (oldStatus && oldStatus !== event.status) {
      await this.handleStatusChange(eventId, event.status, oldStatus);
    }

    return eventId;
  }

  /**
   * Handle event status changes (cancellation, rescheduling).
   *
   * When an event's status changes to 'cancelled' or 'rescheduled',
   * notify all users who have checked in to the event.
   */
  private async handleStatusChange(
    eventId: string,
    newStatus: string,
    oldStatus: string,
  ): Promise<void> {
    if (newStatus === oldStatus) return;

    logger.info(`Event status changed: ${oldStatus} -> ${newStatus}`, { eventId });

    // Only notify for meaningful status changes
    if (newStatus !== 'cancelled' && newStatus !== 'rescheduled') {
      return;
    }

    try {
      // Find users who checked in to this event
      const checkinUsers = await this.db.query(
        `SELECT DISTINCT user_id FROM checkins WHERE event_id = $1`,
        [eventId],
      );

      if (checkinUsers.rows.length === 0) return;

      logger.info(`Notifying ${checkinUsers.rows.length} users of status change`, {
        eventId,
        newStatus,
      });

      // Create notification for each affected user
      for (const row of checkinUsers.rows) {
        try {
          await this.db.query(
            `INSERT INTO notifications (
              user_id, type, title, message, event_id
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
              row.user_id,
              `event_${newStatus}`,
              `Event ${newStatus}`,
              `An event you checked in to has been ${newStatus}.`,
              eventId,
            ],
          );
        } catch (notifErr) {
          logger.error('Failed to create notification', {
            userId: row.user_id,
            eventId,
            error: (notifErr as Error).message,
          });
        }
      }
    } catch (err) {
      logger.error('Failed to handle status change notifications', {
        eventId,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Update the sync log entry with final status and counters.
   */
  private async completeSyncLog(
    syncLogId: string,
    status: 'completed' | 'failed',
    counters: SyncCounters,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await this.db.query(
        `UPDATE event_sync_log SET
          status = $1,
          events_fetched = $2,
          events_created = $3,
          events_updated = $4,
          events_skipped = $5,
          bands_created = $6,
          bands_matched = $7,
          venues_created = $8,
          error_message = $9,
          completed_at = CURRENT_TIMESTAMP
        WHERE id = $10`,
        [
          status,
          counters.events_fetched,
          counters.events_created,
          counters.events_updated,
          counters.events_skipped,
          counters.bands_created,
          counters.bands_matched,
          counters.venues_created,
          errorMessage || null,
          syncLogId,
        ],
      );
    } catch (err) {
      logger.error('Failed to update sync log', {
        syncLogId,
        error: (err as Error).message,
      });
    }
  }
}
