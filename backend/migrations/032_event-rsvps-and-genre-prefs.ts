import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 032: Event RSVPs and Genre Preferences
 *
 * Creates tables for:
 * 1. event_rsvps - "I'm Going" toggles for events
 * 2. user_genre_preferences - Onboarding genre selections
 * 3. onboarding_completed_at column on users table
 *
 * Phase 10: Viral Growth Engine (Plan 01)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. event_rsvps table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS event_rsvps (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT event_rsvps_user_event_unique UNIQUE (user_id, event_id)
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_event_rsvps_user_id ON event_rsvps (user_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_id ON event_rsvps (event_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_created ON event_rsvps (event_id, created_at);`);

  // 2. user_genre_preferences table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_genre_preferences (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      genre VARCHAR(100) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT user_genre_prefs_user_genre_unique UNIQUE (user_id, genre)
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_user_genre_preferences_user_id ON user_genre_preferences (user_id);`);

  // 3. Add onboarding_completed_at to users
  pgm.sql(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'onboarding_completed_at'
      ) THEN
        ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed_at;`);
  pgm.sql(`DROP TABLE IF EXISTS user_genre_preferences CASCADE;`);
  pgm.sql(`DROP TABLE IF EXISTS event_rsvps CASCADE;`);
}
