# Phase 11: Platform Trust & Between-Show Retention - Research

**Researched:** 2026-02-28
**Domain:** Trending feed algorithm, venue/artist verification system, full-text search, query denormalization
**Confidence:** HIGH

## Summary

Phase 11 is the largest phase in v1.1, spanning three distinct feature domains: (1) a trending shows feed for between-concert retention, (2) a venue/artist claim-and-verify system for platform credibility, and (3) technical scalability improvements (full-text search, denormalized counters, genre array migration). Each domain requires both backend services and mobile UI work.

The existing codebase already has strong foundations to build on. The `DiscoveryService` and `EventService` already implement trending/recommendation queries with Haversine distance, RSVP data, and friend signals -- Phase 11 needs to add Wilson scoring and elevate the "Trending Shows Near You" to a first-class dedicated endpoint and mobile feed. The `pg_trgm` extension is already enabled (migration 001) with GIN trigram indexes on `bands.name` and `events.event_name` -- Phase 11 adds `tsvector` columns for proper full-text search with fuzzy fallback. The existing `requireAdmin()` middleware and `is_admin` user column provide the authorization backbone for claim approval workflows.

**Primary recommendation:** Split into 5-6 plans organized as: (1) database migrations for claims, search indexes, denormalized columns, genre array; (2) TrendingService with Wilson scoring + API endpoint; (3) VerificationService + claim/admin routes; (4) SearchService with tsvector + fuzzy fallback; (5) mobile trending feed + search upgrade; (6) mobile verification claim UI + claimed profile features.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EVENT-03 | User sees "Trending Shows Near You" feed for between-concert retention | Wilson-scored TrendingService builds on existing EventService.getTrendingNearby(); new dedicated API endpoint + mobile feed tab |
| EVENT-04 | Trending algorithm uses Wilson-scored mix of RSVP count, check-in velocity, friend signals, and proximity | Wilson score formula applied to multi-signal composite; see Architecture Patterns for scoring algorithm |
| VERIFY-01 | Venue owner can submit claim request for venue profile | New `verification_claims` table + ClaimService + POST /api/claims route |
| VERIFY-02 | Artist can submit claim request for band profile | Same `verification_claims` table with `entity_type = 'band'` |
| VERIFY-03 | Admin reviews and approves/denies verification claims | Admin routes under /api/admin/claims using existing `requireAdmin()` middleware |
| VERIFY-04 | Verified profiles display verification badge | `is_verified` column already exists on venues and bands tables; badge display in mobile profile screens |
| VERIFY-05 | Claimed venue owner can view aggregate ratings and respond to reviews | DiscoveryService.getVenueAggregateRating() already exists; add review response capability |
| VERIFY-06 | Claimed artist can update profile and view performance stats | DiscoveryService.getBandAggregateRating() already exists; add claimed-owner update authorization |
| SCALE-01 | Search uses tsvector + GIN indexes with pg_trgm fuzzy fallback | New migration adds tsvector generated columns + GIN indexes; SearchService replaces ILIKE queries |
| SCALE-02 | Feed queries use denormalized toast_count and comment_count columns | Columns and triggers already exist in database-schema.sql; FeedService/CheckinQueryService must switch from COUNT(DISTINCT) joins to reading columns |
| SCALE-03 | Band.genre migrated from single string to array for faceted filtering | Migration adds `genres TEXT[]` column + backfill from existing `genre`; update all band queries |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL | 15+ | tsvector full-text search, pg_trgm fuzzy, GIN indexes | Already in use; built-in FTS is correct at this scale |
| node-pg-migrate | existing | Schema migrations | Already used for all 32 prior migrations |
| Express + TypeScript | existing | Backend API routes/controllers | Existing stack |
| Flutter + Riverpod | existing | Mobile state management | Existing stack |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| wilson-score (npm) | 2.0+ | Wilson score confidence interval | Consider importing for correctness; OR implement the formula directly in SQL/TS (it's ~10 lines) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PostgreSQL tsvector | Elasticsearch | Overkill at current scale (<100K records); adds operational complexity |
| Wilson score npm package | Inline SQL formula | SQL formula is simpler, no dependency; npm package useful if applying in application layer |
| TEXT[] for genres | Junction table (band_genres) | Array is simpler for read-heavy faceted filtering; junction table better for 100K+ genres |

**Installation:**
No new npm packages required. Wilson score is best implemented as a PostgreSQL function or inline SQL formula.

## Architecture Patterns

### Recommended Project Structure
```
backend/
  migrations/
    033_verification-claims.ts           # Claims table + indexes
    034_search-tsvector-columns.ts       # tsvector generated columns + GIN indexes
    035_genre-array-migration.ts         # genres TEXT[] + backfill + index
    036_denormalized-count-switchover.ts  # Verify triggers exist, add any missing
  src/
    services/
      TrendingService.ts                 # Wilson-scored trending feed
      ClaimService.ts                    # Venue/artist claim + admin approval
      SearchService.ts                   # Unified full-text search
    routes/
      trendingRoutes.ts                  # GET /api/trending
      claimRoutes.ts                     # POST/GET /api/claims, admin approval routes
    controllers/
      TrendingController.ts
      ClaimController.ts
      SearchController.ts               # May replace or extend existing searchRoutes.ts

mobile/lib/src/features/
  trending/                              # New feature directory
    data/trending_repository.dart
    presentation/trending_feed_screen.dart
    presentation/providers/trending_providers.dart
  verification/                          # New feature directory
    data/claim_repository.dart
    presentation/claim_profile_screen.dart
    presentation/providers/claim_providers.dart
```

### Pattern 1: Wilson Score Trending Algorithm
**What:** Rank events by a Wilson-scored composite signal that accounts for sample size
**When to use:** When ranking items with heterogeneous signal volumes (some events have many RSVPs, others few)
**Example:**
```sql
-- Wilson lower bound for binomial proportion
-- z = 1.96 (95% confidence interval)
-- n = total_signals, p = positive_ratio

CREATE OR REPLACE FUNCTION wilson_score(positive BIGINT, total BIGINT)
RETURNS DOUBLE PRECISION AS $$
DECLARE
  z CONSTANT DOUBLE PRECISION := 1.96;
  n DOUBLE PRECISION;
  p DOUBLE PRECISION;
BEGIN
  n := total::DOUBLE PRECISION;
  IF n = 0 THEN RETURN 0; END IF;
  p := positive::DOUBLE PRECISION / n;
  RETURN (p + z*z/(2*n) - z * SQRT((p*(1-p) + z*z/(4*n)) / n)) / (1 + z*z/n);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Trending composite scoring approach:**
```sql
-- For each upcoming event, compute signals:
-- 1. RSVP count (from event_rsvps)
-- 2. Check-in velocity (checkins in last 7 days)
-- 3. Friend signals (friends who RSVP'd or checked in)
-- 4. Proximity decay (closer = higher weight)
--
-- Normalize each signal to [0,1], then apply Wilson score
-- to the weighted sum with total signal count as denominator
```

### Pattern 2: Verification Claims Workflow
**What:** Three-state claim lifecycle: pending -> approved/denied
**When to use:** Whenever user-submitted ownership requires admin review
**Example:**
```sql
CREATE TABLE verification_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('venue', 'band')),
  entity_id UUID NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  evidence_text TEXT,           -- "I'm the owner because..."
  evidence_url VARCHAR(500),    -- Link to website/social proof
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT one_pending_per_entity UNIQUE (entity_type, entity_id, status)
    -- Only valid for 'pending' status via partial unique index instead
);

