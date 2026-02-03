# Phase 7: Discovery & Recommendations - Research

**Researched:** 2026-02-03
**Domain:** Event discovery, aggregate ratings, multi-table search, SQL-based recommendations
**Confidence:** HIGH

## Summary

Phase 7 enriches existing band and venue pages with aggregate ratings from check-in data, adds event calendars, builds event discovery (nearby, genre, trending), extends search to include events, and implements SQL-based personalized recommendations. This phase is predominantly an extension of existing infrastructure -- the EventService, StatsService, BandService, VenueService, and search patterns are all in place.

The key technical challenges are: (1) computing aggregate ratings from the dual-rating system (checkin_band_ratings for band performance, checkins.venue_rating for venue experience) efficiently with caching, (2) extending multi-entity search to include events using pg_trgm which is already installed, (3) building a trending algorithm with time-decay scoring, and (4) implementing SQL-based personalized recommendations using genre affinity and friend attendance signals without pgvector (which is deferred to v2 per RECC-01).

**Primary recommendation:** Build all discovery features as extensions of existing services (EventService, BandService, VenueService, StatsService), use the established Redis cache-aside pattern with fire-and-forget invalidation, and implement recommendations as pure SQL queries leveraging the existing genre-through-event_lineup join path established in Phase 6.

## Standard Stack

The established libraries/tools for this domain are already in the project:

### Core (Already Installed)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| PostgreSQL + pg_trgm | Fuzzy search, trigram matching | Already installed, used for band name matching in Phase 2 |
| Redis | Cache-aside pattern | Already used for feed (60s), concert cred (600s), rate limiting |
| Node/Express | API endpoints | Existing backend stack |
| Flutter + Riverpod | Mobile state management | Existing mobile stack |
| Freezed + json_serializable | Model codegen | Existing mobile pattern |
| geolocator | GPS location | Already used in discover screen + check-in flow |
| flutter_map + latlong2 | Map display | Already used in discover screen map view |

### Supporting (Already Installed)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| BullMQ | Async job processing | If trending score recalculation needs background processing |
| go_router | Navigation | Route to new/enhanced screens |
| cached_network_image | Image loading | Band/venue images on detail pages |

### No New Dependencies Required
Phase 7 does not require any new libraries. All functionality can be built with existing PostgreSQL features (pg_trgm, aggregate functions, window functions), existing Redis caching, and existing mobile packages. This is by design -- the roadmap explicitly defers pgvector-based collaborative filtering to v2 (RECC-01).

## Architecture Patterns

### Backend: Extend Existing Services

The codebase follows a Service pattern where each domain entity has a service class. Phase 7 extends these:

```
backend/src/
  services/
    EventService.ts        # ADD: getNearbyUpcoming, getTrendingNear, getByGenre, search
    BandService.ts         # ADD: getAggregatePerformanceRating, getFanCount
    VenueService.ts        # ADD: getAggregateExperienceRating, getVisitorCount
    StatsService.ts        # ADD: getUserGenreAffinity (for recommendations)
    DiscoveryService.ts    # NEW: recommendation engine, trending algorithm
  routes/
    eventRoutes.ts         # ADD: /events/discover, /events/search, /events/genre/:genre
    bandRoutes.ts          # EXTEND: /:id response with aggregate rating + upcoming
    venueRoutes.ts         # EXTEND: /:id response with aggregate rating + upcoming
    searchRoutes.ts        # EXTEND: add /events search
```

### Mobile: Enhance Existing Screens + New Discovery Tab

```
mobile/lib/src/features/
  bands/
    presentation/
      band_detail_screen.dart    # ENHANCE: aggregate rating, upcoming shows section
  venues/
    presentation/
      venue_detail_screen.dart   # ENHANCE: aggregate rating, upcoming events section
  discover/
    presentation/
      discover_screen.dart       # ENHANCE: nearby shows, genre browse, trending, recommendations
    data/
      discovery_repository.dart  # NEW: API client for discovery endpoints
    domain/
      discovery_models.dart      # NEW: Freezed models for discovery responses
```

