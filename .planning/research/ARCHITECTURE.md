# Architecture Patterns

**Domain:** Social concert check-in app (Untappd for live music)
**Researched:** 2026-02-02
**Confidence:** HIGH (based on existing codebase analysis + domain pattern research)

---

## Executive Summary

The current SoundCheck architecture has solid foundations (MVC + service layer backend, clean architecture mobile, WebSocket real-time) but a critical structural gap: events are not first-class entities. The `shows` table models a 1:1 relationship between venue+band+date, with no concept of multi-band lineups. Check-ins reference bands and venues directly rather than events. The badge system evaluates against the `reviews` table rather than check-ins, and uses generic badge types rather than concert-specific ones.

This document defines the target architecture for the redesign: a new data model centered on events with lineups, a dual-rating system, an event-driven badge computation engine, a hybrid push/pull activity feed, and a multi-source event ingestion pipeline -- all building on the existing Node/Express/PostgreSQL/Flutter stack.

---

## 1. Database Schema Design

### 1.1 Current Schema Problems

| Problem | Current State | Impact |
|---------|--------------|--------|
| No event entity | `shows` table = 1 venue + 1 band + 1 date | Cannot model festivals, multi-band bills, openers/headliners |
| Single rating | `checkins.rating` is one DECIMAL | Cannot separate band performance from venue experience |
| Check-in references band+venue directly | `checkins.band_id` + `checkins.venue_id` | No connection to the event context; duplicate data |
| Badge system queries `reviews` table | `BadgeService.getUserStats()` counts reviews | Badges disconnected from check-in activity |
| No lineup ordering | N/A | Cannot distinguish headliner from opener |
| No external event IDs | Events not linked to Songkick/Bandsintown/Ticketmaster | Cannot deduplicate ingested events |

### 1.2 Target Schema

The migration script (`migrate-events-model.ts`) already started this transition but is incomplete. It created an `events` table with a single `band_id` (still 1:1). The target schema below completes the redesign.

#### Core Entity: events

```sql
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    event_name VARCHAR(255),         -- "Summer Bash 2026" or auto-generated
    description TEXT,
    doors_time TIME,
    start_time TIME,
    end_time TIME,
    ticket_url VARCHAR(500),
    ticket_price_min DECIMAL(10, 2),
    ticket_price_max DECIMAL(10, 2),
    is_sold_out BOOLEAN DEFAULT FALSE,
    is_cancelled BOOLEAN DEFAULT FALSE,
    event_type VARCHAR(50) DEFAULT 'concert',  -- 'concert', 'festival', 'open_mic', 'dj_set'
    -- Source tracking for deduplication
    source VARCHAR(50) DEFAULT 'user_created',  -- 'ticketmaster', 'bandsintown', 'songkick', 'user_created'
    external_id VARCHAR(255),                    -- ID from source API
    -- Metadata
    created_by_user_id UUID REFERENCES users(id),
    is_verified BOOLEAN DEFAULT FALSE,
    -- Denormalized stats
    total_checkins INTEGER DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Dedup constraint: one event per venue per date per external source
    CONSTRAINT unique_external_event UNIQUE(source, external_id)
);
```

**Key design decision:** Events are venue+date, NOT venue+band+date. This allows multi-band lineups. The old `shows` table conflated event identity with lineup.

#### Lineup: event_lineup

```sql
CREATE TABLE IF NOT EXISTS event_lineup (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    set_order INTEGER NOT NULL DEFAULT 0,         -- 0=opener, 1=support, 2=headliner
    set_time TIME,                                 -- Scheduled set time if known
    is_headliner BOOLEAN DEFAULT FALSE,
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_lineup_slot UNIQUE(event_id, band_id)
);

CREATE INDEX IF NOT EXISTS idx_lineup_event ON event_lineup(event_id);
CREATE INDEX IF NOT EXISTS idx_lineup_band ON event_lineup(band_id);
CREATE INDEX IF NOT EXISTS idx_lineup_order ON event_lineup(event_id, set_order);
```

**Why a join table, not an array column:** PostgreSQL arrays cannot be foreign-keyed. A join table lets us enforce referential integrity, add per-band metadata (set_order, set_time), and query "what events is band X playing?" efficiently.

#### Check-ins: checkins (redesigned)

```sql
CREATE TABLE IF NOT EXISTS checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    -- Dual ratings (both optional for quick check-in)
    venue_rating DECIMAL(2, 1) CHECK (venue_rating IS NULL OR (venue_rating >= 0.5 AND venue_rating <= 5)),
    -- Per-set band ratings stored in checkin_band_ratings table
    -- Content
    review_text TEXT,
    image_urls TEXT[],                             -- Multiple photo support
    -- Location verification
    checkin_latitude DECIMAL(10, 8),
    checkin_longitude DECIMAL(11, 8),
    is_verified BOOLEAN DEFAULT FALSE,             -- Within venue radius?
    -- Denormalized counts
    toast_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- One check-in per user per event
    CONSTRAINT unique_user_event_checkin UNIQUE(user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_event ON checkins(event_id);
CREATE INDEX IF NOT EXISTS idx_checkins_created ON checkins(created_at DESC);
-- Composite for feed queries
CREATE INDEX IF NOT EXISTS idx_checkins_user_created ON checkins(user_id, created_at DESC);
```

