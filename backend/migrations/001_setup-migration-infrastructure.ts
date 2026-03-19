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
  // Intentional no-op (DB-022): Dropping pg_trgm could break other
  // migrations/indexes that depend on it. The conditional table cleanup
  // in up() is also not reversible -- recreating the wrong-schema events
  // table would cause more harm than good. This is by design.
}
