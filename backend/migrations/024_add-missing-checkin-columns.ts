import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 024: Add missing legacy columns to checkins table
 *
 * The checkins table in database-schema.sql defines columns (band_id, venue_id,
 * rating, comment, photo_url, event_date, checkin_latitude, checkin_longitude,
 * toast_count, comment_count) that were never created via migration on production.
 *
 * Multiple services reference these columns:
 *   - FeedService: SELECT c.photo_url
 *   - CheckinService.createEventCheckin: INSERT into band_id, venue_id, rating,
 *     comment, event_date
 *   - CheckinService.createCheckin (legacy): INSERT into photo_url
 *   - DataExportService: SELECT c.photo_url, c.rating, c.comment, c.event_date
 *   - DataRetentionService: UPDATE photo_url = NULL
 *
 * Uses conditional DDL to only add columns that don't already exist.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN

      -- band_id: FK to bands (nullable for event-first check-ins where headliner is unknown)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'band_id'
      ) THEN
        ALTER TABLE checkins ADD COLUMN band_id UUID REFERENCES bands(id) ON DELETE CASCADE;
      END IF;

      -- venue_id: FK to venues (nullable, populated from event's venue)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'venue_id'
      ) THEN
        ALTER TABLE checkins ADD COLUMN venue_id UUID REFERENCES venues(id) ON DELETE CASCADE;
      END IF;

      -- rating: legacy overall rating (0-5, decimal for half stars)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'rating'
      ) THEN
        ALTER TABLE checkins ADD COLUMN rating DECIMAL(2, 1) DEFAULT 0;
      END IF;

      -- comment: optional text review
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'comment'
      ) THEN
        ALTER TABLE checkins ADD COLUMN comment TEXT;
      END IF;

      -- photo_url: single photo URL (legacy, replaced by image_urls array)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'photo_url'
      ) THEN
        ALTER TABLE checkins ADD COLUMN photo_url VARCHAR(500);
      END IF;

      -- event_date: date of the concert
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'event_date'
      ) THEN
        ALTER TABLE checkins ADD COLUMN event_date DATE;
      END IF;

      -- checkin_latitude: GPS lat for location verification
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'checkin_latitude'
      ) THEN
        ALTER TABLE checkins ADD COLUMN checkin_latitude DECIMAL(10, 8);
      END IF;

      -- checkin_longitude: GPS lon for location verification
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'checkin_longitude'
      ) THEN
        ALTER TABLE checkins ADD COLUMN checkin_longitude DECIMAL(11, 8);
      END IF;

      -- toast_count: denormalized count for performance
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'toast_count'
      ) THEN
        ALTER TABLE checkins ADD COLUMN toast_count INTEGER DEFAULT 0;
      END IF;

      -- comment_count: denormalized count for performance
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'comment_count'
      ) THEN
        ALTER TABLE checkins ADD COLUMN comment_count INTEGER DEFAULT 0;
      END IF;

    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN
      ALTER TABLE checkins DROP COLUMN IF EXISTS comment_count;
      ALTER TABLE checkins DROP COLUMN IF EXISTS toast_count;
      ALTER TABLE checkins DROP COLUMN IF EXISTS checkin_longitude;
      ALTER TABLE checkins DROP COLUMN IF EXISTS checkin_latitude;
      ALTER TABLE checkins DROP COLUMN IF EXISTS event_date;
      ALTER TABLE checkins DROP COLUMN IF EXISTS photo_url;
      ALTER TABLE checkins DROP COLUMN IF EXISTS comment;
      ALTER TABLE checkins DROP COLUMN IF EXISTS rating;
      ALTER TABLE checkins DROP COLUMN IF EXISTS venue_id;
      ALTER TABLE checkins DROP COLUMN IF EXISTS band_id;
    END $$;
  `);
}