-- Partial unique index: only one pending claim per entity
CREATE UNIQUE INDEX idx_claims_one_pending
  ON verification_claims (entity_type, entity_id)
  WHERE status = 'pending';
```

### Pattern 3: tsvector Full-Text Search with Fuzzy Fallback
**What:** Primary search via tsvector (fast, ranked), fallback to pg_trgm similarity for typos
**When to use:** Whenever searching across bands, venues, events with partial matches and typos
**Example:**
```sql
-- Add generated tsvector columns (auto-updated, no trigger needed)
ALTER TABLE bands ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(genre, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(hometown, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(description, '')), 'D')
  ) STORED;

CREATE INDEX idx_bands_search_vector ON bands USING GIN (search_vector);

-- Query: full-text first, fuzzy fallback
WITH fts_results AS (
  SELECT id, name, genre,
    ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS rank
  FROM bands
  WHERE search_vector @@ websearch_to_tsquery('english', $1)
    AND is_active = TRUE
  ORDER BY rank DESC
  LIMIT $2
),
fuzzy_results AS (
  SELECT id, name, genre,
    similarity(name, $1) AS rank
  FROM bands
  WHERE similarity(name, $1) > 0.3
    AND is_active = TRUE
    AND id NOT IN (SELECT id FROM fts_results)
  ORDER BY rank DESC
  LIMIT $2
)
SELECT * FROM fts_results
UNION ALL
SELECT * FROM fuzzy_results
LIMIT $2;
```

### Pattern 4: Denormalized Count Column Switchover
**What:** Replace COUNT(DISTINCT) joins with pre-computed columns
**When to use:** Feed queries where toast_count and comment_count are displayed
**Key insight:** The database already has `toast_count` and `comment_count` columns on the `checkins` table AND triggers (`trigger_update_toast_count`, `trigger_update_comment_count`) that maintain them. The FeedService and CheckinQueryService are NOT using them -- they're computing via COUNT(DISTINCT) joins. The fix is to read the columns instead.
**Example:**
```typescript
// BEFORE (current - slow):
SELECT c.*, COUNT(DISTINCT t.id) as toast_count, COUNT(DISTINCT cm.id) as comment_count
FROM checkins c
LEFT JOIN toasts t ON c.id = t.checkin_id
LEFT JOIN checkin_comments cm ON c.id = cm.checkin_id
GROUP BY c.id

