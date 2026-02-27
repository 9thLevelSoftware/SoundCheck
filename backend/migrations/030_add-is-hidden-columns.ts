import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 030: Add is_hidden columns for content moderation
 *
 * Enables soft-hiding of content flagged by SafeSearch or removed by admin.
 * ModerationService.autoHideContent() sets is_hidden = true.
 * Admin can unhide via ModerationService.reviewItem() with 'approved' action.
 *
 * Phase 9: Trust & Safety Foundation (Plan 02)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN
      -- Add is_hidden to checkins for hiding flagged check-ins/photos
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'is_hidden'
      ) THEN
        ALTER TABLE checkins ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
      END IF;

      -- Add is_hidden to checkin_comments for hiding flagged comments
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkin_comments' AND column_name = 'is_hidden'
      ) THEN
        ALTER TABLE checkin_comments ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE checkins DROP COLUMN IF EXISTS is_hidden;
    ALTER TABLE checkin_comments DROP COLUMN IF EXISTS is_hidden;
  `);
}
