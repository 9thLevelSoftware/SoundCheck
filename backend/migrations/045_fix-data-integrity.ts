import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 045: Data Integrity Fixes
 *
 * CFR-BE-001: UNIQUE constraint on toasts(checkin_id, user_id) for ON CONFLICT upsert
 * CFR-DI-002: Add DELETE handler to the checkin stats trigger (was INSERT-only)
 * CFR-025:    Filter rating=0 from band/venue average_rating calculations
 * CFR-DI-006: Fix events.created_by_user_id FK to ON DELETE SET NULL
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // CFR-BE-001: UNIQUE constraint for toasts — enables ON CONFLICT in toast upsert
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_toasts_checkin_user
    ON toasts (checkin_id, user_id);
  `);

  // CFR-DI-002 + CFR-025: Rewrite the checkin stats trigger
  // Preserves ALL existing INSERT logic from migration 009, adds DELETE handler,
  // and filters rating > 0 from average_rating calculations.
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
          SELECT e.venue_id INTO v_venue_id
          FROM events e
          WHERE e.id = NEW.event_id;

          SELECT el.band_id INTO v_band_id
          FROM event_lineup el
          WHERE el.event_id = NEW.event_id
          ORDER BY el.is_headliner DESC, el.set_order ASC
          LIMIT 1;
        ELSE
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
            -- CFR-025: Filter rating=0 from averages
            average_rating = COALESCE(
              (SELECT AVG(rating) FROM (
                SELECT rating FROM checkins
                WHERE band_id = v_band_id AND rating IS NOT NULL AND rating > 0
                UNION ALL
                SELECT cbr.rating FROM checkin_band_ratings cbr
                WHERE cbr.band_id = v_band_id AND cbr.rating > 0
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
            -- CFR-025: Filter rating=0 from averages
            average_rating = COALESCE(
              (SELECT AVG(r) FROM (
                SELECT rating AS r FROM checkins
                WHERE venue_id = v_venue_id AND rating IS NOT NULL AND rating > 0
                UNION ALL
                SELECT c.venue_rating AS r FROM checkins c
                JOIN events e ON c.event_id = e.id
                WHERE e.venue_id = v_venue_id AND c.venue_rating IS NOT NULL AND c.venue_rating > 0
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

      ELSIF TG_OP = 'DELETE' THEN
        -- CFR-DI-002: DELETE handler — mirror of INSERT logic with decrements

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

        -- Decrement user total_checkins
        UPDATE users SET total_checkins = GREATEST(total_checkins - 1, 0)
        WHERE id = OLD.user_id;

        -- Recompute unique bands
        UPDATE users SET unique_bands = (
          SELECT COUNT(DISTINCT band_id) FROM (
            SELECT band_id FROM checkins
            WHERE user_id = OLD.user_id AND band_id IS NOT NULL
            UNION
            SELECT el.band_id FROM checkins c
            JOIN event_lineup el ON c.event_id = el.event_id
            WHERE c.user_id = OLD.user_id AND c.event_id IS NOT NULL
          ) sub
        ) WHERE id = OLD.user_id;

        -- Recompute unique venues
        UPDATE users SET unique_venues = (
          SELECT COUNT(DISTINCT venue_id) FROM (
            SELECT venue_id FROM checkins
            WHERE user_id = OLD.user_id AND venue_id IS NOT NULL
            UNION
            SELECT e.venue_id FROM checkins c
            JOIN events e ON c.event_id = e.id
            WHERE c.user_id = OLD.user_id AND c.event_id IS NOT NULL
          ) sub
        ) WHERE id = OLD.user_id;

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
            ),
            average_rating = COALESCE(
              (SELECT AVG(rating) FROM (
                SELECT rating FROM checkins
                WHERE band_id = v_band_id AND rating IS NOT NULL AND rating > 0
                UNION ALL
                SELECT cbr.rating FROM checkin_band_ratings cbr
                WHERE cbr.band_id = v_band_id AND cbr.rating > 0
              ) sub),
              0
            )
          WHERE id = v_band_id;
        END IF;

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
            ),
            average_rating = COALESCE(
              (SELECT AVG(r) FROM (
                SELECT rating AS r FROM checkins
                WHERE venue_id = v_venue_id AND rating IS NOT NULL AND rating > 0
                UNION ALL
                SELECT c.venue_rating AS r FROM checkins c
                JOIN events e ON c.event_id = e.id
                WHERE e.venue_id = v_venue_id AND c.venue_rating IS NOT NULL AND c.venue_rating > 0
              ) sub),
              0
            )
          WHERE id = v_venue_id;
        END IF;

        -- Decrement event total_checkins
        IF OLD.event_id IS NOT NULL THEN
          UPDATE events SET total_checkins = GREATEST(total_checkins - 1, 0)
          WHERE id = OLD.event_id;
        END IF;
      END IF;

      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Recreate trigger to fire on both INSERT and DELETE
  pgm.sql(`
    DROP TRIGGER IF EXISTS trigger_update_stats_on_checkin ON checkins;
    CREATE TRIGGER trigger_update_stats_on_checkin
      AFTER INSERT OR DELETE ON checkins
      FOR EACH ROW
      EXECUTE FUNCTION update_user_stats_on_checkin();
  `);

  // CFR-DI-006: Fix events.created_by_user_id FK to allow user deletion
  pgm.sql(`
    ALTER TABLE events
    DROP CONSTRAINT IF EXISTS events_created_by_user_id_fkey;

    ALTER TABLE events
    ADD CONSTRAINT events_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS idx_toasts_checkin_user;`);

  // Restore INSERT-only trigger
  pgm.sql(`
    DROP TRIGGER IF EXISTS trigger_update_stats_on_checkin ON checkins;
    CREATE TRIGGER trigger_update_stats_on_checkin
      AFTER INSERT ON checkins
      FOR EACH ROW
      EXECUTE FUNCTION update_user_stats_on_checkin();
  `);

  // FK change is not easily reversible — leave as ON DELETE SET NULL
}