// AFTER (Phase 11 - fast):
SELECT c.*, c.toast_count, c.comment_count
FROM checkins c
-- No JOIN to toasts or checkin_comments needed for counts!
-- Only join when you need to check has_user_toasted
```

### Anti-Patterns to Avoid
- **Computing Wilson score in application code per request:** Pre-compute and cache; the scoring query can run in a materialized view or cached Redis result
- **Separate search endpoints for bands/venues/events:** Use a unified SearchService that returns categorized results in a single response
- **Storing claim status in the venues/bands tables:** Keep claim state in a separate table; only write `is_verified = true` and `claimed_by_user_id` on approval
- **Using ILIKE for search when tsvector is available:** ILIKE scans the entire column; tsvector uses the inverted index
- **Migrating genre column in-place without backfill:** Keep old `genre` column temporarily for backward compatibility; populate `genres TEXT[]` from it

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search | Custom ILIKE with wildcards | PostgreSQL tsvector + GIN | Handles stemming, ranking, stop words; O(1) vs O(n) |
| Fuzzy/typo matching | Levenshtein distance in app code | pg_trgm similarity() with GIN index | Built-in, indexed, handles edge cases |
| Wilson score formula | Custom "average + min vote" hack | Standard Wilson lower bound formula | Mathematically sound, handles small sample sizes correctly |
| Counter denormalization | Application-level increment/decrement | PostgreSQL trigger functions | Already exist in the schema; atomic, race-safe, no missed updates |
| Claim dedup | Application-level "check before insert" | Partial unique index on (entity_type, entity_id) WHERE pending | Database-enforced, race-safe |

**Key insight:** PostgreSQL already has robust built-in support for everything Phase 11 needs. No external search engines, no custom scoring libraries, no application-level counter management.

## Common Pitfalls

### Pitfall 1: COUNT(DISTINCT) on Checkins Already Has Denormalized Columns
**What goes wrong:** Developer doesn't realize toast_count/comment_count columns + triggers already exist on checkins table and builds new infrastructure
**Why it happens:** The FeedService and CheckinQueryService both compute counts via JOINs despite the columns existing -- making it look like denormalized columns don't exist
**How to avoid:** SCALE-02 is primarily about SWITCHING queries to use existing columns, not creating new ones. Check if triggers are functioning correctly first, then refactor queries.
**Warning signs:** Adding new migration for toast_count/comment_count columns that already exist

### Pitfall 2: Generated tsvector Column Requires STORED, Not VIRTUAL
**What goes wrong:** Using `GENERATED ALWAYS AS ... VIRTUAL` for tsvector fails because GIN indexes require materialized data
**Why it happens:** PostgreSQL's GENERATED columns can be STORED (written to disk) or VIRTUAL (computed on read). GIN indexes need STORED.
**How to avoid:** Always use `GENERATED ALWAYS AS (...) STORED` for tsvector columns
**Warning signs:** Index creation fails or search returns no results

### Pitfall 3: Wilson Score Division by Zero on New Events
**What goes wrong:** New events with 0 signals cause division by zero in Wilson formula
**Why it happens:** Wilson score formula divides by n (total signals)
**How to avoid:** Guard with `IF n = 0 THEN RETURN 0` in the SQL function; events with 0 signals should sort last
**Warning signs:** NaN or error on empty events

### Pitfall 4: Genre Array Migration Breaking Existing Queries
**What goes wrong:** Changing `bands.genre` from VARCHAR to TEXT[] breaks all ILIKE queries, the DiscoveryService genre CTE, EventService genre filtering, etc.
**Why it happens:** TEXT[] uses `@>` (contains) or `ANY()` operators, not ILIKE
**How to avoid:** Add a NEW column `genres TEXT[]`, backfill from `genre`, update queries one by one, then deprecate old column. Do NOT alter the existing column type.
**Warning signs:** All genre-based features break simultaneously

### Pitfall 5: Claim Approval Must Update Both claim.status AND entity.is_verified
**What goes wrong:** Admin approves claim but only updates the claim table, not the venue/band
**Why it happens:** Transaction doesn't include all necessary updates
**How to avoid:** Use a database transaction that updates both the claim status AND the entity's `is_verified` + `claimed_by_user_id` columns atomically
**Warning signs:** Claim shows "approved" but profile still shows unverified

### Pitfall 6: has_user_toasted Still Needs a JOIN
**What goes wrong:** Removing the toasts JOIN entirely breaks the `has_user_toasted` boolean
**Why it happens:** toast_count and comment_count are denormalized, but has_user_toasted is per-viewer and cannot be denormalized
**How to avoid:** Keep a single `EXISTS(SELECT 1 FROM toasts WHERE checkin_id = c.id AND user_id = $1)` subquery for has_user_toasted while removing the COUNT JOINs
**Warning signs:** "Toast" button state is always false

### Pitfall 7: Venue/Band `is_verified` Already Exists but Means Something Different
**What goes wrong:** Conflating organic event verification (2+ users checked in) with owner claim verification
**Why it happens:** venues.is_verified and events.is_verified already exist for organic verification
**How to avoid:** For claim verification, add `claimed_by_user_id` column to venues and bands. The `is_verified` column can be reused IF its semantics are broadened (verified = either organically or via claim). Document this clearly.
**Warning signs:** Events showing verification badges when they shouldn't

## Code Examples

### Wilson Score in PostgreSQL (Trending Feed)
```sql
-- Source: Evan Miller "How Not To Sort By Average Rating"
-- Adapted for multi-signal composite scoring

