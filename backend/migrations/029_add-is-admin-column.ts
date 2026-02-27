import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 029: Add is_admin column to users table
 *
 * The User TypeScript interface already has `isAdmin?: boolean` and the
 * requireAdmin middleware checks `req.user?.isAdmin`, but the column was
 * never added to the database. This means the admin middleware can never
 * pass because mapDbUserToUser never receives is_admin from the DB row.
 *
 * Phase 9: Trust & Safety Foundation (pre-existing bug fix)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN IF EXISTS is_admin;
  `);
}