### Pattern 1: Aggregate Rating Computation

**What:** Compute aggregate band performance rating and venue experience rating from check-in data.
**When to use:** Band detail page, venue detail page, search results enrichment.

The key insight is that the project has TWO independent rating systems:
- **Band performance rating:** Stored in `checkin_band_ratings.rating` (per-set, 0.5-5.0 half-stars)
- **Venue experience rating:** Stored in `checkins.venue_rating` (per-checkin, 0.5-5.0 half-stars)

These MUST NOT be conflated. The existing `bands.average_rating` and `venues.average_rating` columns use the old `reviews` table and are stale. Phase 7 must compute fresh aggregates from check-in data.

```sql
-- Band aggregate performance rating (from checkin_band_ratings)
SELECT
  b.id, b.name,
  AVG(cbr.rating)::numeric(3,2) as avg_performance_rating,
  COUNT(DISTINCT cbr.id) as total_ratings,
  COUNT(DISTINCT c.user_id) as unique_fans
FROM bands b
LEFT JOIN checkin_band_ratings cbr ON b.id = cbr.band_id
LEFT JOIN checkins c ON cbr.checkin_id = c.id
WHERE b.id = $1 AND b.is_active = true
GROUP BY b.id, b.name;

-- Venue aggregate experience rating (from checkins.venue_rating)
SELECT
  v.id, v.name,
  AVG(c.venue_rating)::numeric(3,2) as avg_experience_rating,
  COUNT(DISTINCT c.id) as total_ratings,
  COUNT(DISTINCT c.user_id) as unique_visitors
FROM venues v
LEFT JOIN checkins c ON v.id = c.venue_id AND c.venue_rating > 0
WHERE v.id = $1 AND v.is_active = true
GROUP BY v.id, v.name;
```

### Pattern 2: Redis Cache-Aside for Aggregate Data

**What:** Cache aggregate ratings and discovery results.
**When to use:** All aggregate queries, nearby events, trending.

Follow the established pattern from StatsService (cache.getOrSet with TTL + fire-and-forget invalidation):

```typescript
// Established pattern from StatsService
const BAND_AGGREGATE_TTL = 600; // 10 minutes, same as concert cred

async getBandAggregateRating(bandId: string) {
  return cache.getOrSet(
    CacheKeys.bandAggregate(bandId), // Add to CacheKeys
    () => this.computeBandAggregate(bandId),
    BAND_AGGREGATE_TTL
  );
}

// Invalidation from CheckinService (fire-and-forget, same as concert cred)
// When a band rating is added: invalidate band aggregate cache
// When a venue rating is added: invalidate venue aggregate cache
```

### Pattern 3: Nearby Events with Location

**What:** Get upcoming events near user GPS coordinates.
**When to use:** DISC-01 (nearby shows), DISC-06 (trending near user).

The codebase already has `EventService.getNearbyEvents()` using Haversine formula. However, the current implementation only returns events on CURRENT_DATE. For discovery, extend to return upcoming events (next N days).

```sql
-- Extend existing getNearbyEvents to support date range
-- Current: WHERE e.event_date = CURRENT_DATE
-- New: WHERE e.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '$1 days'
```

**Performance consideration:** The Haversine formula in the existing code does a full table scan on venues. For the current dataset size (likely <10K venues), this is acceptable. The bounding box optimization (pre-filter by lat/lon range before Haversine) should be added if performance degrades:

```sql
-- Bounding box pre-filter before Haversine (optimization)
WHERE v.latitude BETWEEN ($1 - $3/111.0) AND ($1 + $3/111.0)
  AND v.longitude BETWEEN ($2 - $3/(111.0 * cos(radians($1)))) AND ($2 + $3/(111.0 * cos(radians($1))))
```

### Pattern 4: Multi-Entity Search with pg_trgm

