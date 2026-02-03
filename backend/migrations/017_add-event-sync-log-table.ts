import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 017: Create event_sync_log table
 *
 * Tracks sync run history for monitoring and debugging.
 * Each row is one sync run (scheduled or on-demand) with counters
 * for events fetched/created/updated/skipped and bands matched/created.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'event_sync_log'
      ) THEN
        CREATE TABLE event_sync_log (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          region_id UUID REFERENCES sync_regions(id) ON DELETE SET NULL,
          job_id VARCHAR(255),
          status VARCHAR(20) NOT NULL,
          events_fetched INTEGER DEFAULT 0,
          events_created INTEGER DEFAULT 0,
          events_updated INTEGER DEFAULT 0,
          events_skipped INTEGER DEFAULT 0,
          bands_created INTEGER DEFAULT 0,
          bands_matched INTEGER DEFAULT 0,
          venues_created INTEGER DEFAULT 0,
          api_calls_made INTEGER DEFAULT 0,
          error_message TEXT,
          started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMPTZ
        );

        CREATE INDEX idx_event_sync_log_started_at ON event_sync_log (started_at);
        CREATE INDEX idx_event_sync_log_status ON event_sync_log (status);
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('event_sync_log', { ifExists: true, cascade: true });
}
