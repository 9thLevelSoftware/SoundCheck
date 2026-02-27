import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 031: Add partial indexes for is_hidden content filtering
 *
 * Partial indexes on is_hidden = true rows allow the query planner to
 * efficiently skip hidden content in feed and check-in queries.
 * Complements migration 030 which added the is_hidden columns.
 *
 * Phase 9.1: Content Moderation Enforcement (Plan 01)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_checkins_hidden
      ON checkins (id) WHERE is_hidden = true;
  `);
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_comments_hidden
      ON checkin_comments (id) WHERE is_hidden = true;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS idx_checkins_hidden;');
  pgm.sql('DROP INDEX IF EXISTS idx_comments_hidden;');
}
