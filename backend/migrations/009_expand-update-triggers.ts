import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 009: Update trigger functions for dual-path (Expand phase)
 *
 * The existing `update_user_stats_on_checkin()` trigger directly references
 * checkins.band_id and checkins.venue_id. These columns will be removed in
 * a future contract phase. This migration rewrites the trigger to work with
 * BOTH old-style checkins (band_id + venue_id set) AND new-style checkins
 * (event_id set, old columns may be null).
 *
 * The trigger determines band_id and venue_id from the events/event_lineup
 * tables when event_id is present, falling back to the direct columns for
 * legacy rows. Stats computation unions both data paths to avoid double-
 * counting or missing data during the transition period.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Replace the trigger function with a dual-path version
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_user_stats_on_checkin()
    RETURNS TRIGGER AS $$
    DECLARE
      v_band_id UUID;
      v_venue_id UUID;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        -- Determine band_id and venue_id from either path
        IF NEW.event_id IS NOT NULL THEN
          -- New path: get venue from events table
          SELECT e.venue_id INTO v_venue_id
          FROM events e
          WHERE e.id = NEW.event_id;

          -- Get first headliner band for stats (or first band if no headliner)
          SELECT el.band_id INTO v_band_id
          FROM event_lineup el
          WHERE el.event_id = NEW.event_id
          ORDER BY el.is_headliner DESC, el.set_order ASC
          LIMIT 1;
        ELSE
          -- Legacy path: read directly from checkin columns
          v_band_id := NEW.band_id;
          v_venue_id := NEW.venue_id;
        END IF;

        -- Update total check-ins for user
        UPDATE users SET total_checkins = total_checkins + 1
        WHERE id = NEW.user_id;

        -- Update unique bands count (union of both paths)
        UPDATE users SET unique_bands = (
          SELECT COUNT(DISTINCT band_id) FROM (
            SELECT band_id FROM checkins
            WHERE user_id = NEW.user_id AND band_id IS NOT NULL
            UNION
            SELECT el.band_id FROM checkins c
            JOIN event_lineup el ON c.event_id = el.event_id
            WHERE c.user_id = NEW.user_id AND c.event_id IS NOT NULL
          ) sub
        ) WHERE id = NEW.user_id;

        -- Update unique venues count (union of both paths)
        UPDATE users SET unique_venues = (
          SELECT COUNT(DISTINCT venue_id) FROM (
            SELECT venue_id FROM checkins
            WHERE user_id = NEW.user_id AND venue_id IS NOT NULL
            UNION
            SELECT e.venue_id FROM checkins c
            JOIN events e ON c.event_id = e.id
            WHERE c.user_id = NEW.user_id AND c.event_id IS NOT NULL
          ) sub
        ) WHERE id = NEW.user_id;

        -- Update band stats if we have a band
        IF v_band_id IS NOT NULL THEN
          UPDATE bands SET
            total_checkins = total_checkins + 1,
            unique_fans = (
              SELECT COUNT(DISTINCT user_id) FROM (
                SELECT user_id FROM checkins WHERE band_id = v_band_id
                UNION
                SELECT c.user_id FROM checkins c
                JOIN event_lineup el ON c.event_id = el.event_id
                WHERE el.band_id = v_band_id AND c.event_id IS NOT NULL
              ) sub
            ),
            average_rating = COALESCE(
              (SELECT AVG(rating) FROM (
                SELECT rating FROM checkins
                WHERE band_id = v_band_id AND rating IS NOT NULL
                UNION ALL
                SELECT cbr.rating FROM checkin_band_ratings cbr
                WHERE cbr.band_id = v_band_id
              ) sub),
              0
            )
          WHERE id = v_band_id;
        END IF;

        -- Update venue stats if we have a venue
        IF v_venue_id IS NOT NULL THEN
          UPDATE venues SET
            total_checkins = total_checkins + 1,
            unique_visitors = (
              SELECT COUNT(DISTINCT user_id) FROM (
                SELECT user_id FROM checkins WHERE venue_id = v_venue_id
                UNION
                SELECT c.user_id FROM checkins c
                JOIN events e ON c.event_id = e.id
                WHERE e.venue_id = v_venue_id AND c.event_id IS NOT NULL
              ) sub
            ),
            average_rating = COALESCE(
              (SELECT AVG(r) FROM (
                SELECT rating AS r FROM checkins
                WHERE venue_id = v_venue_id AND rating IS NOT NULL
                UNION ALL
                SELECT c.venue_rating AS r FROM checkins c
                JOIN events e ON c.event_id = e.id
                WHERE e.venue_id = v_venue_id AND c.venue_rating IS NOT NULL
              ) sub),
              0
            )
          WHERE id = v_venue_id;
        END IF;

        -- Update event total_checkins if applicable
        IF NEW.event_id IS NOT NULL THEN
          UPDATE events SET total_checkins = total_checkins + 1
          WHERE id = NEW.event_id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Recreate the trigger (drop first for idempotency)
  pgm.sql(`
    DROP TRIGGER IF EXISTS trigger_update_stats_on_checkin ON checkins;
    CREATE TRIGGER trigger_update_stats_on_checkin
      AFTER INSERT ON checkins
      FOR EACH ROW
      EXECUTE FUNCTION update_user_stats_on_checkin();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Restore the original trigger function that only reads directly from checkins columns
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_user_stats_on_checkin()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        -- Update total check-ins
        UPDATE users SET total_checkins = total_checkins + 1 WHERE id = NEW.user_id;

        -- Update unique bands count
        UPDATE users SET unique_bands = (
          SELECT COUNT(DISTINCT band_id) FROM checkins WHERE user_id = NEW.user_id
        ) WHERE id = NEW.user_id;

        -- Update unique venues count
        UPDATE users SET unique_venues = (
          SELECT COUNT(DISTINCT venue_id) FROM checkins WHERE user_id = NEW.user_id
        ) WHERE id = NEW.user_id;

        -- Update band stats
        UPDATE bands SET
          total_checkins = total_checkins + 1,
          unique_fans = (SELECT COUNT(DISTINCT user_id) FROM checkins WHERE band_id = NEW.band_id),
          average_rating = (SELECT AVG(rating) FROM checkins WHERE band_id = NEW.band_id)
        WHERE id = NEW.band_id;

        -- Update venue stats
        UPDATE venues SET
          total_checkins = total_checkins + 1,
          unique_visitors = (SELECT COUNT(DISTINCT user_id) FROM checkins WHERE venue_id = NEW.venue_id),
          average_rating = (SELECT AVG(rating) FROM checkins WHERE venue_id = NEW.venue_id)
        WHERE id = NEW.venue_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Recreate the original trigger
  pgm.sql(`
    DROP TRIGGER IF EXISTS trigger_update_stats_on_checkin ON checkins;
    CREATE TRIGGER trigger_update_stats_on_checkin
      AFTER INSERT ON checkins
      FOR EACH ROW
      EXECUTE FUNCTION update_user_stats_on_checkin();
  `);
}
