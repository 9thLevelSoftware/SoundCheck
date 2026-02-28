import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 034: tsvector Search Columns + GIN Indexes
 *
 * Adds GENERATED ALWAYS AS ... STORED tsvector columns to:
 * 1. bands — weighted: name(A), genre(B), hometown(C), description(D)
 * 2. venues — weighted: name(A), city(B), state(C), description(D)
 * 3. events — weighted: event_name(A)
 *
 * GIN indexes enable fast full-text search via @@ operator.
 * STORED (not VIRTUAL) is required because GIN indexes need materialized data.
 *
 * Phase 11: Platform Trust & Between-Show Retention (Plan 01)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add search_vector to bands
  pgm.sql(`
    ALTER TABLE bands ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(genre, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(hometown, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'D')
      ) STORED;
  `);

  // 2. Add search_vector to venues
  pgm.sql(`
    ALTER TABLE venues ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(city, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(state, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(description, '')), 'D')
      ) STORED;
  `);

  // 3. Add search_vector to events
  pgm.sql(`
    ALTER TABLE events ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', COALESCE(event_name, '')), 'A')
      ) STORED;
  `);

  // 4. Create GIN indexes for fast full-text search
  pgm.sql(`CREATE INDEX idx_bands_search_vector ON bands USING GIN (search_vector);`);
  pgm.sql(`CREATE INDEX idx_venues_search_vector ON venues USING GIN (search_vector);`);
  pgm.sql(`CREATE INDEX idx_events_search_vector ON events USING GIN (search_vector);`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Dropping columns automatically drops dependent indexes
  pgm.sql(`ALTER TABLE events DROP COLUMN IF EXISTS search_vector;`);
  pgm.sql(`ALTER TABLE venues DROP COLUMN IF EXISTS search_vector;`);
  pgm.sql(`ALTER TABLE bands DROP COLUMN IF EXISTS search_vector;`);
}