**Key design decision:** Check-in references event_id only (not band_id + venue_id). The event contains the venue. Band ratings go in a separate table to support per-set ratings within multi-band events.

#### Per-Set Band Ratings: checkin_band_ratings

```sql
CREATE TABLE IF NOT EXISTS checkin_band_ratings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
    band_id UUID NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
    rating DECIMAL(2, 1) NOT NULL CHECK (rating >= 0.5 AND rating <= 5),
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_checkin_band_rating UNIQUE(checkin_id, band_id)
);

CREATE INDEX IF NOT EXISTS idx_band_ratings_checkin ON checkin_band_ratings(checkin_id);
CREATE INDEX IF NOT EXISTS idx_band_ratings_band ON checkin_band_ratings(band_id);
```

**Rationale:** A user at a 3-band show can rate each band independently. This is the "per-set rating" feature. The join is cheap because lineup size is small (typically 1-5 bands).

#### Badges: badges (extended)

```sql
-- The existing badges table structure is adequate, but badge_type needs new values.
-- Add new badge types via seed data:

-- Genre-based badges require genre tracking on bands
-- (bands.genre already exists as VARCHAR)

-- New badge_type enum values needed:
-- 'genre_explorer_rock', 'genre_explorer_metal', 'genre_explorer_jazz', etc.
-- 'venue_collector'
-- 'superfan'           (same band N times)
-- 'festival_warrior'   (N check-ins in one day/weekend)
-- 'checkin_count'      (already exists)
-- 'unique_venues'      (already exists)
-- 'unique_bands'       (already exists)

-- Badge criteria table for complex rules
CREATE TABLE IF NOT EXISTS badge_criteria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    criteria_type VARCHAR(50) NOT NULL,   -- 'genre', 'band_repeat', 'time_window', 'venue_type'
    criteria_value VARCHAR(255) NOT NULL, -- 'rock', band_id, '24h', 'arena'
    threshold INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_badge_criteria UNIQUE(badge_id, criteria_type, criteria_value)
);
```

**Why badge_criteria table:** The current `badges` table has `badge_type` + `requirement_value` which only supports simple threshold badges. Complex rules like "see 5 different rock bands" require a criteria type (genre) + criteria value (rock) + threshold (5). This table makes badge rules data-driven rather than hardcoded in BadgeService.

#### Feed Materialization: activity_feed (optional, for performance)

```sql
-- Only needed if pull-based feed queries become too slow.
-- Start without this table; add when feed latency > 200ms.

CREATE TABLE IF NOT EXISTS activity_feed (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,                         -- Feed owner (the viewer)
    checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
    actor_user_id UUID NOT NULL,                   -- Who did the action
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,  -- Copy of checkin.created_at
    -- No UNIQUE constraint: a checkin appears in many users' feeds
    CONSTRAINT fk_feed_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feed_user_created ON activity_feed(user_id, created_at DESC);
```

**Decision: Start with pull model, migrate to hybrid if needed.** At SoundCheck's current scale (pre-launch), a pull query joining checkins + user_followers is sufficient. The activity_feed table is the escape hatch for fan-out-on-write when performance requires it.

### 1.3 Entity Relationship Summary

```
users ----< checkins >---- events ----< event_lineup >---- bands
  |             |              |
  |             |              |---- venues
  |             |
  |             +----< checkin_band_ratings >---- bands
  |             +----< checkin_vibes >---- vibe_tags
  |             +----< toasts
  |             +----< checkin_comments
  |
  +----< user_badges >---- badges ----< badge_criteria
  +----< user_followers
  +----< user_wishlist >---- bands
  +----< notifications
```

### 1.4 Rating Aggregation Strategy

**Dual ratings create two independent aggregation paths:**

| Rating Type | Stored On | Aggregated To | Query Pattern |
|-------------|-----------|---------------|---------------|
| Venue rating | `checkins.venue_rating` | `venues.average_rating` | `AVG(c.venue_rating) FROM checkins c JOIN events e ON c.event_id = e.id WHERE e.venue_id = ?` |
| Band rating | `checkin_band_ratings.rating` | `bands.average_rating` | `AVG(cbr.rating) FROM checkin_band_ratings cbr WHERE cbr.band_id = ?` |

**Aggregation approach:** Denormalized averages on `venues.average_rating` and `bands.average_rating` updated via PostgreSQL triggers (existing pattern). The trigger fires on INSERT/UPDATE/DELETE of checkins and checkin_band_ratings respectively.

