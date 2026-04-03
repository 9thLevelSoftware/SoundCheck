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
 *
 * @deprecated Use EventSyncOrchestrator from './eventsync/' instead. This class is maintained
 * for backward compatibility and delegates to the new decomposed services.
 */

import { EventSyncOrchestrator, RegionSyncService, SyncLogService } from './eventsync';
import { BandMatcher } from './BandMatcher';
import { EventService } from './EventService';
import { TicketmasterEvent } from '../types/ticketmaster';
import logger from '../utils/logger';

export class EventSyncService {
  private orchestrator: EventSyncOrchestrator;

  constructor() {
    // Initialize decomposed services
    const regionSync = new RegionSyncService();
    const syncLog = new SyncLogService();
    const bandMatcher = new BandMatcher();
    const eventService = new EventService();

    this.orchestrator = new EventSyncOrchestrator(regionSync, syncLog, bandMatcher, eventService);
  }

  /**
   * Run the full sync pipeline for all active regions (or a single region).
   * @deprecated Use EventSyncOrchestrator.runSync() directly
   */
  async runSync(regionId?: string): Promise<void> {
    logger.warn('[EventSyncService] runSync() is deprecated. Use EventSyncOrchestrator.runSync()');
    const result = await this.orchestrator.runSync(regionId);
    if (!result.success) {
      throw new Error(result.error || 'Sync failed');
    }
  }

  /**
   * Ingest a single Ticketmaster event on-demand.
   * @deprecated Use EventSyncOrchestrator.ingestSingleEvent() directly
   */
  async ingestSingleEvent(tmEvent: TicketmasterEvent): Promise<string | null> {
    logger.warn(
      '[EventSyncService] ingestSingleEvent() is deprecated. Use EventSyncOrchestrator.ingestSingleEvent()'
    );
    return this.orchestrator.ingestSingleEvent(tmEvent);
  }
}
