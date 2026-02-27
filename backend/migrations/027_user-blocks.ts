import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 027: Create user_blocks table
 *
 * Bilateral user blocking for Trust & Safety. When user A blocks user B,
 * B's content is hidden from A's feeds, and interactions are prevented
 * in both directions.
 *
 * Phase 9: Trust & Safety Foundation
 *
 * Constraints:
 *   - UNIQUE(blocker_id, blocked_id): prevent duplicate blocks
 *   - CHECK(blocker_id != blocked_id): prevent self-blocking
 *
 * Indexes:
 *   - blocker_id: "who have I blocked?" queries
 *   - blocked_id: "who has blocked me?" queries (for feed filtering)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_blocks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blocker_id, blocked_id),
      CHECK(blocker_id != blocked_id)
    );
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS user_blocks CASCADE;');
}
