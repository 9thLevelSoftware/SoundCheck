/**
 * EventSyncOrchestrator -- Main coordination for event sync pipeline
 *
 * Extracted from EventSyncService as part of P1 service decomposition.
 * Coordinates the full Ticketmaster event ingestion pipeline:
 *   1. Load active sync regions via SyncLogService
 *   2. Fetch events from Ticketmaster via RegionSyncService
 *   3. Deduplicate via UPSERT on (source, external_id)
 *   4. Match/create bands via BandMatcher cascade
 *   5. Match/create venues via BandMatcher venue upsert
 *   6. Upsert event_lineup entries
 *   7. Detect status changes and notify affected users
 *   8. Log sync run via SyncLogService
 *
 * Graceful degradation:
 *   - Returns immediately if TICKETMASTER_API_KEY is not set
 *   - Per-event try/catch prevents one bad event from killing the sync
 *   - Per-region try/catch prevents one failed region from stopping others
 */

import { BandMatcher } from '../BandMatcher';
import { EventService } from '../EventService';
import { NotificationService } from '../NotificationService';
import logger from '../../utils/logger';
import { SyncLogService, SyncCounters, SyncRegion } from './SyncLogService';
import { RegionSyncService, RegionSyncResult } from './RegionSyncService';
import { NormalizedEvent } from '../../types/ticketmaster';
import Database from '../../config/database';

export interface SyncResult {
  success: boolean;
  eventsCreated: number;
  eventsUpdated: number;
  eventsSkipped: number;
  regionsProcessed: number;
  error?: string;
}

export class EventSyncOrchestrator {
  private db = Database.getInstance();

  constructor(
    private regionSync: RegionSyncService,
    private syncLog: SyncLogService,
    private bandMatcher: BandMatcher,
    private eventService: EventService,
    private notificationService: NotificationService = new NotificationService()
  ) {}

  /**
   * Run the full sync pipeline for all active regions (or a single region).
   *
   * Creates a sync log entry, processes each region, and updates
   * the log with final counts and status.
   */
  async runSync(regionId?: string): Promise<SyncResult> {
    if (!this.regionSync.isConfigured()) {
      logger.info('[EventSyncOrchestrator] Sync skipped: Ticketmaster API key not configured');
      return {
        success: true,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsSkipped: 0,
        regionsProcessed: 0,
      };
    }

    // Create sync log entry
    const logEntry = await this.syncLog.startSync(regionId);
    const counters = this.syncLog.getEmptyCounters();

    let regionsProcessed = 0;

    try {
      // Load sync regions
      const regions = await this.syncLog.loadSyncRegions(regionId);

      if (regions.length === 0) {
        logger.warn(
          '[EventSyncOrchestrator] No active sync regions found. Configure sync_regions to enable event sync.'
        );
        await this.syncLog.completeSync(logEntry.id, counters, 'completed');
        return {
          success: true,
          eventsCreated: 0,
          eventsUpdated: 0,
          eventsSkipped: 0,
          regionsProcessed: 0,
        };
      }

      logger.info(`[EventSyncOrchestrator] Starting sync for ${regions.length} region(s)`);

      // Process each region
      for (const region of regions) {
        try {
          const regionResult = await this.syncRegion(region, counters);
          regionsProcessed++;

          // Update region's last_synced_at
          await this.syncLog.updateRegionLastSynced(region.id);

          logger.info(`[EventSyncOrchestrator] Completed sync for region: ${region.label}`, {
            eventsFetched: regionResult.eventsFetched,
          });
        } catch (regionErr) {
          logger.error(`[EventSyncOrchestrator] Failed to sync region: ${region.label}`, {
            regionId: region.id,
            error: (regionErr as Error).message,
          });
          // Continue with next region
        }
      }

      // Complete sync log
      await this.syncLog.completeSync(logEntry.id, counters, 'completed');

      logger.info('[EventSyncOrchestrator] Sync completed', {
        ...counters,
        regions: regions.length,
      });

      return {
        success: true,
        eventsCreated: counters.events_created,
        eventsUpdated: counters.events_updated,
        eventsSkipped: counters.events_skipped,
        regionsProcessed,
      };
    } catch (err) {
      // Fatal error -- update log with failure
      const errorMessage = (err as Error).message || 'Unknown error';
      logger.error('[EventSyncOrchestrator] Sync pipeline failed', { error: errorMessage });

      await this.syncLog.completeSync(logEntry.id, counters, 'failed', errorMessage);

      return {
        success: false,
        eventsCreated: counters.events_created,
        eventsUpdated: counters.events_updated,
        eventsSkipped: counters.events_skipped,
        regionsProcessed,
        error: errorMessage,
      };
    }
  }

