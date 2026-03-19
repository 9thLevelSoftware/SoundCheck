-- SoundCheck Database Schema
-- PostgreSQL Database Design - "Untappd for Music" Model
-- The Check-in is King
--
-- NOTE: This file is a reference schema for documentation purposes.
-- The authoritative schema is produced by running the migration chain
-- (backend/migrations/*.ts). Changes here MUST be synced with migrations
-- to avoid schema drift (CFR-022, CFR-042, DI-020).

-- Create database (run this separately)
-- CREATE DATABASE soundcheck;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Users table
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
    -- Gamification stats (denormalized for performance)
    -- DB-020: NOT NULL matches migration 040
    total_checkins INTEGER NOT NULL DEFAULT 0,
    unique_bands INTEGER NOT NULL DEFAULT 0,
    unique_venues INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Venues table (The "Brewery/Bar")
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
    venue_type VARCHAR(50), -- 'concert_hall', 'club', 'arena', 'outdoor', 'bar', 'theater', 'stadium', 'other'
    image_url VARCHAR(500),
    cover_image_url VARCHAR(500),
    -- Stats (DB-020: NOT NULL matches migration 041; DI-021: total_reviews from migration 047)
    total_checkins INTEGER NOT NULL DEFAULT 0,
    unique_visitors INTEGER NOT NULL DEFAULT 0,
    total_reviews INTEGER NOT NULL DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0.00,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bands table (The "Beer")
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
    image_url VARCHAR(500), -- Square logo
    cover_image_url VARCHAR(500),
    hometown VARCHAR(255),
    -- Stats (DB-020: NOT NULL matches migration 041; DI-005/DI-021: columns from migration 047)
    total_checkins INTEGER NOT NULL DEFAULT 0,
    unique_fans INTEGER NOT NULL DEFAULT 0,
    monthly_checkins INTEGER NOT NULL DEFAULT 0,
    total_reviews INTEGER NOT NULL DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- CHECK-IN SYSTEM (The Core Feature)
-- =====================================================

-- Vibe tags (predefined tags for check-ins)
CREATE TABLE IF NOT EXISTS vibe_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL, -- 'mosh_pit', 'acoustic', 'crowd_surfing', etc.
    display_name VARCHAR(50) NOT NULL, -- 'Mosh Pit', 'Acoustic', 'Crowd Surfing'
    icon VARCHAR(50), -- emoji or icon name
    category VARCHAR(50), -- 'energy', 'sound', 'crowd', 'atmosphere'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Check-ins table (The King)
-- DB-020: band_id and venue_id are nullable (event-based check-ins derive them
-- from event_lineup and events tables). rating default is 0, not NOT NULL.
CREATE TABLE IF NOT EXISTS checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    band_id UUID REFERENCES bands(id) ON DELETE CASCADE,
    venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    -- Rating (0-5, allows half stars via decimal)
    rating DECIMAL(2, 1) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    venue_rating DECIMAL(2, 1) CHECK (venue_rating >= 0 AND venue_rating <= 5),
    -- Content
    comment TEXT, -- "What's the vibe?" - optional review text
    photo_url VARCHAR(500), -- Concert photo
    -- Location data (for verification)
    checkin_latitude DECIMAL(10, 8),
    checkin_longitude DECIMAL(11, 8),
    is_verified BOOLEAN DEFAULT FALSE,
    is_hidden BOOLEAN DEFAULT FALSE,
    -- Timestamps
    event_date DATE, -- Date of the concert
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Denormalized counts for performance (migration 024 + 037)
    toast_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0
);

-- Check-in vibe tags (many-to-many)
CREATE TABLE IF NOT EXISTS checkin_vibes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
    vibe_tag_id UUID NOT NULL REFERENCES vibe_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(checkin_id, vibe_tag_id)
);

-- Check-in band ratings (per-band ratings within a multi-band event)
CREATE TABLE IF NOT EXISTS checkin_band_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
    band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    rating DECIMAL(2, 1) NOT NULL CHECK (rating >= 0.5 AND rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(checkin_id, band_id)
);

-- =====================================================
-- SOCIAL INTERACTIONS
-- =====================================================

-- Toasts (like "fist bumps" - Untappd's likes)
CREATE TABLE IF NOT EXISTS toasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, checkin_id)
);

-- Comments on check-ins
CREATE TABLE IF NOT EXISTS checkin_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User followers (social graph)
CREATE TABLE IF NOT EXISTS user_followers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id),
    CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

-- User blocks (trust & safety)
CREATE TABLE IF NOT EXISTS user_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_id)
);

-- =====================================================
-- GAMIFICATION
-- =====================================================

-- Badges table
CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon_url VARCHAR(500),
    badge_type VARCHAR(50), -- 'checkin_count', 'unique_bands', 'unique_venues', 'genre_master', etc.
    requirement_value INTEGER, -- threshold for earning badge
    criteria JSONB, -- data-driven evaluation criteria (migration 008)
    color VARCHAR(7), -- hex color code
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User badges (many-to-many)
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    -- The check-in that earned this badge (for display)
    earned_checkin_id UUID REFERENCES checkins(id) ON DELETE SET NULL,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, badge_id)
);

-- =====================================================
-- EVENTS (Replaces legacy shows table for multi-band events)
-- =====================================================

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    event_name VARCHAR(500),
    doors_time TIME,
    start_time TIME,
    end_time TIME,
    ticket_url VARCHAR(500),
    ticket_price_min DECIMAL(10, 2),
    ticket_price_max DECIMAL(10, 2),
    description TEXT,
    image_url VARCHAR(500),
    source VARCHAR(50) DEFAULT 'user_created', -- 'user_created', 'ticketmaster', 'setlist_fm'
    external_id VARCHAR(500),
    is_verified BOOLEAN DEFAULT FALSE,
    is_sold_out BOOLEAN DEFAULT FALSE,
    is_cancelled BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'scheduled',
    total_checkins INTEGER NOT NULL DEFAULT 0,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Event lineup (many-to-many between events and bands)
CREATE TABLE IF NOT EXISTS event_lineup (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    set_order INTEGER DEFAULT 1,
    is_headliner BOOLEAN DEFAULT FALSE,
    set_time TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, band_id)
);

-- Event RSVPs
CREATE TABLE IF NOT EXISTS event_rsvps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'going',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id)
);

-- Legacy shows table (kept for backward compatibility with notifications FK)
CREATE TABLE IF NOT EXISTS shows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    show_date DATE NOT NULL,
    doors_time TIME,
    start_time TIME,
    end_time TIME,
    ticket_url VARCHAR(500),
    ticket_price_min DECIMAL(10, 2),
    ticket_price_max DECIMAL(10, 2),
    is_sold_out BOOLEAN DEFAULT FALSE,
    is_cancelled BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User wishlists (bands they want to see)
CREATE TABLE IF NOT EXISTS user_wishlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    notify_when_nearby BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, band_id)
);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'toast', 'comment', 'badge_earned', 'friend_checkin', 'show_reminder', 'new_follower'
    title VARCHAR(255),
    message TEXT,
    -- Reference IDs
    checkin_id UUID REFERENCES checkins(id) ON DELETE CASCADE,
    from_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    badge_id UUID REFERENCES badges(id) ON DELETE CASCADE,
    show_id UUID REFERENCES shows(id) ON DELETE CASCADE,
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_location ON users(location);

-- Venues
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city);
CREATE INDEX IF NOT EXISTS idx_venues_venue_type ON venues(venue_type);
CREATE INDEX IF NOT EXISTS idx_venues_location ON venues(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_venues_rating ON venues(average_rating DESC);

-- Bands
CREATE INDEX IF NOT EXISTS idx_bands_genre ON bands(genre);
CREATE INDEX IF NOT EXISTS idx_bands_rating ON bands(average_rating DESC);
CREATE INDEX IF NOT EXISTS idx_bands_checkins ON bands(total_checkins DESC);

-- Check-ins (most critical for feed performance)
CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_band_id ON checkins(band_id);
CREATE INDEX IF NOT EXISTS idx_checkins_venue_id ON checkins(venue_id);
CREATE INDEX IF NOT EXISTS idx_checkins_created_at ON checkins(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_event_date ON checkins(event_date);
CREATE INDEX IF NOT EXISTS idx_checkins_rating ON checkins(rating);
-- Composite index for feed queries
CREATE INDEX IF NOT EXISTS idx_checkins_user_created ON checkins(user_id, created_at DESC);
-- DB-016: Index for recommendation exclusion (migration 047)
CREATE INDEX IF NOT EXISTS idx_checkins_user_event ON checkins(user_id, event_id);

-- Social
CREATE INDEX IF NOT EXISTS idx_toasts_checkin_id ON toasts(checkin_id);
CREATE INDEX IF NOT EXISTS idx_toasts_user_id ON toasts(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_checkin_id ON checkin_comments(checkin_id);
CREATE INDEX IF NOT EXISTS idx_followers_follower ON user_followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following ON user_followers(following_id);

-- Badges
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);

-- Events
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
-- DB-011: Dedup index for user-created events (migration 047)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_user_dedup
  ON events (venue_id, event_date, event_name, created_by_user_id)
  WHERE source = 'user_created';

-- Shows (legacy)
CREATE INDEX IF NOT EXISTS idx_shows_venue_id ON shows(venue_id);
CREATE INDEX IF NOT EXISTS idx_shows_band_id ON shows(band_id);
CREATE INDEX IF NOT EXISTS idx_shows_date ON shows(show_date);

-- Wishlists
CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON user_wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_band_id ON user_wishlist(band_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user_created ON user_wishlist(user_id, created_at DESC);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_venues_updated_at ON venues;
CREATE TRIGGER update_venues_updated_at BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bands_updated_at ON bands;
CREATE TRIGGER update_bands_updated_at BEFORE UPDATE ON bands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_checkins_updated_at ON checkins;
CREATE TRIGGER update_checkins_updated_at BEFORE UPDATE ON checkins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_comments_updated_at ON checkin_comments;
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON checkin_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_shows_updated_at ON shows;
CREATE TRIGGER update_shows_updated_at BEFORE UPDATE ON shows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTIONS FOR STATS
-- =====================================================

-- Function to update user stats after check-in (synced with migration 009)
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
            FROM events e WHERE e.id = NEW.event_id;

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
        UPDATE users SET total_checkins = total_checkins + 1 WHERE id = NEW.user_id;

        -- Update unique bands count
        UPDATE users SET unique_bands = (
            SELECT COUNT(DISTINCT band_id) FROM (
                SELECT band_id FROM checkins WHERE user_id = NEW.user_id AND band_id IS NOT NULL
                UNION
                SELECT el.band_id FROM checkins c
                JOIN event_lineup el ON c.event_id = el.event_id
                WHERE c.user_id = NEW.user_id AND c.event_id IS NOT NULL
            ) sub
        ) WHERE id = NEW.user_id;

        -- Update unique venues count
        UPDATE users SET unique_venues = (
            SELECT COUNT(DISTINCT venue_id) FROM (
                SELECT venue_id FROM checkins WHERE user_id = NEW.user_id AND venue_id IS NOT NULL
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
                        WHERE band_id = v_band_id AND rating IS NOT NULL AND rating > 0
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
                        WHERE venue_id = v_venue_id AND rating IS NOT NULL AND rating > 0
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

DROP TRIGGER IF EXISTS trigger_update_stats_on_checkin ON checkins;
CREATE TRIGGER trigger_update_stats_on_checkin
    AFTER INSERT ON checkins
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats_on_checkin();

-- DB-009/CFR-042/DI-004: Toast count trigger with GREATEST() and parent-exists guard
-- Synced with migration 037 + 047
CREATE OR REPLACE FUNCTION update_checkin_toast_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF EXISTS (SELECT 1 FROM checkins WHERE id = NEW.checkin_id) THEN
            UPDATE checkins SET toast_count = toast_count + 1 WHERE id = NEW.checkin_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM checkins WHERE id = OLD.checkin_id) THEN
            UPDATE checkins SET toast_count = GREATEST(toast_count - 1, 0) WHERE id = OLD.checkin_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_toast_count_insert ON toasts;
CREATE TRIGGER trg_toast_count_insert
    AFTER INSERT ON toasts
    FOR EACH ROW
    EXECUTE FUNCTION update_checkin_toast_count();

DROP TRIGGER IF EXISTS trg_toast_count_delete ON toasts;
CREATE TRIGGER trg_toast_count_delete
    AFTER DELETE ON toasts
    FOR EACH ROW
    EXECUTE FUNCTION update_checkin_toast_count();

-- DB-009/CFR-042/DI-004: Comment count trigger with GREATEST() and parent-exists guard
-- Synced with migration 037 + 047
CREATE OR REPLACE FUNCTION update_checkin_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF EXISTS (SELECT 1 FROM checkins WHERE id = NEW.checkin_id) THEN
            UPDATE checkins SET comment_count = comment_count + 1 WHERE id = NEW.checkin_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        IF EXISTS (SELECT 1 FROM checkins WHERE id = OLD.checkin_id) THEN
            UPDATE checkins SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.checkin_id;
        END IF;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comment_count_insert ON checkin_comments;
CREATE TRIGGER trg_comment_count_insert
    AFTER INSERT ON checkin_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_checkin_comment_count();

DROP TRIGGER IF EXISTS trg_comment_count_delete ON checkin_comments;
CREATE TRIGGER trg_comment_count_delete
    AFTER DELETE ON checkin_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_checkin_comment_count();

-- =====================================================
-- SEED DATA
-- =====================================================

-- Insert default vibe tags
INSERT INTO vibe_tags (name, display_name, icon, category) VALUES
('mosh_pit', 'Mosh Pit', '🤘', 'energy'),
('crowd_surfing', 'Crowd Surfing', '🏄', 'energy'),
('wall_of_death', 'Wall of Death', '💀', 'energy'),
('headbanging', 'Headbanging', '🎸', 'energy'),
('acoustic', 'Acoustic', '🎵', 'sound'),
('great_sound', 'Great Sound', '🔊', 'sound'),
('too_loud', 'Too Loud', '📢', 'sound'),
('intimate', 'Intimate', '🕯️', 'atmosphere'),
('epic_lighting', 'Epic Lighting', '✨', 'atmosphere'),
('pyro', 'Pyro', '🔥', 'atmosphere'),
('packed', 'Packed House', '👥', 'crowd'),
('good_vibes', 'Good Vibes', '✌️', 'crowd'),
('singing_along', 'Singing Along', '🎤', 'crowd'),
('encore', 'Epic Encore', '🙌', 'atmosphere'),
('meet_and_greet', 'Meet & Greet', '🤝', 'special')
ON CONFLICT (name) DO NOTHING;

-- Insert default badges
INSERT INTO badges (name, description, badge_type, requirement_value, color) VALUES
('First Check-in', 'Check in to your first show', 'checkin_count', 1, '#4CAF50'),
('Regular', 'Check in to 10 shows', 'checkin_count', 10, '#2196F3'),
('Concert Junkie', 'Check in to 50 shows', 'checkin_count', 50, '#9C27B0'),
('Living Legend', 'Check in to 100 shows', 'checkin_count', 100, '#FFD700'),
('Mosh Pit Hero', 'Check in with the Mosh Pit vibe 5 times', 'vibe_mosh_pit', 5, '#F44336'),
('Venue Explorer', 'Check in at 5 different venues', 'unique_venues', 5, '#00BCD4'),
('Venue Master', 'Check in at 25 different venues', 'unique_venues', 25, '#3F51B5'),
('Band Hunter', 'Check in to 10 different bands', 'unique_bands', 10, '#E91E63'),
('Music Connoisseur', 'Check in to 50 different bands', 'unique_bands', 50, '#673AB7'),
('Weekend Warrior', 'Check in on Friday, Saturday, and Sunday in one weekend', 'weekend_warrior', 1, '#FF5722'),
('Night Owl', 'Check in after midnight', 'night_owl', 1, '#1A237E'),
('Early Bird', 'Be one of the first 10 to check in at a new venue', 'early_bird', 1, '#FFC107'),
('Social Butterfly', 'Get 50 toasts on your check-ins', 'toasts_received', 50, '#8BC34A'),
('Loyal Fan', 'Check in to the same band 5 times', 'loyal_fan', 5, '#FF4081'),
('Genre Master', 'Check in to 20 shows of the same genre', 'genre_master', 20, '#7C4DFF')
ON CONFLICT (name) DO NOTHING;

-- NOTE: Reviews tables were dropped in migration 043. They are no longer
-- part of the schema. Ratings are derived from checkin_band_ratings.

-- =====================================================
-- REFRESH TOKENS (JWT Revocation Support)
-- =====================================================

-- Refresh tokens for JWT revocation
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
-- Composite index for cleanup queries (expired or revoked tokens)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_cleanup ON refresh_tokens(expires_at, revoked_at);

-- =====================================================
-- GDPR COMPLIANCE - ACCOUNT DELETION REQUESTS
-- =====================================================

-- Account deletion requests for GDPR compliance
-- Implements a 30-day grace period before permanent deletion/anonymization
CREATE TABLE IF NOT EXISTS deletion_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_scheduled ON deletion_requests(scheduled_for);

-- =====================================================
-- GDPR COMPLIANCE - USER CONSENTS
-- =====================================================

-- Consent records for GDPR compliance
-- Tracks user consent for various data processing purposes with full audit trail
CREATE TABLE IF NOT EXISTS user_consents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(50) NOT NULL,
    granted BOOLEAN NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_purpose ON user_consents(user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_user_consents_recorded ON user_consents(recorded_at);

-- =====================================================
-- SOCIAL AUTHENTICATION ACCOUNTS
-- =====================================================

-- Social authentication accounts for Google, Apple, Facebook sign-in
CREATE TABLE IF NOT EXISTS user_social_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'apple', 'facebook')),
    provider_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_user_social_accounts_user ON user_social_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_social_accounts_provider ON user_social_accounts(provider, provider_id);