```sql
-- Venue rating aggregation trigger
CREATE OR REPLACE FUNCTION update_venue_rating_on_checkin()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE venues SET
        average_rating = COALESCE(
            (SELECT AVG(c.venue_rating)
             FROM checkins c
             JOIN events e ON c.event_id = e.id
             WHERE e.venue_id = (SELECT venue_id FROM events WHERE id = NEW.event_id)
             AND c.venue_rating IS NOT NULL),
            0
        ),
        total_checkins = (
            SELECT COUNT(*) FROM checkins c
            JOIN events e ON c.event_id = e.id
            WHERE e.venue_id = (SELECT venue_id FROM events WHERE id = NEW.event_id)
        )
    WHERE id = (SELECT venue_id FROM events WHERE id = NEW.event_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Band rating aggregation trigger
CREATE OR REPLACE FUNCTION update_band_rating_on_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE bands SET
        average_rating = COALESCE(
            (SELECT AVG(rating) FROM checkin_band_ratings WHERE band_id = NEW.band_id),
            0
        ),
        total_checkins = (
            SELECT COUNT(*) FROM checkin_band_ratings WHERE band_id = NEW.band_id
        )
    WHERE id = NEW.band_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 2. Component Boundaries

### 2.1 Backend Service Architecture

The existing MVC + service layer pattern works well. The redesign adds new services and refactors existing ones.

```
                    +-----------------+
                    |   Express App   |
                    |   (index.ts)    |
                    +--------+--------+
                             |
              +--------------+--------------+
              |              |              |
        +-----v-----+  +----v----+  +------v------+
        |  Routes    |  |  WS    |  | Middleware   |
        | (REST API) |  | Server |  | (Auth, Rate) |
        +-----+------+  +----+---+  +------+------+
              |              |              |
        +-----v--------------v--------------v------+
        |              Controllers                   |
        +-----+------+------+------+------+---------+
              |      |      |      |      |
     +--------v--+ +-v------v-+ +--v------v--+ +----v------+
     | EventSvc  | |CheckinSvc| | BadgeSvc   | | FeedSvc   |
     | (NEW)     | |(REDESIGN)| | (REDESIGN) | | (NEW)     |
     +-----------+ +----------+ +------------+ +-----------+
     | IngestSvc | | RatingSvc| | StatsSvc   | | RecommSvc |
     | (NEW)     | | (NEW)   | | (NEW)      | | (NEW)     |
     +-----------+ +----------+ +------------+ +-----------+
              |         |            |              |
        +-----v---------v------------v--------------v------+
        |              Database (PostgreSQL)                 |
        |              Cache (Redis)                         |
        +---------------------------------------------------+
```

### 2.2 New and Redesigned Services

| Service | Status | Responsibility | Talks To |
|---------|--------|----------------|----------|
| **EventService** | REDESIGN | CRUD for events + lineups, event search, nearby events | Database, IngestService |
| **CheckinService** | REDESIGN | Create check-in (event-based), dual ratings, location verify | Database, BadgeService, FeedService, WebSocket |
| **BadgeService** | REDESIGN | Rule-engine badge evaluation, progress tracking, rarity calc | Database, NotificationService |
| **FeedService** | NEW | Activity feed generation (friends/nearby/global), feed caching | Database, Redis |
| **IngestService** | NEW | Event data pipeline from external APIs, dedup, merge | Ticketmaster API, Bandsintown API, Database |
| **RatingService** | NEW | Rating aggregation, trend calculation | Database |
| **StatsService** | NEW | User profile stats (concert cred), leaderboards | Database, Redis |
| **RecommendationService** | NEW | Genre-based and social recommendations | Database, Redis |
| VenueService | EXISTS | Keep; add aggregate venue rating from dual system | Database |
| BandService | EXISTS | Keep; add aggregate band rating from dual system | Database |
| NotificationService | EXISTS | Keep; add event-id references | Database, WebSocket |
| FoursquareService | EXISTS | Keep as-is | Foursquare API |
| MusicBrainzService | EXISTS | Keep as-is | MusicBrainz API |
| SetlistFmService | EXISTS | Keep as-is | SetlistFM API |

### 2.3 Service Interaction Map for Check-in Flow

This is the critical path -- what happens when a user taps "Check In":

```
User taps "Check In" on mobile
        |
        v
[1] POST /api/checkins
        |
        v
[2] CheckinController.create()
        |
        v
[3] CheckinService.createCheckin({userId, eventId, venueRating?, bandRatings[]?, reviewText?, imageUrls?, vibeTagIds?})
        |
        +--[3a]--> Validate event exists and is today (or within window)
        |
        +--[3b]--> Validate location (if lat/lng provided, check distance to venue)
        |
        +--[3c]--> INSERT INTO checkins (user_id, event_id, venue_rating, ...)
        |
        +--[3d]--> INSERT INTO checkin_band_ratings (for each band rating)
        |
        +--[3e]--> INSERT INTO checkin_vibes (for each vibe tag)
        |
        +--[3f]--> UPDATE events SET total_checkins = total_checkins + 1
        |           (or via trigger)
        |
        +--[3g]--> UPDATE user stats (total_checkins, unique_bands, unique_venues)
        |           (via existing trigger, updated for new schema)
        |
        +--[3h]--> ASYNC: BadgeService.evaluateCheckin(userId, checkinId)
        |           |
        |           +---> Query user's check-in history
        |           +---> Evaluate all badge rules against history
        |           +---> Award new badges, return earned badges
        |           +---> NotificationService.create (badge_earned) for each
        |
        +--[3i]--> ASYNC: WebSocket.broadcastToRoom('event:{eventId}', 'new_checkin', checkinData)
        |           (Friends at same event see it immediately)
        |
        +--[3j]--> ASYNC: WebSocket.sendToFollowers(userId, 'friend_checkin', checkinData)
        |           (FOMO feed real-time update)
        |
        +--[3k]--> RETURN checkin object + earned badges to client
