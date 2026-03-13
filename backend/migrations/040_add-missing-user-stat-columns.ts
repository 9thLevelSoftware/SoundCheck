import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 040: Restore denormalized user stat columns if schema drift removed them
 *
 * Production currently has trigger logic that updates users.total_checkins,
 * users.unique_bands, and users.unique_venues, but some environments were
 * created without those columns. This migration repairs that drift and
 * backfills counts from existing checkins so trigger-based updates can resume.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS total_checkins INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS unique_bands INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS unique_venues INTEGER NOT NULL DEFAULT 0;

    WITH per_user_checkins AS (
      SELECT user_id, COUNT(*)::int AS total_checkins
      FROM checkins
      GROUP BY user_id
    ),
    per_user_bands AS (
      SELECT user_id, COUNT(DISTINCT band_id)::int AS unique_bands
      FROM (
        SELECT user_id, band_id
        FROM checkins
        WHERE band_id IS NOT NULL

        UNION

        SELECT c.user_id, el.band_id
        FROM checkins c
        JOIN event_lineup el ON el.event_id = c.event_id
        WHERE c.event_id IS NOT NULL
      ) band_refs
      GROUP BY user_id
    ),
    per_user_venues AS (
      SELECT user_id, COUNT(DISTINCT venue_id)::int AS unique_venues
      FROM (
        SELECT user_id, venue_id
        FROM checkins
        WHERE venue_id IS NOT NULL

        UNION

        SELECT c.user_id, e.venue_id
        FROM checkins c
        JOIN events e ON e.id = c.event_id
        WHERE c.event_id IS NOT NULL
      ) venue_refs
      GROUP BY user_id
    )
    UPDATE users u
    SET
      total_checkins = COALESCE(c.total_checkins, 0),
      unique_bands = COALESCE(b.unique_bands, 0),
      unique_venues = COALESCE(v.unique_venues, 0)
    FROM (
      SELECT id FROM users
    ) base
    LEFT JOIN per_user_checkins c ON c.user_id = base.id
    LEFT JOIN per_user_bands b ON b.user_id = base.id
    LEFT JOIN per_user_venues v ON v.user_id = base.id
    WHERE u.id = base.id;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN IF EXISTS unique_venues;
    ALTER TABLE users DROP COLUMN IF EXISTS unique_bands;
    ALTER TABLE users DROP COLUMN IF EXISTS total_checkins;
  `);
}
