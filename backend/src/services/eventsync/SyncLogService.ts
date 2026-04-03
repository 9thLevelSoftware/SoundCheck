/**
 * SyncLogService -- Event sync logging and monitoring
 *
 * Extracted from EventSyncService as part of P1 service decomposition.
 * Handles:
 *   - Creating and updating sync log entries
 *   - Recording sync metrics and counters
 *   - Tracking sync status and errors
 */

import Database from '../../config/database';
import logger from '../../utils/logger';

export interface SyncCounters {
  events_fetched: number;
  events_created: number;
  events_updated: number;
  events_skipped: number;
  bands_created: number;
  bands_matched: number;
  venues_created: number;
}

export interface SyncLogEntry {
  id: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  eventsFetched: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsSkipped: number;
  bandsCreated: number;
  bandsMatched: number;
  venuesCreated: number;
  errorMessage?: string;
}

export interface SyncRegion {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radius_miles: number;
}

export class SyncLogService {
  private db = Database.getInstance();

  /**
   * Start a new sync log entry
   */
  async startSync(regionId?: string): Promise<SyncLogEntry> {
    const result = await this.db.query(
      `INSERT INTO event_sync_log (status, started_at, region_id)
       VALUES ('running', CURRENT_TIMESTAMP, $1)
       RETURNING id, status, started_at`,
      [regionId || null]
    );

    return {
      id: result.rows[0].id,
      status: result.rows[0].status,
      startedAt: result.rows[0].started_at,
      eventsFetched: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsSkipped: 0,
      bandsCreated: 0,
      bandsMatched: 0,
      venuesCreated: 0,
    };
  }

  /**
   * Update sync log with counters for a completed sync
   */
  async completeSync(
    syncLogId: string,
    counters: SyncCounters,
    status: 'completed' | 'failed' = 'completed',
    errorMessage?: string
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
        ]
      );
    } catch (err) {
      logger.error('[SyncLogService] Failed to update sync log', {
        syncLogId,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Mark a sync as failed with error message
   */
  async failSync(syncLogId: string, error: Error): Promise<void> {
    await this.completeSync(
      syncLogId,
      this.getEmptyCounters(),
      'failed',
      error.message
    );
  }

  /**
   * Load active sync regions from the database
   */
  async loadSyncRegions(regionId?: string): Promise<SyncRegion[]> {
    if (regionId) {
      const result = await this.db.query(
        `SELECT id, label, latitude, longitude, radius_miles
         FROM sync_regions
         WHERE id = $1 AND is_active = true`,
        [regionId]
      );
      return result.rows;
    }

    const result = await this.db.query(
      `SELECT id, label, latitude, longitude, radius_miles
       FROM sync_regions
       WHERE is_active = true
       ORDER BY last_synced_at ASC NULLS FIRST`
    );
    return result.rows;
  }

  /**
   * Update region's last_synced_at timestamp
   */
  async updateRegionLastSynced(regionId: string): Promise<void> {
    try {
      await this.db.query(
        `UPDATE sync_regions SET last_synced_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [regionId]
      );
    } catch (err) {
      logger.error('[SyncLogService] Failed to update region last_synced_at', {
        regionId,
        error: (err as Error).message,
      });
    }
  }

  /**
   * Get empty counters for initialization
   */
  getEmptyCounters(): SyncCounters {
    return {
      events_fetched: 0,
      events_created: 0,
      events_updated: 0,
      events_skipped: 0,
      bands_created: 0,
      bands_matched: 0,
      venues_created: 0,
    };
  }

  /**
   * Get recent sync logs for monitoring
   */
  async getRecentSyncLogs(limit: number = 10): Promise<SyncLogEntry[]> {
    const result = await this.db.query(
      `SELECT id, status, started_at, completed_at,
              events_fetched, events_created, events_updated, events_skipped,
              bands_created, bands_matched, venues_created, error_message
       FROM event_sync_log
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      eventsFetched: row.events_fetched,
      eventsCreated: row.events_created,
      eventsUpdated: row.events_updated,
      eventsSkipped: row.events_skipped,
      bandsCreated: row.bands_created,
      bandsMatched: row.bands_matched,
      venuesCreated: row.venues_created,
      errorMessage: row.error_message,
    }));
  }
}
