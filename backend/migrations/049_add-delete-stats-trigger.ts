import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 049: No-op - DELETE trigger functionality already provided by migration 045
 *
 * Migration 045_fix-data-integrity.ts already contains a unified
 * trigger_update_stats_on_checkin that fires on INSERT OR DELETE.
 * This migration was originally planned to add a separate DELETE-only trigger,
 * but that would cause double decrements on check-in deletion.
 *
 * This migration is now a no-op to maintain migration sequence integrity.
 *
 * Note: If this migration previously ran before the fix, the redundant
 * trigger_update_stats_on_checkin_delete may exist. The down() function
 * will clean it up if needed.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // No-op: Migration 045 already provides unified INSERT/DELETE trigger
  // Adding a separate DELETE trigger here would cause double stat decrements
  pgm.sql(`
    -- Migration 045 already provides unified INSERT/DELETE trigger
    -- No additional triggers needed
    SELECT 1;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Clean up any redundant trigger that may have been created
  // by previous versions of this migration
  pgm.sql(`
    DROP TRIGGER IF EXISTS trigger_update_stats_on_checkin_delete ON checkins;
    DROP FUNCTION IF EXISTS update_user_stats_on_checkin_delete();
  `);
}