  /**
   * Sync events for a single geographic region.
   */
  private async syncRegion(region: SyncRegion, counters: SyncCounters): Promise<RegionSyncResult> {
    const { events, eventsFetched } = await this.regionSync.fetchEventsForRegion(region);

    counters.events_fetched += eventsFetched;

    // Process each event
    for (const event of events) {
      try {
        await this.processEvent(event, counters);
      } catch (eventErr) {
        logger.error(`[EventSyncOrchestrator] Failed to process event: ${event.name}`, {
          externalId: event.externalId,
          error: (eventErr as Error).message,
        });
        counters.events_skipped++;
      }
    }

    return { events, eventsFetched };
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
    counters?: SyncCounters
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
        attraction.imageUrl || undefined
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
      event.date
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
          [existingUserEvent, bandIds[i].bandId, i, i === 0]
        );
      }

      if (counters) {
        counters.events_updated++;
      }

      logger.info(
        '[EventSyncOrchestrator] Auto-merged Ticketmaster data into user-created event',
        {
          userEventId: existingUserEvent,
          externalId: event.externalId,
          eventName: event.name,
        }
      );

      return existingUserEvent;
    }

    // Step 4: Check existing event status before upsert (for status change detection)
    const existingResult = await this.db.query(
      `SELECT id, status FROM events WHERE source = 'ticketmaster' AND external_id = $1`,
      [event.externalId]
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
      ]
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
        [eventId, bandIds[i].bandId, i, i === 0]
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
    oldStatus: string
  ): Promise<void> {
    if (newStatus === oldStatus) return;

    logger.info(`[EventSyncOrchestrator] Event status changed: ${oldStatus} -> ${newStatus}`, {
      eventId,
    });

    // Only notify for meaningful status changes
    if (newStatus !== 'cancelled' && newStatus !== 'rescheduled') {
      return;
    }

    try {
      // Find users who checked in to this event
      const checkinUsers = await this.db.query(
        `SELECT DISTINCT user_id FROM checkins WHERE event_id = $1`,
        [eventId]
      );

      if (checkinUsers.rows.length === 0) return;

      logger.info(
        `[EventSyncOrchestrator] Notifying ${checkinUsers.rows.length} users of status change`,
        {
          eventId,
          newStatus,
        }
      );

      // Create notification for each affected user
      for (const row of checkinUsers.rows) {
        try {
          await this.notificationService.createNotification({
            userId: row.user_id,
            type: `event_${newStatus}` as 'event_cancelled' | 'event_rescheduled',
            title: `Event ${newStatus}`,
            message: `An event you checked in to has been ${newStatus}.`,
            eventId,
          });
        } catch (notifErr) {
          logger.error('[EventSyncOrchestrator] Failed to create notification', {
            userId: row.user_id,
            eventId,
            error: (notifErr as Error).message,
          });
        }
      }
    } catch (err) {
      logger.error('[EventSyncOrchestrator] Failed to handle status change notifications', {
        eventId,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Ingest a single Ticketmaster event on-demand.
   * Delegates to RegionSyncService for normalization and EventService for processing.
   */
  async ingestSingleEvent(tmEvent: any): Promise<string | null> {
    const normalized = await this.regionSync.ingestSingleEvent(tmEvent);
    if (!normalized) return null;
    return this.processEvent(normalized);
  }
}