**What:** Extend search to include events alongside bands, venues, users.
**When to use:** DISC-07 (search includes events).

Current search only covers bands (BandService.searchBands with ILIKE), venues (VenueService.searchVenues with ILIKE), and users (searchRoutes /users). Events need to be searchable by event_name, band names in lineup, venue name, and genre.

Approach: Add event search as a parallel query (same pattern as discover_providers.dart which runs band/venue/user searches in parallel):

```sql
-- Event search: match event name, band name, venue name, or genre
SELECT DISTINCT e.*, v.name as venue_name,
  GREATEST(
    similarity(e.event_name, $1),
    similarity(v.name, $1),
    MAX(similarity(b.name, $1)),
    MAX(similarity(b.genre, $1))
  ) as relevance_score
FROM events e
JOIN venues v ON e.venue_id = v.id
LEFT JOIN event_lineup el ON e.id = el.event_id
LEFT JOIN bands b ON el.band_id = b.id
WHERE e.event_date >= CURRENT_DATE
  AND e.is_cancelled = FALSE
  AND (
    e.event_name % $1      -- trigram similarity on event name
    OR v.name % $1          -- trigram similarity on venue name
    OR b.name % $1          -- trigram similarity on band name
    OR b.genre ILIKE '%' || $1 || '%'  -- genre match
  )
GROUP BY e.id, v.name
ORDER BY relevance_score DESC
LIMIT $2;
```

**Index needed:** GIN trigram index on events.event_name (bands.name already has one from Phase 2):
```sql
CREATE INDEX idx_events_name_trgm ON events USING gin (event_name gin_trgm_ops);
```

### Pattern 5: Genre-Based Event Browsing

**What:** Filter upcoming events by genre through the event_lineup -> bands join.
**When to use:** DISC-08 (genre browsing).

The genre information flows: events -> event_lineup -> bands -> genre. This join path was established in Phase 6 (StatsService.getGenreBreakdown).

```sql
-- Get upcoming events for a specific genre
SELECT e.*, v.name as venue_name, v.city, v.state
FROM events e
JOIN venues v ON e.venue_id = v.id
JOIN event_lineup el ON e.id = el.event_id
JOIN bands b ON el.band_id = b.id
WHERE b.genre ILIKE '%' || $1 || '%'
  AND e.event_date >= CURRENT_DATE
  AND e.is_cancelled = FALSE
GROUP BY e.id, v.name, v.city, v.state
ORDER BY e.event_date ASC
LIMIT $2 OFFSET $3;
```

### Pattern 6: SQL-Based Personalized Recommendations (DISC-09)

**What:** Recommend events matching user's genre history and friend attendance.
**When to use:** Personalized "For You" section on discover screen.

Three signals, combined with weighted scoring:

1. **Genre affinity** (strongest signal): User's top genres from check-in history (reuse StatsService.getGenreBreakdown query)
2. **Friend attendance** (social signal): Friends who have checked in or plan to attend upcoming events
3. **Trending** (popularity signal): Events with high recent check-in counts

