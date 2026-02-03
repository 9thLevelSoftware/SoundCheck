import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 013: Add external_id + source to bands
 *
 * Enables deduplication of bands from external sources (Ticketmaster attractions).
 * Uses a partial unique index so that multiple rows with NULL external_id
 * are allowed (user-created or legacy bands).
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN
      -- Add external_id column if not present
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bands' AND column_name = 'external_id'
      ) THEN
        ALTER TABLE bands ADD COLUMN external_id VARCHAR(255);
      END IF;

      -- Add source column if not present
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bands' AND column_name = 'source'
      ) THEN
        ALTER TABLE bands ADD COLUMN source VARCHAR(50);
      END IF;
    END $$;
  `);

  // Partial unique index: (source, external_id) WHERE external_id IS NOT NULL
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bands_source_external_id
    ON bands (source, external_id)
    WHERE external_id IS NOT NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS idx_bands_source_external_id;');
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bands' AND column_name = 'external_id'
      ) THEN
        ALTER TABLE bands DROP COLUMN external_id;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bands' AND column_name = 'source'
      ) THEN
        ALTER TABLE bands DROP COLUMN source;
      END IF;
    END $$;
  `);
}
