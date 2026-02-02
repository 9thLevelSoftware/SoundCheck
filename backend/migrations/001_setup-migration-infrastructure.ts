import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 001: Setup migration infrastructure
 *
 * - Enable pg_trgm extension (needed for Phase 2 band name matching)
 * - Detect and clean up the old events table from migrate-events-model.ts
 *   which has band_id directly (wrong schema) instead of lineup junction table
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Enable pg_trgm extension for fuzzy text matching (Phase 2)
  pgm.sql('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

  // Detect and handle the old events table from migrate-events-model.ts.
  // If an events table exists AND has a band_id column (wrong schema),
  // drop it along with checkin_toasts which was also created by that script.
  // The correct checkin_comments from database-schema.sql references checkins
  // (which still exists), so it will not be affected.
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'band_id'
      ) THEN
        DROP TABLE IF EXISTS checkin_toasts CASCADE;
        DROP TABLE IF EXISTS events CASCADE;
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // No-op: cannot un-detect old schema or un-enable an extension safely.
  // pg_trgm is harmless to leave enabled.
}
