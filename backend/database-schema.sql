-- SoundCheck Database Schema
-- PostgreSQL Database Design - "Untappd for Music" Model
-- The Check-in is King

-- Create database (run this separately)
-- CREATE DATABASE soundcheck;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
    total_checkins INTEGER DEFAULT 0,
    unique_bands INTEGER DEFAULT 0,
    unique_venues INTEGER DEFAULT 0,
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
    -- Stats
    total_checkins INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0.00,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
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
    -- Stats
    total_checkins INTEGER DEFAULT 0,
    unique_fans INTEGER DEFAULT 0,
    monthly_checkins INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
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

-- Check-ins table (The King - replaces Reviews)
CREATE TABLE IF NOT EXISTS checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    -- Rating (0-5, allows half stars via decimal)
    rating DECIMAL(2, 1) NOT NULL CHECK (rating >= 0 AND rating <= 5),
    -- Content
    comment TEXT, -- "What's the vibe?" - optional review text
    photo_url VARCHAR(500), -- Concert photo
    -- Location data (for verification)
    checkin_latitude DECIMAL(10, 8),
    checkin_longitude DECIMAL(11, 8),
    -- Timestamps
    event_date DATE, -- Date of the concert
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Denormalized counts for performance
    toast_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0
);

-- Check-in vibe tags (many-to-many)
CREATE TABLE IF NOT EXISTS checkin_vibes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
    vibe_tag_id UUID NOT NULL REFERENCES vibe_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(checkin_id, vibe_tag_id)
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
-- EVENTS & SHOWS (Venue "Beer Menu" equivalent)
-- =====================================================

-- Upcoming shows at venues
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

-- Wishlist indexes
CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON user_wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_band_id ON user_wishlist(band_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_user_created ON user_wishlist(user_id, created_at DESC);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'toast', 'comment', 'badge_earned', 'friend_checkin', 'show_reminder'
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

-- Social
CREATE INDEX IF NOT EXISTS idx_toasts_checkin_id ON toasts(checkin_id);
CREATE INDEX IF NOT EXISTS idx_toasts_user_id ON toasts(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_checkin_id ON checkin_comments(checkin_id);
CREATE INDEX IF NOT EXISTS idx_followers_follower ON user_followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following ON user_followers(following_id);

-- Badges
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);

-- Shows
CREATE INDEX IF NOT EXISTS idx_shows_venue_id ON shows(venue_id);
CREATE INDEX IF NOT EXISTS idx_shows_band_id ON shows(band_id);
CREATE INDEX IF NOT EXISTS idx_shows_date ON shows(show_date);

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

-- Function to update user stats after check-in
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
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_stats_on_checkin ON checkins;
CREATE TRIGGER trigger_update_stats_on_checkin
    AFTER INSERT ON checkins
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats_on_checkin();

-- Function to update toast count
CREATE OR REPLACE FUNCTION update_toast_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE checkins SET toast_count = toast_count + 1 WHERE id = NEW.checkin_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE checkins SET toast_count = toast_count - 1 WHERE id = OLD.checkin_id;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_toast_count ON toasts;
CREATE TRIGGER trigger_update_toast_count
    AFTER INSERT OR DELETE ON toasts
    FOR EACH ROW
    EXECUTE FUNCTION update_toast_count();

-- Function to update comment count
CREATE OR REPLACE FUNCTION update_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE checkins SET comment_count = comment_count + 1 WHERE id = NEW.checkin_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE checkins SET comment_count = comment_count - 1 WHERE id = OLD.checkin_id;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_comment_count ON checkin_comments;
CREATE TRIGGER trigger_update_comment_count
    AFTER INSERT OR DELETE ON checkin_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_comment_count();

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

-- =====================================================
-- REVIEWS (Venue and Band Reviews)
-- =====================================================

-- Reviews for venues and bands
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
    band_id UUID REFERENCES bands(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(100),
    content TEXT,
    event_date DATE,
    image_urls TEXT[], -- Array of image URLs
    is_verified BOOLEAN DEFAULT FALSE,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Ensure review is for either venue OR band, not both or neither
    CONSTRAINT review_target_check CHECK (
        (venue_id IS NOT NULL AND band_id IS NULL) OR
        (venue_id IS NULL AND band_id IS NOT NULL)
    )
);

-- Review helpfulness tracking (users marking reviews as helpful)
CREATE TABLE IF NOT EXISTS review_helpfulness (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_helpful BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(review_id, user_id)
);

-- Reviews indexes
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_venue ON reviews(venue_id);
CREATE INDEX IF NOT EXISTS idx_reviews_band ON reviews(band_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_helpful ON reviews(helpful_count DESC);

-- Review helpfulness indexes
CREATE INDEX IF NOT EXISTS idx_review_helpfulness_review ON review_helpfulness(review_id);
CREATE INDEX IF NOT EXISTS idx_review_helpfulness_user ON review_helpfulness(user_id);

-- Trigger for reviews updated_at
DROP TRIGGER IF EXISTS update_reviews_updated_at ON reviews;
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