```sql
-- Personalized recommendations: genre affinity + friend attendance + trending
WITH user_genres AS (
  -- User's top genres by check-in count (reuse from StatsService)
  SELECT b.genre, COUNT(DISTINCT c.id) as genre_count
  FROM checkins c
  JOIN event_lineup el ON c.event_id = el.event_id
  JOIN bands b ON el.band_id = b.id
  WHERE c.user_id = $1 AND b.genre IS NOT NULL
  GROUP BY b.genre
  ORDER BY genre_count DESC
  LIMIT 5
),
friend_checkins AS (
  -- Friends checked into upcoming events
  SELECT c.event_id, COUNT(DISTINCT c.user_id) as friend_count
  FROM checkins c
  JOIN user_followers uf ON c.user_id = uf.following_id
  WHERE uf.follower_id = $1
    AND c.event_id IN (
      SELECT id FROM events WHERE event_date >= CURRENT_DATE AND is_cancelled = FALSE
    )
  GROUP BY c.event_id
)
SELECT e.*, v.name as venue_name, v.city, v.state,
  COALESCE(ug.genre_count, 0) * 3.0 as genre_score,    -- weight: 3x
  COALESCE(fc.friend_count, 0) * 5.0 as friend_score,   -- weight: 5x
  COALESCE(sub.checkin_count, 0) * 1.0 as trending_score, -- weight: 1x
  (COALESCE(ug.genre_count, 0) * 3.0 +
   COALESCE(fc.friend_count, 0) * 5.0 +
   COALESCE(sub.checkin_count, 0) * 1.0) as total_score
FROM events e
JOIN venues v ON e.venue_id = v.id
LEFT JOIN event_lineup el ON e.id = el.event_id
LEFT JOIN bands b ON el.band_id = b.id
LEFT JOIN user_genres ug ON b.genre = ug.genre
LEFT JOIN friend_checkins fc ON e.id = fc.event_id
LEFT JOIN (
  SELECT event_id, COUNT(*) as checkin_count
  FROM checkins
  WHERE created_at >= NOW() - INTERVAL '7 days'
  GROUP BY event_id
) sub ON e.id = sub.event_id
WHERE e.event_date >= CURRENT_DATE
  AND e.is_cancelled = FALSE
  AND e.id NOT IN (SELECT event_id FROM checkins WHERE user_id = $1) -- exclude attended
GROUP BY e.id, v.name, v.city, v.state, ug.genre_count, fc.friend_count, sub.checkin_count
HAVING (COALESCE(ug.genre_count, 0) * 3.0 +
        COALESCE(fc.friend_count, 0) * 5.0 +
        COALESCE(sub.checkin_count, 0) * 1.0) > 0
ORDER BY total_score DESC
LIMIT $2;
```

### Anti-Patterns to Avoid
- **Do NOT update bands.average_rating / venues.average_rating columns** with check-in data. Those columns exist for the legacy `reviews` table. Instead, compute aggregate ratings on-the-fly from checkin_band_ratings/checkins and cache in Redis. Mixing old review ratings with new check-in ratings would produce incorrect data.
- **Do NOT add PostGIS** for nearby queries. The existing Haversine approach is sufficient for the current scale. PostGIS is a heavy dependency.
- **Do NOT use pgvector** for recommendations. The roadmap explicitly defers collaborative filtering to v2 (RECC-01). SQL-based genre affinity is the v1 approach.
- **Do NOT create a materialized view** for aggregate ratings. Redis cache-aside with fire-and-forget invalidation is the established pattern and avoids refresh scheduling complexity.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Nearby events | New geospatial service | Extend `EventService.getNearbyEvents()` | Already has Haversine, just change date filter |
| Aggregate ratings | New rating service | Extend `StatsService` or add to BandService/VenueService | Same cache-aside pattern |
| Genre list | Compute from events | Use `BandService.getGenres()` | Already returns distinct genres from bands table |
| Location permissions | New permission flow | Reuse `LocationService` + discover screen patterns | Already handles all permission states |
| Event-band-venue join | New query builder | Use `mapDbEventsWithHeadliner()` pattern from EventService | Already batch-fetches lineup+band data |
| Search debouncing | New debounce util | Reuse discover_providers.dart `DiscoverSearchQuery` pattern | 300ms debounce already implemented |
| Cursor pagination | New pagination | Reuse `FeedService` cursor encode/decode pattern | Already has base64url cursor encoding |
| Mobile search UI | New search widget | Extend `DiscoverScreen` search functionality | Already has search bar, filter chips, results display |

**Key insight:** Nearly every "new" feature in Phase 7 is an extension of an existing pattern. The discover screen already has nearby venues, trending bands, popular bands, map view, and search. Phase 7 pivots this from band/venue discovery to EVENT discovery.

## Common Pitfalls

