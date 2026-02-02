import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 004: Add event_id and new columns to checkins (Expand phase)
 *
 * Handles two database states:
 * A) Fresh from database-schema.sql: checkins has band_id, venue_id, rating,
 *    comment, photo_url but NOT event_id, venue_rating, review_text, etc.
 * B) After migrate-events-model.ts: checkins already has event_id (NOT NULL,
 *    wrong), venue_rating (INTEGER, wrong type), band_rating (extra column),
 *    review_text, image_urls -- but with 0 rows.
 *
 * This migration uses conditional DDL to add/alter columns as needed,
 * ensuring the final state is correct regardless of starting state.
 *
 * Target columns (additive to whatever exists):
 * - event_id UUID NULLABLE REFERENCES events(id) ON DELETE CASCADE
 * - venue_rating DECIMAL(2,1) with range check
 * - review_text TEXT
 * - image_urls TEXT[]
 * - is_verified BOOLEAN DEFAULT FALSE
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Use conditional DDL to handle both fresh and pre-migrated database states.
  // Each block checks if the column exists before adding/altering.
  pgm.sql(`
    DO $$ BEGIN

      -- event_id: Add if missing, or fix if NOT NULL (make nullable)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'event_id'
      ) THEN
        ALTER TABLE checkins ADD COLUMN event_id UUID REFERENCES events(id) ON DELETE CASCADE;
      ELSE
        -- Drop old FK constraint if it references the old events table
        -- (the old events table was dropped in migration 001, so FK may be dangling)
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'checkins' AND constraint_name = 'checkins_event_id_fkey'
        ) THEN
          ALTER TABLE checkins DROP CONSTRAINT checkins_event_id_fkey;
        END IF;
        -- Make nullable if currently NOT NULL
        ALTER TABLE checkins ALTER COLUMN event_id DROP NOT NULL;
        -- Add FK to the new events table
        ALTER TABLE checkins ADD CONSTRAINT checkins_event_id_fkey
          FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
      END IF;

      -- venue_rating: Add if missing, or fix type if INTEGER (should be DECIMAL(2,1))
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'venue_rating'
      ) THEN
        ALTER TABLE checkins ADD COLUMN venue_rating DECIMAL(2,1);
      ELSE
        -- Drop old CHECK constraint if exists
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'checkins' AND constraint_name = 'checkins_venue_rating_check'
        ) THEN
          ALTER TABLE checkins DROP CONSTRAINT checkins_venue_rating_check;
        END IF;
        -- Change type from INTEGER to DECIMAL(2,1) if needed
        ALTER TABLE checkins ALTER COLUMN venue_rating TYPE DECIMAL(2,1);
      END IF;

      -- review_text: Add if missing
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'review_text'
      ) THEN
        ALTER TABLE checkins ADD COLUMN review_text TEXT;
      END IF;

      -- image_urls: Add if missing
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'image_urls'
      ) THEN
        ALTER TABLE checkins ADD COLUMN image_urls TEXT[];
      END IF;

      -- is_verified: Add if missing
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'checkins' AND column_name = 'is_verified'
      ) THEN
        ALTER TABLE checkins ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
      END IF;

    END $$;
  `);

  // Add CHECK constraint for venue_rating range
  // Drop first in case it already exists from a previous partial run
  pgm.sql('ALTER TABLE checkins DROP CONSTRAINT IF EXISTS checkins_venue_rating_range;');
  pgm.sql(`
    ALTER TABLE checkins
    ADD CONSTRAINT checkins_venue_rating_range
    CHECK (venue_rating IS NULL OR (venue_rating >= 0.5 AND venue_rating <= 5.0));
  `);

  // Drop old unique_user_checkin constraint if it exists (from old migration)
  // Our new constraint is a partial unique index that only covers non-null event_ids
  pgm.sql('ALTER TABLE checkins DROP CONSTRAINT IF EXISTS unique_user_checkin;');

  // Partial unique index: one check-in per user per event
  // Only enforced on non-null event_ids during transition period
  pgm.sql('DROP INDEX IF EXISTS idx_unique_user_event_checkin;');
  pgm.createIndex('checkins', ['user_id', 'event_id'], {
    unique: true,
    where: 'event_id IS NOT NULL',
    name: 'idx_unique_user_event_checkin',
  });

  // Index for event_id lookups
  pgm.sql('DROP INDEX IF EXISTS checkins_event_id_index;');
  pgm.createIndex('checkins', 'event_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('checkins', ['user_id', 'event_id'], { name: 'idx_unique_user_event_checkin' });
  pgm.dropIndex('checkins', 'event_id');
  pgm.sql('ALTER TABLE checkins DROP CONSTRAINT IF EXISTS checkins_venue_rating_range;');
  pgm.sql(`
    DO $$ BEGIN
      -- Only drop columns that we added (not pre-existing ones)
      -- In practice, down is only useful for reverting from a known state
      ALTER TABLE checkins DROP COLUMN IF EXISTS is_verified;
      ALTER TABLE checkins DROP COLUMN IF EXISTS image_urls;
      ALTER TABLE checkins DROP COLUMN IF EXISTS review_text;
      ALTER TABLE checkins DROP COLUMN IF EXISTS venue_rating;
      ALTER TABLE checkins DROP COLUMN IF EXISTS event_id;
    END $$;
  `);
}
