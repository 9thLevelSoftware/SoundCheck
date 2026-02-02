import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 011: Backfill checkins data (Data migration)
 *
 * This migration handles TWO possible checkins table states:
 *
 * A) Full schema (from database-schema.sql): has band_id, venue_id, rating,
 *    comment, photo_url, event_date columns. Requires full data backfill.
 *
 * B) Minimal schema (from old migrate-events-model.ts): only has id, user_id,
 *    event_id, venue_rating, band_rating, review_text, image_urls, is_verified,
 *    created_at, updated_at. The old columns never existed, so there is nothing
 *    to backfill. This is the current production state.
 *
 * All operations are wrapped in conditional checks for column existence.
 * All operations use ON CONFLICT DO NOTHING and WHERE IS NULL guards
 * for idempotency -- running this migration multiple times is safe.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // All backfill operations depend on old columns existing.
  // Wrap everything in a single DO block that checks for the presence
  // of the key columns before executing.
  pgm.sql(`
    DO $$
    DECLARE
      has_legacy_columns BOOLEAN;
    BEGIN
      -- Check if checkins has the legacy columns (band_id, venue_id, event_date)
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'band_id'
      ) INTO has_legacy_columns;

      IF NOT has_legacy_columns THEN
        RAISE NOTICE 'Checkins table does not have legacy columns (band_id, venue_id, etc.) -- skipping data backfill';
        RETURN;
      END IF;

      RAISE NOTICE 'Legacy columns found -- running checkins data backfill';

      -- Step 1: Match checkins to events by venue_id + band_id + event_date
      UPDATE checkins c
      SET event_id = e.id
      FROM events e
      JOIN event_lineup el ON e.id = el.event_id
      WHERE c.venue_id = e.venue_id
        AND c.band_id = el.band_id
        AND c.event_date = e.event_date
        AND c.event_id IS NULL;

      RAISE NOTICE 'Step 1 complete: matched checkins to events via venue+band+date';

      -- Step 2: Create auto-events for orphaned checkins (no matching show)
      INSERT INTO events (venue_id, event_date, source, is_verified, created_at, updated_at)
      SELECT DISTINCT c.venue_id, c.event_date, 'migrated', false, MIN(c.created_at), MIN(c.created_at)
      FROM checkins c
      WHERE c.event_id IS NULL
        AND c.venue_id IS NOT NULL
        AND c.event_date IS NOT NULL
      GROUP BY c.venue_id, c.event_date
      ON CONFLICT DO NOTHING;

      RAISE NOTICE 'Step 2 complete: created auto-events for orphaned checkins';

      -- Step 3: Create event_lineup entries for auto-created events
      INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner)
      SELECT DISTINCT e.id, c.band_id, 0, true
      FROM checkins c
      JOIN events e ON c.venue_id = e.venue_id AND c.event_date = e.event_date
      WHERE c.event_id IS NULL
        AND c.band_id IS NOT NULL
      ON CONFLICT DO NOTHING;

      RAISE NOTICE 'Step 3 complete: created event_lineup entries for orphaned checkins';

      -- Step 4: Re-run backfill for newly created events
      UPDATE checkins c
      SET event_id = e.id
      FROM events e
      WHERE c.venue_id = e.venue_id
        AND c.event_date = e.event_date
        AND c.event_id IS NULL;

      RAISE NOTICE 'Step 4 complete: re-ran event_id backfill for auto-created events';

      -- Step 5: Copy old single rating to venue_rating
      UPDATE checkins
      SET venue_rating = rating
      WHERE venue_rating IS NULL AND rating IS NOT NULL;

      RAISE NOTICE 'Step 5 complete: copied rating to venue_rating';

      -- Step 6: Create band ratings from old single rating
      INSERT INTO checkin_band_ratings (checkin_id, band_id, rating)
      SELECT c.id, c.band_id, c.rating
      FROM checkins c
      WHERE c.rating IS NOT NULL
        AND c.band_id IS NOT NULL
      ON CONFLICT DO NOTHING;

      RAISE NOTICE 'Step 6 complete: created checkin_band_ratings from old rating';

      -- Step 7: Copy comment to review_text
      UPDATE checkins
      SET review_text = comment
      WHERE review_text IS NULL AND comment IS NOT NULL;

      RAISE NOTICE 'Step 7 complete: copied comment to review_text';

      -- Step 8: Copy photo_url to image_urls array
      UPDATE checkins
      SET image_urls = ARRAY[photo_url]
      WHERE image_urls IS NULL AND photo_url IS NOT NULL;

      RAISE NOTICE 'Step 8 complete: copied photo_url to image_urls';

      RAISE NOTICE 'Checkins data backfill complete';
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Data migration rollback is a safe no-op.
  // All original columns (rating, comment, photo_url, band_id, venue_id)
  // are preserved intact in databases that have them. The backfilled data
  // in new columns (event_id, venue_rating, review_text, image_urls) and
  // checkin_band_ratings rows would be orphaned but harmless if the expand
  // phase is reverted.
  pgm.sql(`SELECT 1; -- no-op: data preserved in original columns`);
}