CREATE OR REPLACE FUNCTION wilson_lower_bound(positive BIGINT, total BIGINT)
RETURNS DOUBLE PRECISION AS $$
DECLARE
  z CONSTANT DOUBLE PRECISION := 1.96;  -- 95% CI
  n DOUBLE PRECISION;
  p_hat DOUBLE PRECISION;
BEGIN
  n := total::DOUBLE PRECISION;
  IF n = 0 THEN RETURN 0; END IF;
  p_hat := positive::DOUBLE PRECISION / n;
  RETURN (p_hat + z*z/(2*n) - z * SQRT((p_hat*(1-p_hat) + z*z/(4*n)) / n)) / (1 + z*z/n);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;
```

### Trending Shows Query
```sql
-- Trending shows near user with Wilson-scored composite
SELECT e.*, v.name as venue_name, v.city, v.state,
  rsvp.cnt as rsvp_count,
  checkin_vel.cnt as checkin_velocity,
  friend_sig.cnt as friend_signals,
  distance_km,
  -- Composite score: normalize each signal then Wilson-score the sum
  wilson_lower_bound(
    (COALESCE(rsvp.cnt, 0) * 3 + COALESCE(checkin_vel.cnt, 0) * 2 +
     COALESCE(friend_sig.cnt, 0) * 5)::BIGINT,
    (COALESCE(rsvp.cnt, 0) + COALESCE(checkin_vel.cnt, 0) +
     COALESCE(friend_sig.cnt, 0) + 1)::BIGINT  -- +1 to avoid div/0
  ) * (1.0 / (1.0 + distance_km / 50.0))  -- proximity decay
  AS trending_score