### Pitfall 1: Confusing Old Review Ratings with New Check-in Ratings
**What goes wrong:** The `bands.average_rating` and `venues.average_rating` columns are computed from the `reviews` table (old system). The new dual-rating system stores band performance in `checkin_band_ratings.rating` and venue experience in `checkins.venue_rating`. Using the wrong source produces incorrect aggregates.
**Why it happens:** Both BandService.updateBandRating() and VenueService.updateVenueRating() update from `reviews` table.
**How to avoid:** Always compute aggregate ratings from `checkin_band_ratings` (for bands) and `checkins.venue_rating > 0` (for venues). Add new methods, do not modify old ones.
**Warning signs:** Average rating looks suspiciously different from what users report seeing.

### Pitfall 2: N+1 Queries in Event Lists with Lineup
**What goes wrong:** Fetching events list, then fetching lineup for each event individually.
**Why it happens:** Naive implementation fetches lineup per event.
**How to avoid:** Use the existing `mapDbEventsWithHeadliner()` pattern which batch-fetches ALL lineup entries with `WHERE el.event_id = ANY($1)` using a single query.
**Warning signs:** API response time increases linearly with result count.

### Pitfall 3: Genre Join Path Through event_lineup
**What goes wrong:** Trying to join genres through `checkins.band_id` (legacy field) instead of `event_lineup`.
**Why it happens:** `checkins.band_id` exists for backward compat but may be NULL for event-first check-ins.
**How to avoid:** Always join through `event_lineup`: `events -> event_lineup -> bands -> genre`. This was established in Phase 6 (decision [06-01]).
**Warning signs:** Missing genres for events with multiple bands; NULL band_id in check-ins.

### Pitfall 4: Stale Cache After Rating Submission
**What goes wrong:** User submits a rating, then views the band/venue page and sees old aggregate.
**Why it happens:** Cache not invalidated on rating submission.
**How to avoid:** Add fire-and-forget cache invalidation in CheckinService when ratings are added (PATCH /ratings endpoint). Same pattern as concert cred invalidation.
**Warning signs:** "My rating didn't count" user complaints.

### Pitfall 5: Nearby Events Date Filter Too Restrictive
**What goes wrong:** `getNearbyEvents()` currently filters `WHERE event_date = CURRENT_DATE`, returning nothing if no events today.
**Why it happens:** The Phase 3 implementation was for check-in auto-suggest (only current-day events matter).
**How to avoid:** For discovery, use a configurable date range (default: next 30 days). Keep the existing current-day method for check-in flow.
**Warning signs:** "No nearby shows" even when events exist tomorrow.

### Pitfall 6: Recommendation Cold Start
**What goes wrong:** New users with no check-in history get empty recommendations.
**Why it happens:** Genre affinity requires check-in data; friend attendance requires follows.
**How to avoid:** Fall back to trending events near user when personalized scores are all zero. The recommendation query's HAVING clause should be relaxed for users with no history.
**Warning signs:** Empty "For You" section for new users.

### Pitfall 7: pg_trgm Similarity Threshold
**What goes wrong:** Search returns too many or too few results.
**Why it happens:** pg_trgm default similarity threshold is 0.3. The `%` operator uses this threshold.
**How to avoid:** Use `SET pg_trgm.similarity_threshold = 0.2;` at session level for more inclusive search, or use `similarity(a, b) > X` with explicit threshold in WHERE clause.
**Warning signs:** Exact matches work but slightly misspelled queries return nothing.

## Code Examples

### Backend: Band Aggregate Rating Endpoint

