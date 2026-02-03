import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 012: Add external_id + source to venues
 *
 * Enables deduplication of venues from external sources (Ticketmaster, etc.).
 * Uses a partial unique index so that multiple rows with NULL external_id
 * are allowed (user-created venues have no external ID).
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN
      -- Add external_id column if not present
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'venues' AND column_name = 'external_id'
      ) THEN
        ALTER TABLE venues ADD COLUMN external_id VARCHAR(255);
      END IF;

      -- Add source column if not present
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'venues' AND column_name = 'source'
      ) THEN
        ALTER TABLE venues ADD COLUMN source VARCHAR(50);
      END IF;
    END $$;
  `);

  // Partial unique index: (source, external_id) WHERE external_id IS NOT NULL
  // This allows multiple NULLs (user-created venues) while preventing
  // duplicate external IDs from the same source.
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_source_external_id
    ON venues (source, external_id)
    WHERE external_id IS NOT NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS idx_venues_source_external_id;');
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'venues' AND column_name = 'external_id'
      ) THEN
        ALTER TABLE venues DROP COLUMN external_id;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'venues' AND column_name = 'source'
      ) THEN
        ALTER TABLE venues DROP COLUMN source;
      END IF;
    END $$;
  `);
}