```

**Critical design decisions in this flow:**

1. **Steps 3a-3g are synchronous** (in a transaction). The user must get a confirmed check-in.
2. **Steps 3h-3j are asynchronous** (fire-and-forget with error logging). Badge evaluation and feed broadcasting should not block the check-in response. Use `Promise.allSettled()` and log failures to Sentry.
3. **Location verification is advisory, not blocking.** Set `is_verified = true/false` but always allow the check-in. Users may have GPS issues at indoor venues.
4. **Band ratings are optional on initial check-in.** Users can add/edit ratings after checking in (PATCH endpoint). This enables the "quick tap" flow.

### 2.4 Mobile Architecture (Flutter)

The existing clean architecture pattern extends naturally:

```
mobile/lib/src/features/
    events/                    -- NEW FEATURE
        domain/
            event.dart         -- Event entity with lineup
            event_lineup.dart  -- LineupEntry entity
        data/
            event_repository.dart
        presentation/
            event_detail_screen.dart
            event_list_screen.dart
            widgets/
                lineup_card.dart

    checkins/                  -- REDESIGN
        domain/
            checkin.dart       -- Already has event structure (CheckInEvent)
            band_rating.dart   -- NEW: per-band rating entity
        data/
            checkin_repository.dart
        presentation/
            checkin_screen.dart      -- Quick check-in flow
            rate_bands_sheet.dart    -- Bottom sheet for per-band ratings
            rate_venue_sheet.dart    -- Bottom sheet for venue rating

    badges/                    -- REDESIGN
        domain/
            badge.dart         -- Add progress, rarity fields
            badge_progress.dart -- NEW
        data/
            badge_repository.dart
        presentation/
            badge_collection_screen.dart  -- NEW: collection/showcase UI
            badge_progress_widget.dart   -- NEW

    feed/                      -- REDESIGN
        domain/
            feed_item.dart     -- NEW: typed feed items
        presentation/
            feed_screen.dart   -- FOMO feed with real-time updates
            widgets/
                checkin_card.dart   -- Rich check-in card
                live_indicator.dart -- "Happening now" pulse

    profile/                   -- REDESIGN
        domain/
            user_statistics.dart  -- Extend with concert cred fields
            concert_profile.dart  -- NEW: top genres, top venues, etc.
        presentation/
            profile_screen.dart   -- Concert resume layout
            stats_section.dart    -- NEW
```

**Key mobile architecture decision:** The existing `CheckIn` model in `checkin.dart` already has `CheckInEvent`, `venueRating`, `bandRating`, and `earnedBadges` fields -- suggesting the mobile domain was designed ahead of the backend. This is good; the mobile domain layer is already partially ready for the new architecture.

---

## 3. Event Data Ingestion Pipeline

### 3.1 Pipeline Architecture

```
                          +-------------------+
                          |  Scheduled Job    |
                          |  (node-cron or    |
                          |   Railway cron)   |
                          +--------+----------+
                                   |
                    +--------------+--------------+
                    |              |              |
             +------v------+ +----v------+ +-----v-------+
             | Ticketmaster | | Bandsintown| | User-Created |
             | Adapter      | | Adapter    | | Events       |
             +------+-------+ +----+------+ +-----+-------+
                    |              |              |
                    +------+-------+------+------+
                           |              |
                    +------v--------------v------+
                    |    EventNormalizer          |
                    |    (Canonical format)       |
                    +------+---------------------+
                           |
                    +------v---------------------+
                    |    Deduplicator             |
                    |    (Match by venue+date     |
                    |     or external_id)         |
                    +------+---------------------+
                           |
                    +------v---------------------+
                    |    Merger                   |
                    |    (Combine data from       |
                    |     multiple sources)       |
                    +------+---------------------+
                           |
                    +------v---------------------+
                    |    Database Writer          |
                    |    (Upsert events +         |
                    |     lineup entries)         |
                    +----------------------------+
```

### 3.2 API Source Strategy

| Source | Access | Best For | Rate Limits | Priority |
|--------|--------|----------|-------------|----------|
| **Ticketmaster Discovery API** | Free API key, self-service | Major venue events, large market coverage (230K+ events) | 5,000 calls/day, 5 req/sec | PRIMARY |
| **Bandsintown API** | Partnership request required | Artist-centric event data, indie/smaller venues | Per-agreement | SECONDARY |
| **SetlistFM** (existing) | API key (already have) | Historical setlist data, post-event enrichment | Rate limited | ENRICHMENT |
| **User-created events** | N/A | DIY shows, house venues, local scenes | N/A | GAP FILL |

**Recommended approach:** Start with Ticketmaster Discovery API as the primary source (free, self-service, largest coverage). Add Bandsintown via partnership for indie coverage. Use SetlistFM for post-event enrichment (setlist data for events that already happened). User-created events fill gaps for venues and scenes not covered by APIs.

**Note on Songkick:** Songkick API is effectively unavailable -- they are not processing new API key applications and require partnership agreements with license fees. Do not plan on Songkick access.

### 3.3 Ingestion Scheduling

```
Every 6 hours: Ticketmaster event sync for configured metro areas
    - Fetch events for next 90 days
    - Upsert into events table
    - Match bands by name (fuzzy) to existing bands table
    - Create new band records for unknown artists

