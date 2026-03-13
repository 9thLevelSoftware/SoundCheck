import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 042: Add earned_checkin_id to user_badges
 *
 * The seed flow and canonical schema both store the checkin that earned a
 * badge, but some environments were created without the column. Restore it
 * so demo seeding and future badge attribution remain consistent.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE user_badges
    ADD COLUMN IF NOT EXISTS earned_checkin_id UUID REFERENCES checkins(id) ON DELETE SET NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE user_badges
    DROP COLUMN IF EXISTS earned_checkin_id;
  `);
}
