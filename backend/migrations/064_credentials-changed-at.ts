import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Record when a user's credentials last changed so access tokens issued
 * before that second can be rejected. NULL means no password change yet.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS credentials_changed_at TIMESTAMPTZ;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN IF EXISTS credentials_changed_at;
  `);
}
