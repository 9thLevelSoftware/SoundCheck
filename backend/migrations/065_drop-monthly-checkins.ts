import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * bands.monthly_checkins was added and never updated. Drop it.
 * A new migration avoids rewriting 047, which has already been applied.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('ALTER TABLE bands DROP COLUMN IF EXISTS monthly_checkins;');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE bands
      ADD COLUMN IF NOT EXISTS monthly_checkins INTEGER NOT NULL DEFAULT 0;
  `);
}
