import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 022: Add search and upcoming event indexes
 *
 * - GIN trigram index on events.event_name for fast fuzzy text search
 * - Composite partial index on events(event_date, is_cancelled) for upcoming event queries
 *
 * Phase 7: Discovery & Recommendations (Plan 1)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Enable pg_trgm extension if not already enabled (required for gin_trgm_ops)
  pgm.sql('CREATE EXTENSION IF NOT EXISTS pg_trgm;');

  // GIN trigram index for fuzzy search on event names
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_events_name_trgm ON events USING gin (event_name gin_trgm_ops);'
  );

  // Composite partial index for fast upcoming event lookups
  pgm.sql(
    'CREATE INDEX IF NOT EXISTS idx_events_upcoming ON events (event_date, is_cancelled) WHERE is_cancelled = FALSE;'
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS idx_events_upcoming;');
  pgm.sql('DROP INDEX IF EXISTS idx_events_name_trgm;');
}
