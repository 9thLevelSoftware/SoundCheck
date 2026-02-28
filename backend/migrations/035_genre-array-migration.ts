import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 035: Genre Array Migration
 *
 * Adds genres TEXT[] column to bands table and backfills from existing genre column.
 * The old genre VARCHAR(100) column is kept for backward compatibility.
 *
 * Handles both single genres ("Rock") and comma-separated values ("Rock, Metal")
 * via string_to_array splitting.
 *
 * Phase 11: Platform Trust & Between-Show Retention (Plan 01)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add genres TEXT[] column (nullable initially)
  pgm.sql(`
    ALTER TABLE bands ADD COLUMN genres TEXT[];
  `);

  // 2. Backfill from existing genre column
  // Handles single genres and potential comma-separated values
  pgm.sql(`
    UPDATE bands SET genres = CASE
      WHEN genre IS NOT NULL AND genre != ''
        THEN string_to_array(genre, ', ')
      ELSE ARRAY[]::TEXT[]
    END;
  `);

  // 3. Set default for future inserts
  pgm.sql(`
    ALTER TABLE bands ALTER COLUMN genres SET DEFAULT ARRAY[]::TEXT[];
  `);

  // 4. Create GIN index for array containment queries (@>, &&)
  pgm.sql(`
    CREATE INDEX idx_bands_genres ON bands USING GIN (genres);
  `);

  // Note: Do NOT drop the old genre column — backward compatibility during transition
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS idx_bands_genres;`);
  pgm.sql(`ALTER TABLE bands DROP COLUMN IF EXISTS genres;`);
}
