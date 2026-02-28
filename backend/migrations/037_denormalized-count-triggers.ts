import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 037: Denormalized Count Triggers
 *
 * Creates PostgreSQL trigger functions and triggers to automatically maintain
 * denormalized toast_count and comment_count on the checkins table.
 *
 * Phase 11 Plan 02 added these columns (migration 024) and switched feed queries
 * to read them instead of COUNT(DISTINCT) joins, but no write path was ever
 * implemented -- the columns are permanently 0. This migration adds database-level
 * triggers so every INSERT/DELETE on toasts or checkin_comments automatically
 * updates the parent checkin's count, and backfills correct values for existing data.
 *
 * Phase 11.1: Cross-Phase Integration Fixes (Plan 01)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Toast count trigger function
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_checkin_toast_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE checkins SET toast_count = toast_count + 1 WHERE id = NEW.checkin_id;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE checkins SET toast_count = GREATEST(toast_count - 1, 0) WHERE id = OLD.checkin_id;
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 2. Toast triggers on the toasts table
  pgm.sql(`
    CREATE TRIGGER trg_toast_count_insert
      AFTER INSERT ON toasts
      FOR EACH ROW
      EXECUTE FUNCTION update_checkin_toast_count();
  `);

  pgm.sql(`
    CREATE TRIGGER trg_toast_count_delete
      AFTER DELETE ON toasts
      FOR EACH ROW
      EXECUTE FUNCTION update_checkin_toast_count();
  `);

  // 3. Comment count trigger function
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_checkin_comment_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE checkins SET comment_count = comment_count + 1 WHERE id = NEW.checkin_id;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE checkins SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.checkin_id;
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 4. Comment triggers on the checkin_comments table
  pgm.sql(`
    CREATE TRIGGER trg_comment_count_insert
      AFTER INSERT ON checkin_comments
      FOR EACH ROW
      EXECUTE FUNCTION update_checkin_comment_count();
  `);

  pgm.sql(`
    CREATE TRIGGER trg_comment_count_delete
      AFTER DELETE ON checkin_comments
      FOR EACH ROW
      EXECUTE FUNCTION update_checkin_comment_count();
  `);

  // 5. Backfill existing data with correct counts
  pgm.sql(`
    UPDATE checkins SET
      toast_count = (SELECT COUNT(*) FROM toasts WHERE checkin_id = checkins.id),
      comment_count = (SELECT COUNT(*) FROM checkin_comments WHERE checkin_id = checkins.id);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop all 4 triggers
  pgm.sql(`DROP TRIGGER IF EXISTS trg_toast_count_insert ON toasts;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_toast_count_delete ON toasts;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_comment_count_insert ON checkin_comments;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_comment_count_delete ON checkin_comments;`);

  // Drop both trigger functions
  pgm.sql(`DROP FUNCTION IF EXISTS update_checkin_toast_count;`);
  pgm.sql(`DROP FUNCTION IF EXISTS update_checkin_comment_count;`);

  // Reset counts to 0
  pgm.sql(`UPDATE checkins SET toast_count = 0, comment_count = 0;`);
}