```typescript
// In BandService or a new method on existing BandService
async getBandWithAggregateRating(bandId: string): Promise<BandWithAggregate> {
  const cacheKey = `band:aggregate:${bandId}`;

  return cache.getOrSet(cacheKey, async () => {
    const [band, aggregate, upcoming] = await Promise.all([
      this.getBandById(bandId),
      this.db.query(
        `SELECT
          AVG(cbr.rating)::numeric(3,2) as avg_performance_rating,
          COUNT(DISTINCT cbr.id)::int as total_ratings,
          COUNT(DISTINCT c.user_id)::int as unique_fans
         FROM checkin_band_ratings cbr
         JOIN checkins c ON cbr.checkin_id = c.id
         WHERE cbr.band_id = $1`,
        [bandId]
      ),
      this.eventService.getEventsByBand(bandId, { upcoming: true, limit: 10 }),
    ]);

    return {
      ...band,
      aggregatePerformanceRating: parseFloat(aggregate.rows[0]?.avg_performance_rating || '0'),
      totalRatings: aggregate.rows[0]?.total_ratings || 0,
      uniqueFans: aggregate.rows[0]?.unique_fans || 0,
      upcomingShows: upcoming,
    };
  }, 600); // 10-min TTL
}
```

### Backend: Trending Events Near User

