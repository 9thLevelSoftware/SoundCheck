import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 046: Performance indexes
 *
 * CFR-DB-007: Composite index for feed cursor pagination (created_at DESC, id DESC)
 * CFR-PERF-003: Composite index for badge user lookup (user_id, earned_at DESC)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // CFR-DB-007: Feed cursor pagination index
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkins_created_id
    ON checkins (created_at DESC, id DESC);
  `);

  // CFR-PERF-003: Feed EXISTS subquery optimization
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_badges_user_earned
    ON user_badges (user_id, earned_at DESC);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS idx_checkins_created_id;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_user_badges_user_earned;`);
}