FROM events e
JOIN venues v ON e.venue_id = v.id
LEFT JOIN LATERAL (
  SELECT COUNT(*)::INT as cnt FROM event_rsvps WHERE event_id = e.id
) rsvp ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*)::INT as cnt FROM checkins
  WHERE event_id = e.id AND created_at >= NOW() - INTERVAL '7 days'
    AND is_hidden IS NOT TRUE
) checkin_vel ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(DISTINCT er.user_id)::INT as cnt
  FROM event_rsvps er
  JOIN user_followers uf ON er.user_id = uf.following_id
  WHERE er.event_id = e.id AND uf.follower_id = $1
) friend_sig ON TRUE
CROSS JOIN LATERAL (
  SELECT (6371 * acos(
    cos(radians($2)) * cos(radians(v.latitude)) *
    cos(radians(v.longitude) - radians($3)) +
    sin(radians($2)) * sin(radians(v.latitude))
  )) AS distance_km
) dist
WHERE e.event_date >= CURRENT_DATE
  AND e.event_date <= CURRENT_DATE + INTERVAL '30 days'
  AND e.is_cancelled = FALSE
  AND dist.distance_km <= $4
ORDER BY trending_score DESC
LIMIT $5;
```

### Unified Search Service Pattern
```typescript
// Source: project pattern - follows existing Service singleton pattern
export class SearchService {
  private db = Database.getInstance();

  async search(query: string, options: {
    types?: ('band' | 'venue' | 'event')[];
    limit?: number;
  } = {}): Promise<{
    bands: Band[];
    venues: Venue[];
    events: Event[];
  }> {
    const { types = ['band', 'venue', 'event'], limit = 10 } = options;
    const tsquery = `websearch_to_tsquery('english', $1)`;

    // Run searches in parallel
    const [bands, venues, events] = await Promise.all([
      types.includes('band') ? this.searchBands(query, limit) : [],
      types.includes('venue') ? this.searchVenues(query, limit) : [],
      types.includes('event') ? this.searchEvents(query, limit) : [],
    ]);

    return { bands, venues, events };
  }
}
```

### Feed Query After Denormalization (SCALE-02)
```typescript
// Source: FeedService pattern - removes COUNT(DISTINCT) JOINs
const query = `
  SELECT
    c.id,
    c.user_id,
    c.event_id,
    c.created_at,
    c.photo_url,
    c.toast_count,      -- Read denormalized column directly
    c.comment_count,     -- Read denormalized column directly
    u.username,
    u.profile_image_url AS user_avatar_url,
    e.event_name,
    v.name AS venue_name,
    EXISTS(
      SELECT 1 FROM user_badges ub
      WHERE ub.user_id = c.user_id
        AND ub.earned_at >= c.created_at - INTERVAL '1 minute'
        AND ub.earned_at <= c.created_at + INTERVAL '1 hour'
    ) AS has_badge_earned,
    EXISTS(
      SELECT 1 FROM toasts t2
      WHERE t2.checkin_id = c.id AND t2.user_id = $1
    ) AS has_user_toasted
  FROM checkins c
  JOIN user_followers uf ON c.user_id = uf.following_id
  JOIN users u ON c.user_id = u.id
  LEFT JOIN events e ON c.event_id = e.id
  LEFT JOIN venues v ON e.venue_id = v.id
  -- NO LEFT JOIN toasts or checkin_comments for counts!
  WHERE uf.follower_id = $1
    AND (c.is_hidden IS NOT TRUE)
    ${blockFilter}
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT $2
`;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ILIKE '%query%' for search | tsvector + GIN with pg_trgm fallback | PostgreSQL 12+ (stable) | O(1) index scan vs O(n) seq scan |
| Simple average for ranking | Wilson score lower bound | Well-established | Handles low sample sizes correctly |
| COUNT(DISTINCT) per query | Denormalized columns + triggers | Pattern exists in codebase already | Eliminates multi-table JOINs in hot path |
| Single genre string | TEXT[] array with GIN index | PostgreSQL 9.5+ | Enables faceted "Metal AND Punk" filtering |