```typescript
// In EventService or new DiscoveryService
async getTrendingNearby(
  lat: number, lon: number, radiusKm: number = 50, days: number = 7, limit: number = 20
): Promise<(Event & { distanceKm: number; checkinCount: number })[]> {
  const query = `
    SELECT * FROM (
      SELECT e.*,
        v.id as v_id, v.name as venue_name, v.city as venue_city,
        v.state as venue_state, v.image_url as venue_image,
        (SELECT COUNT(*) FROM checkins c
         WHERE c.event_id = e.id
         AND c.created_at >= NOW() - INTERVAL '${days} days') as recent_checkins,
        (6371 * acos(
          cos(radians($1)) * cos(radians(v.latitude)) *
          cos(radians(v.longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(v.latitude))
        )) AS distance_km
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      WHERE e.event_date >= CURRENT_DATE
        AND e.event_date <= CURRENT_DATE + INTERVAL '30 days'
        AND e.is_cancelled = FALSE
        AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
    ) sub
    WHERE distance_km <= $3
    ORDER BY recent_checkins DESC, distance_km ASC
    LIMIT $4
  `;

  const result = await this.db.query(query, [lat, lon, radiusKm, limit]);
  return this.mapDbEventsWithHeadliner(result.rows);
}
```

### Mobile: Event Discovery Freezed Model

```dart
@freezed
sealed class DiscoverEvent with _$DiscoverEvent {
  const factory DiscoverEvent({
    required String id,
    required String eventDate,
    String? eventName,
    String? venueName,
    String? venueCity,
    String? venueState,
    double? distanceKm,
    @Default(0) int checkinCount,
    @Default(0) int friendCount,
    List<DiscoverEventBand>? lineup,
  }) = _DiscoverEvent;

  factory DiscoverEvent.fromJson(Map<String, dynamic> json) =>
      _$DiscoverEventFromJson(json);
}

@freezed
sealed class BandAggregate with _$BandAggregate {
  const factory BandAggregate({
    required double avgPerformanceRating,
    required int totalRatings,
    required int uniqueFans,
  }) = _BandAggregate;

  factory BandAggregate.fromJson(Map<String, dynamic> json) =>
      _$BandAggregateFromJson(json);
}

@freezed
sealed class VenueAggregate with _$VenueAggregate {
  const factory VenueAggregate({
    required double avgExperienceRating,
    required int totalRatings,
    required int uniqueVisitors,
  }) = _VenueAggregate;

  factory VenueAggregate.fromJson(Map<String, dynamic> json) =>
      _$VenueAggregateFromJson(json);
}
```

### Mobile: Discovery Provider Pattern

```dart
// Follow existing discover_providers.dart pattern
@riverpod
Future<List<DiscoverEvent>> nearbyUpcomingEvents(Ref ref) async {
  final position = await ref.watch(currentLocationProvider.future);
  if (position == null) return [];

  final repository = ref.watch(discoveryRepositoryProvider);
  return repository.getNearbyUpcoming(
    latitude: position.latitude,
    longitude: position.longitude,
    radiusKm: 50,
    days: 30,
    limit: 20,
  );
}

@riverpod
Future<List<DiscoverEvent>> recommendedEvents(Ref ref) async {
  final repository = ref.watch(discoveryRepositoryProvider);
  return repository.getRecommendations(limit: 20);
}

@riverpod
Future<List<DiscoverEvent>> genreEvents(Ref ref, String genre) async {
  final repository = ref.watch(discoveryRepositoryProvider);
  return repository.getEventsByGenre(genre: genre, limit: 20);
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `bands.average_rating` from `reviews` table | Aggregate from `checkin_band_ratings` | Must use new source for DISC-02 |
| `venues.average_rating` from `reviews` table | Aggregate from `checkins.venue_rating` | Must use new source for DISC-04 |
| Events nearby = today only | Events nearby = configurable date range | DISC-01 needs multi-day range |
| Search = bands + venues + users | Search = bands + venues + users + events | DISC-07 extends existing search |
| Discovery = bands/venues only | Discovery = events as primary entity | Phase 7 pivots discover screen to events |

**Legacy code that should NOT be changed:**
- `BandService.updateBandRating()` - still used by reviews system, leave as-is
- `VenueService.updateVenueRating()` - still used by reviews system, leave as-is
- `EventService.getNearbyEvents()` - still used by check-in auto-suggest, add new method instead

## Open Questions

1. **Trending score persistence vs. query-time computation**
   - What we know: For small datasets (<100K check-ins), query-time computation with COUNT + date filter is fast enough. For large datasets, a `trending_scores` table with exponential decay is more efficient.
   - What's unclear: Current data volume. The existing `getTrendingEvents()` already does query-time computation.
   - Recommendation: Start with query-time computation (extend existing pattern), add trending_scores table only if performance degrades. Keep it simple for v1.

2. **Recommendation scoring weights**
   - What we know: Genre affinity, friend attendance, and trending are the three signals per DISC-09. Relative weights affect result quality.
   - What's unclear: Optimal weight balance (3:5:1 is a starting point).
   - Recommendation: Use configurable weights (could be environment variables or constants). Start with friend_attendance > genre_affinity > trending. Tune after real usage data.

3. **Whether to add location to recommendations**
   - What we know: DISC-09 says "genre history and friend attendance" but DISC-01 is "nearby shows."
   - What's unclear: Should recommendations factor in user location?
   - Recommendation: Yes, add optional location filter to recommendations. If lat/lon provided, add distance_km <= radiusKm constraint. This makes recommendations locally relevant.

4. **Event search index migration**
   - What we know: pg_trgm GIN index needed on events.event_name for search performance.
   - What's unclear: Whether to add indexes on bands.genre for genre browsing.
   - Recommendation: Add GIN trigram index on events.event_name in a migration. bands.genre is short enough that ILIKE with existing indexes is fine.

## Database Changes Needed

### New Migration: 022_add_event_search_index.ts

```sql
-- GIN trigram index for event name search
CREATE INDEX IF NOT EXISTS idx_events_name_trgm
  ON events USING gin (event_name gin_trgm_ops);

-- Index for genre-based event browsing (bands.genre + event_lineup join)
-- Already have idx_bands_name_trgm from Phase 2
-- bands.genre ILIKE queries are fast enough without trigram index

-- Composite index for trending queries (event_date + is_cancelled)
-- Helps with WHERE event_date >= CURRENT_DATE AND is_cancelled = FALSE
CREATE INDEX IF NOT EXISTS idx_events_upcoming
  ON events (event_date, is_cancelled)
  WHERE is_cancelled = FALSE;
```

### Cache Key Additions

```typescript
// Add to CacheKeys in cache.ts
bandAggregate: (bandId: string) => `band:aggregate:${bandId}`,
venueAggregate: (venueId: string) => `venue:aggregate:${venueId}`,
nearbyEvents: (lat: number, lon: number, radius: number) =>
  `events:nearby:${lat.toFixed(2)}:${lon.toFixed(2)}:${radius}`,
trendingEvents: (lat: number, lon: number) =>
  `events:trending:${lat.toFixed(2)}:${lon.toFixed(2)}`,
genreEvents: (genre: string) => `events:genre:${genre.toLowerCase()}`,
recommendations: (userId: string) => `events:recs:${userId}`,
```

## API Endpoint Plan

### New Endpoints
| Method | Path | Auth | Purpose | Req |
|--------|------|------|---------|-----|
| GET | /api/events/nearby?lat=&lon=&radius=&days= | Required | Upcoming nearby shows | DISC-01 |
| GET | /api/events/trending?lat=&lon=&radius= | Optional | Trending near user | DISC-06 |
| GET | /api/events/genre/:genre?limit=&offset= | Optional | Genre browsing | DISC-08 |
| GET | /api/events/search?q=&limit= | Optional | Event search | DISC-07 |
| GET | /api/events/recommended?lat=&lon= | Required | Personalized recs | DISC-09 |

### Enhanced Endpoints
| Method | Path | Change | Req |
|--------|------|--------|-----|
| GET | /api/bands/:id | Add aggregate performance rating + upcoming shows | DISC-02, DISC-03 |
| GET | /api/venues/:id | Add aggregate experience rating + upcoming events | DISC-04, DISC-05 |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: EventService.ts, StatsService.ts, BandService.ts, VenueService.ts, FeedService.ts, CheckinService.ts
- Codebase analysis: discover_screen.dart, discover_providers.dart, band_detail_screen.dart, venue_detail_screen.dart
- Codebase analysis: types/index.ts (Event, Band, Venue, ConcertCred types)
- Codebase analysis: cache.ts (CacheKeys, CacheTTL, cache-aside pattern)
- [PostgreSQL pg_trgm documentation](https://www.postgresql.org/docs/current/pgtrgm.html) - GIN index, similarity operators
- Existing migrations (001-021) for schema understanding

### Secondary (MEDIUM confidence)
- [Optimizing Fuzzy Search Across Multiple Tables: pg_trgm, GIN, and Triggers](https://dev.to/yugabyte/optimizing-fuzzy-search-across-multiple-tables-pgtrgm-gin-and-triggers-4d1p) - Multi-table search patterns
- [Building a Recommendation Engine with PostgreSQL](https://reintech.io/blog/building-recommendation-engine-postgresql) - SQL-based recommendation patterns
- [SQL Recommender System](https://github.com/farhan-pasha/SQL-Recommender_System) - Pure SQL collaborative filtering
- [Exponentially Decaying Likes for Trending](https://julesjacobs.com/2015/05/06/exponentially-decaying-likes.html) - Time-decay trending algorithm
- [Simple Feed Ranking Algorithm](http://datagenetics.com/blog/october32018/index.html) - Reddit/HN scoring approaches
- [PostgreSQL Functional Index for Spatial Data](https://minervadb.xyz/geospatial-queries-with-functional-indexes-in-postgresql/) - Haversine optimization patterns

### Tertiary (LOW confidence)
- Trending algorithm weight tuning (3:5:1 for genre:friend:trending) - no empirical basis, needs tuning with real data

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and patterns established
- Architecture: HIGH - Direct extensions of existing services verified by reading codebase
- Aggregate ratings: HIGH - SQL patterns verified against actual schema (checkin_band_ratings, checkins.venue_rating)
- Search extension: HIGH - pg_trgm already installed, pattern proven in BandMatcher
- Recommendations: MEDIUM - SQL approach is sound but weight tuning is unverified
- Trending algorithm: MEDIUM - Simple COUNT approach matches existing getTrendingEvents; exponential decay is fallback
- Pitfalls: HIGH - All derived from codebase analysis of actual data flow

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (30 days - stable domain, no external API changes)
