import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 044: Create base tables missing from migration chain
 *
 * Finding: CFR-022
 *
 * The following 14 core tables exist only in database-schema.sql, which is
 * not executed by the migration runner. Any fresh environment (CI, disaster
 * recovery, new developer) bootstrapped from migrations alone gets a broken
 * database with missing tables.
 *
 * This migration uses IF NOT EXISTS on every CREATE TABLE so it is safe to
 * run against both fresh and existing databases. Tables are created in FK
 * dependency order.
 *
 * Also adds average_rating columns to bands and venues if missing (CFR-043).
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Enable UUID extension (idempotent)
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

  // -------------------------------------------------------
  // 1. users (no FK deps)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      username VARCHAR(50) UNIQUE NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      bio TEXT,
      profile_image_url VARCHAR(500),
      location VARCHAR(255),
      date_of_birth DATE,
      is_verified BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      total_checkins INTEGER DEFAULT 0,
      unique_bands INTEGER DEFAULT 0,
      unique_venues INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_users_location ON users(location);`);

  // -------------------------------------------------------
  // 2. venues (no FK deps)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS venues (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      address VARCHAR(500),
      city VARCHAR(100),
      state VARCHAR(100),
      country VARCHAR(100),
      postal_code VARCHAR(20),
      latitude DECIMAL(10, 8),
      longitude DECIMAL(11, 8),
      website_url VARCHAR(500),
      phone VARCHAR(20),
      email VARCHAR(255),
      capacity INTEGER,
      venue_type VARCHAR(50),
      image_url VARCHAR(500),
      cover_image_url VARCHAR(500),
      total_checkins INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      average_rating DECIMAL(3, 2) DEFAULT 0.00,
      is_verified BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_venues_venue_type ON venues(venue_type);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_venues_location ON venues(latitude, longitude);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_venues_rating ON venues(average_rating DESC);`);

  // -------------------------------------------------------
  // 3. bands (no FK deps)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS bands (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      genre VARCHAR(100),
      formed_year INTEGER,
      website_url VARCHAR(500),
      spotify_url VARCHAR(500),
      instagram_url VARCHAR(500),
      facebook_url VARCHAR(500),
      image_url VARCHAR(500),
      cover_image_url VARCHAR(500),
      hometown VARCHAR(255),
      total_checkins INTEGER DEFAULT 0,
      unique_fans INTEGER DEFAULT 0,
      monthly_checkins INTEGER DEFAULT 0,
      average_rating DECIMAL(3, 2) DEFAULT 0.00,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_bands_genre ON bands(genre);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_bands_rating ON bands(average_rating DESC);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_bands_checkins ON bands(total_checkins DESC);`);

  // -------------------------------------------------------
  // 4. vibe_tags (no FK deps)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS vibe_tags (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(50) UNIQUE NOT NULL,
      display_name VARCHAR(50) NOT NULL,
      icon VARCHAR(50),
      category VARCHAR(50),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // -------------------------------------------------------
  // 5. badges (no FK deps)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS badges (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL UNIQUE,
      description TEXT,
      icon_url VARCHAR(500),
      badge_type VARCHAR(50),
      requirement_value INTEGER,
      color VARCHAR(7),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // -------------------------------------------------------
  // 6. refresh_tokens (FK to users)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      revoked_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_cleanup ON refresh_tokens(expires_at, revoked_at);`);

  // -------------------------------------------------------
  // 7. user_social_accounts (FK to users)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_social_accounts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'apple', 'facebook')),
      provider_id VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(provider, provider_id)
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_user_social_accounts_user ON user_social_accounts(user_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_user_social_accounts_provider ON user_social_accounts(provider, provider_id);`);

  // -------------------------------------------------------
  // 8. user_followers (FK to users x2)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_followers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower_id, following_id),
      CONSTRAINT no_self_follow CHECK (follower_id != following_id)
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_followers_follower ON user_followers(follower_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_followers_following ON user_followers(following_id);`);

  // -------------------------------------------------------
  // 9. user_wishlist (FK to users, bands)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_wishlist (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
      notify_when_nearby BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, band_id)
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON user_wishlist(user_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_wishlist_band_id ON user_wishlist(band_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_wishlist_user_created ON user_wishlist(user_id, created_at DESC);`);

  // -------------------------------------------------------
  // 10. checkins (FK to users, events, venues, bands)
  //     Note: event_id FK is added by migration 004, not here.
  //     We create the base table matching database-schema.sql.
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS checkins (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
      venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      rating DECIMAL(2, 1) NOT NULL CHECK (rating >= 0 AND rating <= 5),
      comment TEXT,
      photo_url VARCHAR(500),
      checkin_latitude DECIMAL(10, 8),
      checkin_longitude DECIMAL(11, 8),
      event_date DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      toast_count INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON checkins(user_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_checkins_band_id ON checkins(band_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_checkins_venue_id ON checkins(venue_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_checkins_created_at ON checkins(created_at DESC);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_checkins_event_date ON checkins(event_date);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_checkins_rating ON checkins(rating);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_checkins_user_created ON checkins(user_id, created_at DESC);`);

  // -------------------------------------------------------
  // 11. checkin_vibes (FK to checkins, vibe_tags)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS checkin_vibes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
      vibe_tag_id UUID NOT NULL REFERENCES vibe_tags(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(checkin_id, vibe_tag_id)
    );
  `);

  // -------------------------------------------------------
  // 12. user_badges (FK to users, badges)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_badges (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
      earned_checkin_id UUID REFERENCES checkins(id) ON DELETE SET NULL,
      earned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, badge_id)
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);`);

  // -------------------------------------------------------
  // 13. deletion_requests (FK to users)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS deletion_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
      requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
      completed_at TIMESTAMP WITH TIME ZONE,
      cancelled_at TIMESTAMP WITH TIME ZONE
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON deletion_requests(user_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests(status);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_deletion_requests_scheduled ON deletion_requests(scheduled_for);`);

  // -------------------------------------------------------
  // 14. user_consents (FK to users)
  // -------------------------------------------------------
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS user_consents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose VARCHAR(50) NOT NULL,
      granted BOOLEAN NOT NULL,
      recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      ip_address VARCHAR(45),
      user_agent TEXT
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents(user_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_user_consents_purpose ON user_consents(user_id, purpose);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_user_consents_recorded ON user_consents(recorded_at);`);

  // -------------------------------------------------------
  // Triggers: update_updated_at_column for base tables
  // -------------------------------------------------------
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  pgm.sql(`
    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  pgm.sql(`
    DROP TRIGGER IF EXISTS update_venues_updated_at ON venues;
    CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON venues
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  pgm.sql(`
    DROP TRIGGER IF EXISTS update_bands_updated_at ON bands;
    CREATE TRIGGER update_bands_updated_at BEFORE UPDATE ON bands
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  pgm.sql(`
    DROP TRIGGER IF EXISTS update_checkins_updated_at ON checkins;
    CREATE TRIGGER update_checkins_updated_at BEFORE UPDATE ON checkins
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);

  // -------------------------------------------------------
  // CFR-043: Ensure average_rating columns exist on bands/venues
  // -------------------------------------------------------
  pgm.sql(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bands' AND column_name = 'average_rating'
      ) THEN
        ALTER TABLE bands ADD COLUMN average_rating NUMERIC(3,2) DEFAULT NULL;
      END IF;
    END $$;
  `);

  pgm.sql(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'venues' AND column_name = 'average_rating'
      ) THEN
        ALTER TABLE venues ADD COLUMN average_rating NUMERIC(3,2) DEFAULT NULL;
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop in reverse FK dependency order
  pgm.sql(`DROP TABLE IF EXISTS user_consents;`);
  pgm.sql(`DROP TABLE IF EXISTS deletion_requests;`);
  pgm.sql(`DROP TABLE IF EXISTS user_badges;`);
  pgm.sql(`DROP TABLE IF EXISTS checkin_vibes;`);
  pgm.sql(`DROP TABLE IF EXISTS checkins;`);
  pgm.sql(`DROP TABLE IF EXISTS user_wishlist;`);
  pgm.sql(`DROP TABLE IF EXISTS user_followers;`);
  pgm.sql(`DROP TABLE IF EXISTS user_social_accounts;`);
  pgm.sql(`DROP TABLE IF EXISTS refresh_tokens;`);
  pgm.sql(`DROP TABLE IF EXISTS badges;`);
  pgm.sql(`DROP TABLE IF EXISTS vibe_tags;`);
  pgm.sql(`DROP TABLE IF EXISTS bands;`);
  pgm.sql(`DROP TABLE IF EXISTS venues;`);
  pgm.sql(`DROP TABLE IF EXISTS users;`);
}
