import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 014: Add status column to events
 *
 * Replaces the boolean is_cancelled with a richer status field:
 * active, cancelled, postponed, rescheduled.
 * Backfills existing cancelled events from the is_cancelled boolean.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN
      -- Add status column if not present
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'status'
      ) THEN
        ALTER TABLE events ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';

        -- Add CHECK constraint for valid status values
        ALTER TABLE events ADD CONSTRAINT chk_event_status
          CHECK (status IN ('active', 'cancelled', 'postponed', 'rescheduled'));

        -- Backfill: set cancelled events from existing boolean
        UPDATE events SET status = 'cancelled' WHERE is_cancelled = true;

        -- Index on status for filtering
        CREATE INDEX idx_events_status ON events (status);
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'status'
      ) THEN
        DROP INDEX IF EXISTS idx_events_status;
        ALTER TABLE events DROP CONSTRAINT IF EXISTS chk_event_status;
        ALTER TABLE events DROP COLUMN status;
      END IF;
    END $$;
  `);
}
