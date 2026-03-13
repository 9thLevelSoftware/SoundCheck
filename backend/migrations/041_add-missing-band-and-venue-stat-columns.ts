import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 041: Restore missing band and venue stat columns after schema drift
 *
 * Some production environments retained legacy review counters but missed the
 * denormalized check-in stats that trigger functions update on every insert.
 * This migration adds the missing columns and backfills them from existing
 * checkin data so new checkins stop failing trigger execution.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE bands ADD COLUMN IF NOT EXISTS total_checkins INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE bands ADD COLUMN IF NOT EXISTS unique_fans INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE venues ADD COLUMN IF NOT EXISTS total_checkins INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE venues ADD COLUMN IF NOT EXISTS unique_visitors INTEGER NOT NULL DEFAULT 0;

    WITH band_checkins AS (
      SELECT band_id, COUNT(*)::int AS total_checkins
      FROM checkins
      WHERE band_id IS NOT NULL
      GROUP BY band_id
    ),
    band_fans AS (
      SELECT band_id, COUNT(DISTINCT user_id)::int AS unique_fans
      FROM (
        SELECT band_id, user_id
        FROM checkins
        WHERE band_id IS NOT NULL

        UNION

        SELECT el.band_id, c.user_id
        FROM checkins c
        JOIN event_lineup el ON el.event_id = c.event_id
        WHERE c.event_id IS NOT NULL
      ) band_refs
      GROUP BY band_id
    )
    UPDATE bands b
    SET
      total_checkins = COALESCE(c.total_checkins, 0),
      unique_fans = COALESCE(f.unique_fans, 0)
    FROM (
      SELECT id FROM bands
    ) base
    LEFT JOIN band_checkins c ON c.band_id = base.id
    LEFT JOIN band_fans f ON f.band_id = base.id
    WHERE b.id = base.id;

    WITH venue_checkins AS (
      SELECT venue_id, COUNT(*)::int AS total_checkins
      FROM (
        SELECT venue_id
        FROM checkins
        WHERE venue_id IS NOT NULL

        UNION ALL

        SELECT e.venue_id
        FROM checkins c
        JOIN events e ON e.id = c.event_id
        WHERE c.event_id IS NOT NULL
          AND c.venue_id IS NULL
      ) venue_refs
      GROUP BY venue_id
    ),
    venue_visitors AS (
      SELECT venue_id, COUNT(DISTINCT user_id)::int AS unique_visitors
      FROM (
        SELECT venue_id, user_id
        FROM checkins
        WHERE venue_id IS NOT NULL

        UNION

        SELECT e.venue_id, c.user_id
        FROM checkins c
        JOIN events e ON e.id = c.event_id
        WHERE c.event_id IS NOT NULL
      ) venue_refs
      GROUP BY venue_id
    )
    UPDATE venues v
    SET
      total_checkins = COALESCE(c.total_checkins, 0),
      unique_visitors = COALESCE(vis.unique_visitors, 0)
    FROM (
      SELECT id FROM venues
    ) base
    LEFT JOIN venue_checkins c ON c.venue_id = base.id
    LEFT JOIN venue_visitors vis ON vis.venue_id = base.id
    WHERE v.id = base.id;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE venues DROP COLUMN IF EXISTS unique_visitors;
    ALTER TABLE venues DROP COLUMN IF EXISTS total_checkins;

    ALTER TABLE bands DROP COLUMN IF EXISTS unique_fans;
    ALTER TABLE bands DROP COLUMN IF EXISTS total_checkins;
  `);
}