Every 24 hours: Bandsintown sync for tracked artists
    - For each band in our database, fetch upcoming events
    - Merge with existing events (dedup by venue+date)

On-demand: User creates event
    - Validate venue exists
    - Create event + lineup
    - Flag as user_created (lower trust, not verified)
```

### 3.4 Deduplication Strategy

Events from multiple sources need deduplication. The matching algorithm:

```
1. EXACT MATCH: source + external_id (same API, same event)
   -> Update metadata, skip creation

2. VENUE+DATE MATCH: Same venue + same date + overlapping bands
   -> Merge lineup data, prefer API source for metadata

3. FUZZY MATCH: Similar venue name + same date + same headliner
   -> Flag for manual review or auto-merge with confidence threshold
```

**Implementation:** The `events` table has `UNIQUE(source, external_id)` for exact match. For cross-source dedup, query by `venue_id + event_date` and compare lineup overlap.

### 3.5 Band Name Matching

External APIs return artist names as strings. Matching to existing `bands` records:

```
1. Exact name match (case-insensitive)
2. MusicBrainz ID match (if API provides MBID)
3. Fuzzy match with threshold (pg_trgm extension, similarity > 0.8)
4. Create new band record if no match
```

**Recommendation:** Add `pg_trgm` extension to PostgreSQL for efficient fuzzy text matching:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_bands_name_trgm ON bands USING GIN (name gin_trgm_ops);
```

---

## 4. Badge Computation Engine

### 4.1 Current Problems

The existing `BadgeService.checkAndAwardBadges()` has two issues:
1. It queries the `reviews` table, not `checkins` -- badges are disconnected from the core action
2. Badge rules are hardcoded in a switch statement -- adding new badge types requires code changes

### 4.2 Recommended Architecture: Data-Driven Rule Engine

```
Check-in created
       |
       v
BadgeService.evaluateCheckin(userId, checkinId)
       |
       v
[1] Load all badge definitions + criteria from DB
       |
       v
[2] Load user's check-in history (cached in Redis, 5-min TTL)
       |
       v
[3] For each badge the user hasn't earned:
       |
       +---> Evaluate criteria against history
       |     (criteria_type determines evaluation function)
       |
       +---> If threshold met: Award badge
       |
       v
[4] Return newly earned badges
```

### 4.3 Badge Criteria Evaluation Functions

```typescript
interface BadgeEvaluator {
    evaluate(userId: string, criteria: BadgeCriteria, history: CheckinHistory): boolean;
}

// Registry of evaluators by criteria_type
const evaluators: Record<string, BadgeEvaluator> = {
    'checkin_count':    new CheckinCountEvaluator(),     // total check-ins >= threshold
    'unique_venues':    new UniqueVenuesEvaluator(),     // distinct venues >= threshold
    'unique_bands':     new UniqueBandsEvaluator(),      // distinct bands >= threshold
    'genre':            new GenreEvaluator(),            // check-ins where band.genre = criteria_value >= threshold
    'band_repeat':      new BandRepeatEvaluator(),       // check-ins for same band >= threshold
    'time_window':      new TimeWindowEvaluator(),       // N check-ins within time period
    'venue_type':       new VenueTypeEvaluator(),        // check-ins at venue_type = criteria_value >= threshold
    'vibe_tag':         new VibeTagEvaluator(),          // check-ins with specific vibe >= threshold
};
```

### 4.4 Badge Definitions (Seed Data)

| Badge | Type | Criteria | Threshold |
|-------|------|----------|-----------|
| First Check-in | checkin_count | - | 1 |
| Regular | checkin_count | - | 10 |
| Concert Junkie | checkin_count | - | 50 |
| Genre Explorer: Rock | genre | rock | 5 |
| Genre Explorer: Metal | genre | metal | 5 |
| Genre Explorer: Jazz | genre | jazz | 5 |
| Genre Explorer: Indie | genre | indie | 5 |
| Venue Collector | unique_venues | - | 10 |
| Venue Master | unique_venues | - | 25 |
| Superfan (any band) | band_repeat | * | 5 |
| Festival Warrior | time_window | 24h | 3 |
| Weekend Warrior | time_window | 72h | 5 |
| Mosh Pit Hero | vibe_tag | mosh_pit | 5 |
| Arena Rocker | venue_type | arena | 3 |
| Club Crawler | venue_type | club | 10 |

### 4.5 Badge Progress Tracking

```sql
-- Badge progress is computed, not stored.
-- For each user+badge, the progress is:
--   current_count / badge.requirement_value * 100

-- The query uses the same evaluator logic but returns count instead of boolean.
-- Cache in Redis with key: badge_progress:{userId}, TTL: 5 minutes
```

### 4.6 Badge Rarity

