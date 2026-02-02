import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 007: Add event_id to notifications (Expand phase)
 *
 * Notifications can now reference events. This handles two states:
 * A) Notifications table exists (from database-schema.sql): add event_id column
 * B) Notifications table does not exist (DB created from old migration only):
 *    create the full notifications table with event_id included
 *
 * During the transition, both show_id and event_id may be populated.
 * The show_id column will be removed in the contract phase.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN
      -- Check if notifications table exists
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'notifications'
      ) THEN
        -- Create the full notifications table (matches database-schema.sql + event_id)
        CREATE TABLE notifications (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255),
          message TEXT,
          checkin_id UUID REFERENCES checkins(id) ON DELETE CASCADE,
          from_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
          badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
          event_id UUID REFERENCES events(id) ON DELETE CASCADE,
          is_read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_notifications_user_id ON notifications(user_id);
        CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
        CREATE INDEX idx_notifications_event_id ON notifications(event_id);
      ELSE
        -- Table exists, just add event_id column if not present
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'notifications' AND column_name = 'event_id'
        ) THEN
          ALTER TABLE notifications ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE CASCADE;
          CREATE INDEX idx_notifications_event_id ON notifications(event_id);
        END IF;
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Only drop the event_id column and index, not the whole table
  pgm.sql('DROP INDEX IF EXISTS idx_notifications_event_id;');
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notifications' AND column_name = 'event_id'
      ) THEN
        ALTER TABLE notifications DROP COLUMN event_id;
      END IF;
    END $$;
  `);
}