**Deprecated/outdated:**
- ILIKE queries for search: Being replaced by tsvector + fuzzy (SCALE-01)
- `bands.genre` VARCHAR(100): Being supplemented by `bands.genres TEXT[]` (SCALE-03), old column kept for backward compat during transition

## Open Questions

1. **Claimed profile update authorization model**
   - What we know: Admin approves claim, user gets `claimed_by_user_id` link on venue/band
   - What's unclear: Should claimed owners go through the same admin update flow, or get direct update access via their JWT? The existing update endpoints (`PUT /api/bands/:id`, `PUT /api/venues/:id`) are essentially unguarded beyond auth.
   - Recommendation: Add middleware that checks `req.user.id === entity.claimed_by_user_id || req.user.isAdmin` for update operations. This is the simplest authorization model.

2. **Review responses for claimed venues**
   - What we know: VERIFY-05 says claimed venue owner can "respond to reviews"
   - What's unclear: The existing `reviews` table has no `response` column. Need to decide: add a `response` TEXT column to reviews, or create a separate `review_responses` table?
   - Recommendation: Add `owner_response TEXT` and `owner_response_at TIMESTAMPTZ` columns to the `reviews` table. Simple, avoids a join, and one response per review is the standard pattern (like Google Maps).

3. **Genre array backfill accuracy**
   - What we know: Current `genre` is a single string like "Rock", "Alternative Metal", "Post-Punk"
   - What's unclear: Are there multi-genre strings like "Rock, Metal" that need splitting, or is it always a single genre?
   - Recommendation: Check data distribution first. If single-genre, the migration is `genres = ARRAY[genre]`. If comma-separated, use `string_to_array(genre, ', ')`.

4. **Trending feed: dedicated tab vs section in Discover screen?**
   - What we know: Success criterion says "User sees a Trending Shows Near You feed"
   - What's unclear: Is this a new bottom nav tab, a new section in the existing Discover screen, or a separate screen accessible from Discover?
   - Recommendation: Add as a prominent section at the top of the existing Discover screen. Adding a new bottom tab for a single feed feels heavyweight. The Discover screen already has trending nearby events section that can be enhanced.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: EventService.ts, DiscoveryService.ts, FeedService.ts, CheckinQueryService.ts (direct source code review)
- Codebase analysis: database-schema.sql (existing triggers for toast_count, comment_count)
- Codebase analysis: migration 001 (pg_trgm enabled), 015 (bands GIN trgm index), 022 (events GIN trgm index)
- [PostgreSQL Official Docs: Full-Text Search Indexes](https://www.postgresql.org/docs/current/textsearch-indexes.html) - GIN vs GiST for tsvector
- [PostgreSQL Official Docs: pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html) - similarity() function and GIN trigram ops

### Secondary (MEDIUM confidence)
- [Evan Miller: How Not To Sort By Average Rating](https://www.evanmiller.org/how-not-to-sort-by-average-rating.html) - Wilson score formula (canonical reference)
- [OneUptime: Full-Text Search with GIN in PostgreSQL (Jan 2026)](https://oneuptime.com/blog/post/2026-01-25-full-text-search-gin-postgresql/view) - Generated tsvector columns pattern
- [Timescale: Counter Analytics in PostgreSQL](https://www.timescale.com/blog/counter-analytics-in-postgresql-beyond-simple-data-denormalization) - Trigger-based counter patterns

### Tertiary (LOW confidence)
- Wilson score npm package exists but inline SQL formula is preferred for this use case (avoids dependency)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all technologies already in use in codebase (PostgreSQL, pg_trgm, Express, Flutter/Riverpod)
- Architecture: HIGH - patterns directly derived from existing codebase analysis (service patterns, migration patterns, route patterns all established)
- Pitfalls: HIGH - identified from direct code inspection (e.g., existing toast_count/comment_count columns and triggers, existing is_verified semantics, genre column usage across services)
- Trending algorithm: MEDIUM - Wilson score formula is well-documented but the composite signal weighting (3x RSVP, 2x velocity, 5x friends) will need tuning
- Search: HIGH - PostgreSQL tsvector + pg_trgm is the canonical approach for this scale

**Research date:** 2026-02-28
**Valid until:** 2026-03-28 (stable technologies, no fast-moving dependencies)