```sql
-- Badge rarity = percentage of active users who have this badge
-- Computed periodically (every hour via scheduled job) and cached

SELECT
    b.id,
    b.name,
    COUNT(ub.id)::FLOAT / NULLIF((SELECT COUNT(*) FROM users WHERE is_active = true), 0) * 100 as rarity_pct
FROM badges b
LEFT JOIN user_badges ub ON b.id = ub.badge_id
GROUP BY b.id;

-- Store in Redis: badge_rarity:{badgeId} = 12.5 (percent)
```

---

## 5. Real-Time Activity Feed

### 5.1 Feed Architecture Decision

**Pull model (recommended for current scale) with WebSocket push for real-time overlay.**

```
Feed Request (GET /api/feed?filter=friends)
       |
       v
[1] Check Redis cache: feed:{userId}:{filter}:{page}
       |
       +-- HIT --> Return cached feed
       |
       +-- MISS -->
              |
              v
[2] Query PostgreSQL:
    SELECT c.*, u.*, e.*, v.*,
           array_agg(DISTINCT el.band_id) as lineup_band_ids
    FROM checkins c
    JOIN users u ON c.user_id = u.id
    JOIN events e ON c.event_id = e.id
    JOIN venues v ON e.venue_id = v.id
    JOIN event_lineup el ON e.id = el.event_id
    WHERE c.user_id IN (
        SELECT following_id FROM user_followers WHERE follower_id = :userId
    )
    ORDER BY c.created_at DESC
    LIMIT 20 OFFSET :offset
       |
       v
[3] Cache result in Redis (TTL: 2 minutes)
       |
       v
[4] Return to client
```

**Real-time overlay via WebSocket:**
```
When a friend checks in:
    1. CheckinService broadcasts via WebSocket to user's room
    2. Mobile client receives 'friend_checkin' event
    3. Client prepends to local feed state (optimistic)
    4. Next full feed fetch will include it from DB
```

### 5.2 Feed Types

