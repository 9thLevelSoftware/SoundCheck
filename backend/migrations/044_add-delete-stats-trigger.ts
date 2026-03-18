import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 044: Add AFTER DELETE trigger on checkins to decrement stats
 *
 * The existing trigger `update_user_stats_on_checkin()` only fires on INSERT.
 * When a checkin is deleted, user/venue/band/event stats are never decremented.
 * This migration adds a separate DELETE trigger function that:
 *   - Decrements total_checkins (floored at 0)
 *   - Recomputes unique_bands/unique_venues/unique_fans/unique_visitors via
 *     subquery (simple decrement would be wrong for multi-checkin scenarios)
 *   - Decrements event total_checkins
 *
 * Finding: CFR-004
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_user_stats_on_checkin_delete()
    RETURNS TRIGGER AS $$
    DECLARE
      v_band_id UUID;
      v_venue_id UUID;
    BEGIN
      -- Determine band_id and venue_id from either path
      IF OLD.event_id IS NOT NULL THEN
        SELECT e.venue_id INTO v_venue_id
        FROM events e
        WHERE e.id = OLD.event_id;

        SELECT el.band_id INTO v_band_id
        FROM event_lineup el
        WHERE el.event_id = OLD.event_id
        ORDER BY el.is_headliner DESC, el.set_order ASC
        LIMIT 1;
      ELSE
        v_band_id := OLD.band_id;
        v_venue_id := OLD.venue_id;
      END IF;

      -- Decrement user stats
      UPDATE users SET
        total_checkins = GREATEST(total_checkins - 1, 0),
        unique_venues = (
          SELECT COUNT(DISTINCT venue_id) FROM (
            SELECT venue_id FROM checkins
            WHERE user_id = OLD.user_id AND venue_id IS NOT NULL
            UNION
            SELECT e.venue_id FROM checkins c
            JOIN events e ON c.event_id = e.id
            WHERE c.user_id = OLD.user_id AND c.event_id IS NOT NULL
          ) sub
        ),
        unique_bands = (
          SELECT COUNT(DISTINCT band_id) FROM (
            SELECT band_id FROM checkins
            WHERE user_id = OLD.user_id AND band_id IS NOT NULL
            UNION
            SELECT el.band_id FROM checkins c
            JOIN event_lineup el ON c.event_id = el.event_id
            WHERE c.user_id = OLD.user_id AND c.event_id IS NOT NULL
          ) sub
        )
      WHERE id = OLD.user_id;

      -- Decrement venue stats
      IF v_venue_id IS NOT NULL THEN
        UPDATE venues SET
          total_checkins = GREATEST(total_checkins - 1, 0),
          unique_visitors = (
            SELECT COUNT(DISTINCT user_id) FROM (
              SELECT user_id FROM checkins WHERE venue_id = v_venue_id
              UNION
              SELECT c.user_id FROM checkins c
              JOIN events e ON c.event_id = e.id
              WHERE e.venue_id = v_venue_id AND c.event_id IS NOT NULL
            ) sub
          )
        WHERE id = v_venue_id;
      END IF;

      -- Decrement band stats
      IF v_band_id IS NOT NULL THEN
        UPDATE bands SET
          total_checkins = GREATEST(total_checkins - 1, 0),
          unique_fans = (
            SELECT COUNT(DISTINCT user_id) FROM (
              SELECT user_id FROM checkins WHERE band_id = v_band_id
              UNION
              SELECT c.user_id FROM checkins c
              JOIN event_lineup el ON c.event_id = el.event_id
              WHERE el.band_id = v_band_id AND c.event_id IS NOT NULL
            ) sub
          )
        WHERE id = v_band_id;
      END IF;

      -- Decrement event stats
      IF OLD.event_id IS NOT NULL THEN
        UPDATE events SET
          total_checkins = GREATEST(total_checkins - 1, 0)
        WHERE id = OLD.event_id;
      END IF;

      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trigger_update_stats_on_checkin_delete ON checkins;
    CREATE TRIGGER trigger_update_stats_on_checkin_delete
      AFTER DELETE ON checkins
      FOR EACH ROW
      EXECUTE FUNCTION update_user_stats_on_checkin_delete();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trigger_update_stats_on_checkin_delete ON checkins;
    DROP FUNCTION IF EXISTS update_user_stats_on_checkin_delete();
  `);
}
