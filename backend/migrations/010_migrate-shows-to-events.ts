import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 010: Migrate shows data to events + event_lineup (Data migration)
 *
 * Copies all rows from the `shows` table into the `events` table,
 * preserving UUIDs for FK continuity. Creates event_lineup entries
 * for each show (each show had exactly one band). Also migrates
 * notifications.show_id to notifications.event_id.
 *
 * IMPORTANT: The shows table may not exist in the production database
 * (it was never created by the old migration scripts -- only defined in
 * database-schema.sql). All operations are wrapped in conditional checks.
 *
 * All operations use ON CONFLICT DO NOTHING for idempotency --
 * running this migration multiple times will not duplicate data.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Step 1: Copy shows into events table (only if shows table exists)
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'shows'
      ) THEN
        INSERT INTO events (
          id, venue_id, event_date, doors_time, start_time, end_time,
          ticket_url, ticket_price_min, ticket_price_max,
          is_sold_out, is_cancelled, description,
          source, is_verified, created_at, updated_at
        )
        SELECT
          id, venue_id, show_date, doors_time, start_time, end_time,
          ticket_url, ticket_price_min, ticket_price_max,
          is_sold_out, is_cancelled, description,
          'migrated', true, created_at, updated_at
        FROM shows
        ON CONFLICT DO NOTHING;

        RAISE NOTICE 'Migrated shows to events: % rows', (SELECT COUNT(*) FROM shows);
      ELSE
        RAISE NOTICE 'Shows table does not exist -- skipping shows-to-events migration';
      END IF;
    END $$;
  `);

  // Step 2: Create event_lineup entries from shows (each show had exactly one band)
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'shows'
      ) THEN
        INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner)
        SELECT id, band_id, 0, true
        FROM shows
        ON CONFLICT DO NOTHING;

        RAISE NOTICE 'Created event_lineup entries from shows: % rows', (SELECT COUNT(*) FROM shows);
      ELSE
        RAISE NOTICE 'Shows table does not exist -- skipping lineup migration';
      END IF;
    END $$;
  `);

  // Step 3: Migrate notifications.show_id to notifications.event_id
  // The show_id column only exists if the notifications table was created from
  // database-schema.sql. If it was created by migration 007 (from scratch),
  // it does not have show_id.
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notifications' AND column_name = 'show_id'
      ) THEN
        UPDATE notifications n
        SET event_id = n.show_id
        WHERE n.show_id IS NOT NULL AND n.event_id IS NULL;

        RAISE NOTICE 'Migrated notifications show_id to event_id';
      ELSE
        RAISE NOTICE 'Notifications table has no show_id column -- skipping';
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Data migration rollback is a safe no-op.
  // The expand phase preserved all original columns and tables.
  // Rolling back this migration just means the migrated data in events
  // and event_lineup will be orphaned but harmless.
  // The original shows table and its data remain completely intact.
  pgm.sql(`SELECT 1; -- no-op: data preserved in original tables`);
}