| Feed | Filter | Query Strategy | Cache TTL |
|------|--------|----------------|-----------|
| Friends | `WHERE user_id IN (SELECT following_id ...)` | Pull from DB, WebSocket overlay | 2 min |
| Nearby | `WHERE venue within radius` (Haversine) | Pull from DB | 5 min |
| Global | `WHERE 1=1` (trending first) | Pull from DB | 5 min |
| Event | `WHERE event_id = :id` | Pull from DB, WebSocket room | 1 min |
| FOMO | Friends + happening now (today's events only) | WebSocket primary, DB backup | 30 sec |

### 5.3 FOMO Feed (Key Differentiator)

The FOMO feed is the "friends at shows right now" view. This requires near-real-time delivery.

```
Implementation:
1. When user checks in, broadcast to all followers via WebSocket
2. Mobile client maintains local "live now" section at top of feed
3. "Live now" items auto-expire after event end_time (or 4 hours default)
4. Fallback: Poll GET /api/feed/live every 60 seconds for users without active WebSocket
```

**WebSocket room strategy:**
- Each user has a personal room: `user:{userId}`
- When User A follows User B, User A joins room `user:{B_userId}` (to receive B's activity)
- When User B checks in, broadcast to room `user:{B_userId}`

This is efficient because the WebSocket server already supports room-based messaging.

---

## 6. Concert Profile Stats

### 6.1 Stats Computation

User profile stats aggregate check-in history into a "concert resume."

```sql
-- Computed view for user stats (refreshed on check-in or on-demand)
CREATE OR REPLACE VIEW user_concert_stats AS
SELECT
    u.id as user_id,
    COUNT(DISTINCT c.id) as total_checkins,
    COUNT(DISTINCT cbr.band_id) as unique_bands,
    COUNT(DISTINCT e.venue_id) as unique_venues,
    COUNT(DISTINCT b.genre) as unique_genres,
    -- Top genre
    (SELECT b2.genre
     FROM checkin_band_ratings cbr2
     JOIN bands b2 ON cbr2.band_id = b2.id
     JOIN checkins c2 ON cbr2.checkin_id = c2.id
     WHERE c2.user_id = u.id
     GROUP BY b2.genre
     ORDER BY COUNT(*) DESC
     LIMIT 1) as top_genre,
    -- Streak: consecutive weeks with a check-in
    -- (complex query, better computed in application layer)
    COUNT(DISTINCT ub.id) as badges_earned,
    (SELECT COUNT(*) FROM user_followers WHERE following_id = u.id) as followers_count,
    (SELECT COUNT(*) FROM user_followers WHERE follower_id = u.id) as following_count
FROM users u
LEFT JOIN checkins c ON u.id = c.user_id
LEFT JOIN events e ON c.event_id = e.id
LEFT JOIN checkin_band_ratings cbr ON c.id = cbr.checkin_id
LEFT JOIN bands b ON cbr.band_id = b.id
LEFT JOIN user_badges ub ON u.id = ub.user_id
GROUP BY u.id;
```

**Performance note:** This view is expensive. Use Redis caching with a 10-minute TTL, invalidated on check-in. The `StatsService` should compute and cache, not query the view directly.

### 6.2 Stats Breakdown for Profile

```typescript
interface ConcertProfile {
    totalCheckins: number;
    uniqueBands: number;
    uniqueVenues: number;
    uniqueGenres: number;
    topGenres: { genre: string; count: number }[];    // Top 5
    topVenues: { venue: VenueSummary; count: number }[];  // Top 5
    topBands: { band: BandSummary; count: number }[];    // Top 5
    badgesEarned: number;
    badgeShowcase: Badge[];  // User-selected featured badges
    // Monthly activity
    monthlyActivity: { month: string; count: number }[];
    // Current streak
    weekStreak: number;
}
```

---

## 7. Recommendation Engine

### 7.1 Architecture

Recommendations combine collaborative filtering (what do similar users attend?) with content-based filtering (what matches your genre preferences?).

**Phase 1 (build first): Content-based recommendations**
```sql
-- "Events matching your taste" based on genre affinity
SELECT e.*, v.name as venue_name, array_agg(b.name) as bands
FROM events e
JOIN event_lineup el ON e.id = el.event_id
JOIN bands b ON el.band_id = b.id
JOIN venues v ON e.venue_id = v.id
WHERE e.event_date >= CURRENT_DATE
AND b.genre IN (
    -- User's top 3 genres by check-in count
    SELECT b2.genre
    FROM checkin_band_ratings cbr
    JOIN bands b2 ON cbr.band_id = b2.id
    JOIN checkins c ON cbr.checkin_id = c.id
    WHERE c.user_id = :userId
    GROUP BY b2.genre
    ORDER BY COUNT(*) DESC
    LIMIT 3
)
GROUP BY e.id, v.name
ORDER BY e.event_date ASC
LIMIT 20;
```

**Phase 2 (build later): Social recommendations**
```sql
-- "Popular with your friends" - events that people you follow are attending
SELECT e.*, COUNT(c.id) as friend_checkins
FROM events e
JOIN checkins c ON e.id = c.event_id
WHERE c.user_id IN (
    SELECT following_id FROM user_followers WHERE follower_id = :userId
)
AND e.event_date >= CURRENT_DATE
GROUP BY e.id
ORDER BY friend_checkins DESC
LIMIT 10;
```

**Phase 3 (future): Collaborative filtering**
This requires more data. When the user base is large enough, compute similarity scores between users based on check-in overlap and recommend events attended by similar users.

---

## 8. Migration Strategy

### 8.1 Schema Migration Approach

**Do NOT use the existing ad-hoc migration scripts.** Implement a proper migration system.

**Recommended: node-pg-migrate** (lightweight, SQL-based, tracks applied migrations in a table).

```
migrations/
    001_create_events_table.sql
    002_create_event_lineup_table.sql
    003_redesign_checkins_table.sql
    004_create_checkin_band_ratings.sql
    005_create_badge_criteria.sql
    006_update_triggers.sql
    007_add_pg_trgm_extension.sql
    008_seed_concert_badges.sql
```

### 8.2 Data Migration from Old Schema

The current database has data in the old schema (`shows`, old `checkins` with single rating). Migration path:

```
Step 1: Create new tables alongside old ones (non-destructive)
Step 2: Migrate shows -> events + event_lineup
    - Each show becomes an event with a single-band lineup
    - show.band_id -> event_lineup entry
Step 3: Migrate old checkins -> new checkins
    - checkins.band_id + venue_id + event_date -> find matching event, set event_id
    - checkins.rating -> checkin_band_ratings.rating (for the one band)
    - checkins.rating -> checkins.venue_rating (copy, since old rating was ambiguous)
Step 4: Re-evaluate badges against new check-in data
Step 5: Drop old tables once verified
```

### 8.3 Migration Risk Mitigation

- Run migration on a database copy first
- Maintain backward compatibility during transition (old API endpoints still work)
- Use database transactions for each migration step
- Log every record transformation for audit

---

## 9. Anti-Patterns to Avoid

### Anti-Pattern 1: Monolithic Check-in Transaction
**What:** Putting badge evaluation, feed updates, notification creation, and WebSocket broadcasting all inside the check-in database transaction.
**Why bad:** Any failure in badge evaluation would roll back the check-in. Slow badge queries would block the user's check-in response.
**Instead:** Synchronous transaction for check-in record only. Everything else is async with error isolation.

### Anti-Pattern 2: N+1 Queries in Feed
**What:** Loading each check-in's event, then each event's lineup, then each band's details.
**Why bad:** Feed of 20 items = 20 + 20 + 60 queries = 100 queries per feed load.
**Instead:** Single query with JOINs and `array_agg()` for lineup data. Pre-load all related entities in one go.

### Anti-Pattern 3: Real-Time Everything
**What:** Making the entire feed real-time via WebSocket (replacing REST entirely).
**Why bad:** WebSocket connections are expensive, unreliable on mobile networks, and don't support pagination or caching well.
**Instead:** REST for feed fetching (supports caching, pagination, offline). WebSocket only for "live now" overlay and instant notifications.

### Anti-Pattern 4: Storing Computed Stats
**What:** Maintaining a `user_stats` table that is always updated synchronously.
**Why bad:** Every check-in triggers N updates to the stats table, creating write contention.
**Instead:** Compute stats on-demand with Redis caching. Only denormalize the most critical counters (total_checkins on users table).

### Anti-Pattern 5: Global Event Sync
**What:** Syncing ALL events from Ticketmaster globally.
**Why bad:** Ticketmaster has 230K+ events. 5,000 API calls/day at 20 events/call = 100K events/day max. You will hit rate limits and store irrelevant data.
**Instead:** Sync events only for configured metro areas where you have users. Expand coverage as user base grows geographically.

---

## 10. Scalability Considerations

| Concern | At 100 users | At 10K users | At 100K users |
|---------|-------------|-------------|---------------|
| Feed query | Direct PostgreSQL query (~50ms) | PostgreSQL + Redis cache (~20ms) | Fan-out-on-write + Redis (~5ms) |
| Badge evaluation | Inline with check-in (~100ms) | Async worker (~200ms) | Async queue (Bull/BullMQ) |
| Event ingestion | Manual + basic API sync | Scheduled sync, 2 metros | Distributed sync, 20+ metros |
| WebSocket | Single Node.js process | Single process (handles 10K easily) | Redis pub/sub for multi-instance |
| Stats computation | On-demand query | Redis cache (5-min TTL) | Pre-computed materialized views |
| Recommendations | Simple genre match | Content-based + social | Collaborative filtering |

**Current priority: Design for 10K users.** The existing single-process architecture on Railway.app can handle this. The schema and service boundaries should be designed so that scaling to 100K is a deployment/infrastructure change, not an architecture change.

---

## 11. Suggested Build Order

Based on dependency analysis, the recommended implementation sequence:

```
Phase 1: Data Model Foundation
    [1] Database migration system (node-pg-migrate)
    [2] events + event_lineup tables
    [3] Redesigned checkins + checkin_band_ratings tables
    [4] Data migration from old schema
    [5] Updated triggers for rating aggregation
    Dependencies: None (foundational)

Phase 2: Core Check-in Flow
    [6] EventService redesign (CRUD for events + lineups)
    [7] CheckinService redesign (event-based check-ins, dual ratings)
    [8] Mobile: Event detail screen with lineup
    [9] Mobile: Quick check-in flow
    [10] Mobile: Per-band rating UI
    Dependencies: Phase 1 complete

Phase 3: Badge Engine
    [11] badge_criteria table
    [12] BadgeService redesign (data-driven rule engine)
    [13] Concert-specific badge seed data
    [14] Badge progress and rarity computation
    [15] Mobile: Badge collection and progress UI
    Dependencies: Phase 2 (needs check-in data flowing)

Phase 4: Feed and Social
    [16] FeedService (pull-based with Redis cache)
    [17] FOMO feed (WebSocket real-time overlay)
    [18] StatsService (concert profile computation)
    [19] Mobile: FOMO feed screen
    [20] Mobile: Concert resume profile
    Dependencies: Phase 2 (needs check-ins); Phase 3 partially (badge showcase)

Phase 5: Event Ingestion Pipeline
    [21] Ticketmaster API adapter
    [22] Event normalizer + deduplicator
    [23] Band name matcher (pg_trgm)
    [24] Scheduled ingestion job
    [25] Bandsintown adapter (if partnership secured)
    Dependencies: Phase 1 (needs events table)
    NOTE: Can run in parallel with Phases 2-4

Phase 6: Discovery and Recommendations
    [26] Content-based recommendation engine
    [27] Social recommendations
    [28] Mobile: Discovery screen with recommendations
    [29] Trending events/venues
    Dependencies: Phases 2 + 4 + 5 (needs check-in data + event data)
```

**Key insight:** Phase 5 (event ingestion) has no dependency on Phases 2-4 beyond the events table created in Phase 1. It can and should run in parallel with the check-in/badge/feed work. This is important for roadmap planning because ingested events provide the content that makes check-ins useful.

---

## 12. Technology Additions

| Addition | Purpose | Why This Choice |
|----------|---------|-----------------|
| `node-pg-migrate` | Database migrations | Lightweight, SQL-native, tracks state in DB. No ORM overhead. |
| `pg_trgm` extension | Fuzzy band name matching | Built into PostgreSQL, no external dependency. Enables `similarity()` function. |
| `node-cron` or Railway cron | Event ingestion scheduling | Lightweight scheduled jobs without external job queue. |
| `bull` or `bullmq` (future) | Async job queue | Only needed at scale for badge evaluation and feed fan-out. Redis-backed. |

---

## Sources

- Existing codebase analysis: `database-schema.sql`, all service files, migration scripts
- Existing architecture docs: `.planning/codebase/ARCHITECTURE.md`, `CONCERNS.md`, `INTEGRATIONS.md`
- Mobile domain models: `checkin.dart` (already has dual rating + event structure)
- Migration script: `migrate-events-model.ts` (partial events migration already started)
- Event API research: Ticketmaster Discovery API (5K calls/day), Bandsintown (partnership), Songkick (unavailable)
- Feed architecture patterns: Pull vs push fan-out models, PostgreSQL proven to ~100M activities
- Badge system patterns: Data-driven rule engines, event-driven evaluation
