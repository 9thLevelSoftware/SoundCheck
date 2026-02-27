# Phase 6: Profile & Concert Cred - Research

**Researched:** 2026-02-03
**Domain:** Backend stats aggregation with Redis caching + Flutter profile UI redesign
**Confidence:** HIGH

## Summary

Phase 6 builds a "Concert Cred" profile by computing aggregate statistics from existing check-in data (total shows, unique bands, unique venues, genre breakdown, top-rated favorites), integrating the existing badge collection, displaying recent check-in history, and caching everything in Redis with a 10-minute TTL.

The codebase already has substantial infrastructure in place. The backend `UserService.getUserStats()` already computes basic stats (total checkins, unique bands, unique venues, badges, followers) via a single SQL query with scalar subqueries. The mobile `ProfileScreen` already displays these stats in an Untappd-style layout with recent check-ins, badge showcase, and genre stats sections. The `cache` utility (ioredis + in-memory fallback) provides `getOrSet()` for cache-aside patterns with configurable TTL.

The primary work is: (1) extend the backend stats to include genre breakdown and top-rated favorites (bands by average rating, venues by average rating), (2) wrap stats computation in Redis caching with 10-minute TTL and cache invalidation on new check-ins, (3) add a dedicated `/api/users/:userId/concert-cred` endpoint, and (4) redesign the mobile profile to surface all data with the badge collection integrated inline.

**Primary recommendation:** Create a new `StatsService` that wraps all aggregate queries with the existing `cache.getOrSet()` pattern (600s TTL), invalidate on check-in creation via fire-and-forget (matching the established pattern from FeedService/CheckinService), and redesign the Flutter profile screen to consume the expanded stats endpoint.

## Standard Stack

### Core

Already in the project -- no new libraries needed.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ioredis | (existing) | Redis caching for stats | Already used for BullMQ, feed caching, rate limiting, Pub/Sub |
| pg (node-postgres) | (existing) | PostgreSQL aggregate queries | Already used throughout all services |
| Riverpod | 3.1.0 | Flutter state management | Already used; AsyncValue uses .value not .valueOrNull |
| Freezed | (existing) | Dart immutable data models | Already used for all domain models |
| Dio | (existing) | HTTP client | Already used for all API calls |
| percent_indicator | (existing) | Badge progress rings | Already used in BadgeCollectionScreen |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cache utility | (src/utils/cache.ts) | Cache-aside with Redis/memory fallback | All stats caching |
| CacheKeys/CacheTTL | (src/utils/cache.ts) | Type-safe cache key builders | Extend with stats keys |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline Redis calls | Existing `cache.getOrSet()` | getOrSet is cleaner, already tested, handles fallback |
| Materialized views | Application-layer caching | App-layer cache is simpler, already established, 10-min TTL sufficient |
| Separate stats DB table | Computed + cached on demand | On-demand avoids stale denormalized data, simpler to maintain |

**Installation:**
```bash
# No new packages needed -- everything is already installed
```

## Architecture Patterns

### Recommended Project Structure

Backend additions:
```
backend/src/
├── services/
│   └── StatsService.ts         # NEW: Aggregate stats + Redis caching
├── controllers/
│   └── UserController.ts       # MODIFY: Add concert-cred endpoint handler
├── routes/
│   └── userRoutes.ts           # MODIFY: Add GET /:userId/concert-cred route
└── types/
    └── index.ts                # MODIFY: Add ConcertCred interface
```

Mobile additions:
```
mobile/lib/src/features/profile/
├── domain/
│   └── concert_cred.dart       # NEW: Freezed model for concert cred data
├── data/
│   └── profile_repository.dart # MODIFY: Add getConcertCred() method
└── presentation/
    ├── profile_screen.dart     # MODIFY: Redesign with concert cred sections
    └── providers/
        └── profile_providers.dart  # MODIFY: Add concertCred provider
```

### Pattern 1: Stats Computation with Cache-Aside (Backend)

**What:** Use `cache.getOrSet()` to wrap expensive aggregate queries with a 10-minute TTL. Invalidate on new check-in creation using fire-and-forget pattern.

**When to use:** All stats endpoints.

**Example:**
```typescript
// Source: Existing pattern from FeedService + cache.ts
import { cache, CacheTTL } from '../utils/cache';

const STATS_TTL = 600; // 10 minutes per PRFL-08

export class StatsService {
  private db = Database.getInstance();

  async getConcertCred(userId: string): Promise<ConcertCred> {
    const cacheKey = `stats:concert-cred:${userId}`;

    return cache.getOrSet(cacheKey, async () => {
      // Run all aggregate queries in parallel
      const [basic, genres, topBands, topVenues, recentCheckins] = await Promise.all([
        this.getBasicStats(userId),
        this.getGenreBreakdown(userId),
        this.getTopRatedBands(userId),
        this.getTopRatedVenues(userId),
        this.getRecentCheckins(userId),
      ]);

      return { ...basic, genres, topBands, topVenues, recentCheckins };
    }, STATS_TTL);
  }

  // Called fire-and-forget from CheckinService after check-in creation
  async invalidateUserStats(userId: string): Promise<void> {
    await cache.del(`stats:concert-cred:${userId}`);
  }
}
```

### Pattern 2: Fire-and-Forget Cache Invalidation (Backend)

**What:** After a check-in is created, invalidate the user's stats cache in a non-blocking manner. Matches the exact pattern used in CheckinService for feed cache invalidation.

**When to use:** After creating a check-in.

**Example:**
```typescript
// Source: Existing pattern from CheckinService.createEventCheckin()
// In CheckinService, after successful check-in creation:

// Fire-and-forget: invalidate stats cache for the user
this.invalidateStatsCacheForCheckin(userId).catch((err) =>
  console.error('Warning: stats cache invalidation failed:', err)
);

private async invalidateStatsCacheForCheckin(userId: string): Promise<void> {
  try {
    await cache.del(`stats:concert-cred:${userId}`);
  } catch (error) {
    console.error('Stats cache invalidation error:', error);
    // Non-fatal: do not rethrow
  }
}
```

### Pattern 3: Parallel Aggregate Queries (Backend)

**What:** Run multiple independent aggregate queries in parallel using Promise.all to minimize latency. Each query targets a specific stat dimension.

**When to use:** When computing the full concert cred payload.

**Example:**
```typescript
// Genre breakdown query
async getGenreBreakdown(userId: string, limit: number = 5): Promise<GenreStat[]> {
  const result = await this.db.query(`
    SELECT b.genre, COUNT(DISTINCT c.id)::int as checkin_count
    FROM checkins c
    JOIN event_lineup el ON c.event_id = el.event_id
    JOIN bands b ON el.band_id = b.id
    WHERE c.user_id = $1 AND b.genre IS NOT NULL
    GROUP BY b.genre
    ORDER BY checkin_count DESC
    LIMIT $2
  `, [userId, limit]);

  const total = result.rows.reduce((sum, r) => sum + r.checkin_count, 0);
  return result.rows.map(r => ({
    genre: r.genre,
    count: r.checkin_count,
    percentage: total > 0 ? Math.round((r.checkin_count / total) * 100) : 0,
  }));
}

// Top-rated bands query (personal favorites by average band rating)
async getTopRatedBands(userId: string, limit: number = 5): Promise<TopRatedBand[]> {
  const result = await this.db.query(`
    SELECT b.id, b.name, b.genre, b.image_url,
           AVG(cbr.rating)::numeric(3,2) as avg_rating,
           COUNT(DISTINCT c.id)::int as times_seen
    FROM checkin_band_ratings cbr
    JOIN checkins c ON cbr.checkin_id = c.id
    JOIN bands b ON cbr.band_id = b.id
    WHERE c.user_id = $1
    GROUP BY b.id, b.name, b.genre, b.image_url
    HAVING COUNT(DISTINCT c.id) >= 1
    ORDER BY avg_rating DESC, times_seen DESC
    LIMIT $2
  `, [userId, limit]);

  return result.rows.map(r => ({
    id: r.id,
    name: r.name,
    genre: r.genre,
    imageUrl: r.image_url,
    avgRating: parseFloat(r.avg_rating),
    timesSeen: r.times_seen,
  }));
}

// Top-rated venues (personal favorites by average venue rating)
async getTopRatedVenues(userId: string, limit: number = 5): Promise<TopRatedVenue[]> {
  const result = await this.db.query(`
    SELECT v.id, v.name, v.city, v.state, v.image_url,
           AVG(c.venue_rating)::numeric(3,2) as avg_rating,
           COUNT(DISTINCT c.id)::int as times_visited
    FROM checkins c
    JOIN venues v ON c.venue_id = v.id
    WHERE c.user_id = $1 AND c.venue_rating IS NOT NULL AND c.venue_rating > 0
    GROUP BY v.id, v.name, v.city, v.state, v.image_url
    HAVING COUNT(DISTINCT c.id) >= 1
    ORDER BY avg_rating DESC, times_visited DESC
    LIMIT $2
  `, [userId, limit]);

  return result.rows.map(r => ({
    id: r.id,
    name: r.name,
    city: r.city,
    state: r.state,
    imageUrl: r.image_url,
    avgRating: parseFloat(r.avg_rating),
    timesVisited: r.times_visited,
  }));
}
```

### Pattern 4: Riverpod AsyncNotifier with Auto-Refresh (Mobile)

**What:** Use Riverpod's `@riverpod` annotation for the concert cred provider, matching the established pattern from profile_providers.dart. The provider fetches from the new endpoint and auto-disposes when the profile screen unmounts.

**When to use:** For the concert cred data on the profile screen.

**Example:**
```dart
// Source: Existing pattern from profile_providers.dart
@riverpod
Future<ConcertCred> concertCred(Ref ref, String userId) async {
  final repository = ref.watch(profileRepositoryProvider);
  return repository.getConcertCred(userId);
}
```

### Pattern 5: Freezed Model for Concert Cred (Mobile)

**What:** Define the concert cred response as a Freezed model with fromJson for type-safe deserialization.

**When to use:** For the concert cred domain model.

**Example:**
```dart
@freezed
sealed class ConcertCred with _$ConcertCred {
  const factory ConcertCred({
    required int totalShows,
    required int uniqueBands,
    required int uniqueVenues,
    required int badgesEarned,
    required int followersCount,
    required int followingCount,
    @Default([]) List<GenreStat> genres,
    @Default([]) List<TopRatedBand> topBands,
    @Default([]) List<TopRatedVenue> topVenues,
  }) = _ConcertCred;

  factory ConcertCred.fromJson(Map<String, dynamic> json) =>
      _$ConcertCredFromJson(json);
}
```

### Anti-Patterns to Avoid

- **N+1 queries for stats:** Do NOT query each stat dimension separately in serial. Use Promise.all for parallel execution.
- **Caching individual stat fields:** Cache the ENTIRE concert cred payload as one cached unit. Partial caching adds complexity without meaningful benefit at this scale.
- **Recomputing on every profile view:** ALWAYS use cache-aside pattern. Stats are expensive (multiple aggregates across large tables).
- **Blocking check-in on cache invalidation:** Cache invalidation MUST be fire-and-forget. A cache invalidation failure should NEVER prevent a check-in from succeeding.
- **Computing genre stats client-side:** The current `userGenreStatsProvider` fetches 100 check-ins and computes genres client-side. This is incorrect for users with many check-ins. Move to server-side SQL aggregation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cache-aside pattern | Custom Redis get/set wrapper | `cache.getOrSet()` from utils/cache.ts | Already tested, handles memory fallback, TTL built-in |
| Cache invalidation | Manual Redis DEL calls | `cache.del()` from utils/cache.ts | Consistent with existing codebase patterns |
| Type-safe cache keys | String concatenation | Extend `CacheKeys` in utils/cache.ts | Prevents key collision bugs |
| Aggregate query results mapping | Manual row parsing | Consistent with existing service patterns (mapDb*To*) | Type safety, consistency |

**Key insight:** This phase is 90% integration of existing patterns. The codebase already has: (1) Redis caching with cache-aside, (2) fire-and-forget invalidation, (3) aggregate SQL queries in UserService, (4) Freezed models, (5) Riverpod providers. The work is extending and composing these, not building new infrastructure.

## Common Pitfalls

### Pitfall 1: Genre Stats Computed Client-Side

**What goes wrong:** The current `userGenreStatsProvider` in profile_providers.dart fetches up to 100 check-ins and computes genre breakdown in Dart. For users with 100+ check-ins, this produces inaccurate results and wastes bandwidth.
**Why it happens:** It was a quick implementation during Phase 3.
**How to avoid:** Move genre aggregation to the StatsService SQL query. Join checkins -> event_lineup -> bands and GROUP BY genre.
**Warning signs:** Genre percentages look wrong for active users.

### Pitfall 2: Stats Query Performance with Scalar Subqueries

**What goes wrong:** The current `getUserStats()` uses 7 scalar subqueries in a single SELECT. Each is an independent COUNT against potentially large tables. As user count grows, this becomes slow.
**Why it happens:** Scalar subqueries are intuitive to write but execute sequentially within a single query.
**How to avoid:** Two strategies: (1) Redis caching with 10-min TTL means the query runs at most once per 10 minutes per user, (2) For the expanded stats, consider using CTEs or separate parallel queries via Promise.all.
**Warning signs:** Profile load times > 500ms.

### Pitfall 3: Cache Key Collisions Between Stats Versions

**What goes wrong:** If the old `/users/:userId/stats` endpoint and the new concert cred endpoint use overlapping cache keys, stale data from the old format could be served.
**Why it happens:** Reusing existing cache key prefixes without namespace separation.
**How to avoid:** Use distinct cache key prefixes: `stats:concert-cred:{userId}` for the new endpoint. Keep the existing stats query uncached (it's simple enough) or give it its own key prefix.
**Warning signs:** JSON parsing errors in the mobile app after deployment.

### Pitfall 4: Forgetting to Invalidate Cache on Check-in Delete

**What goes wrong:** User deletes a check-in, but cached stats still reflect the old count.
**Why it happens:** Invalidation is only added to check-in creation, not deletion.
**How to avoid:** Add invalidation to CheckinService.deleteCheckin() as well. Same fire-and-forget pattern.
**Warning signs:** Stats don't decrease when user deletes check-ins (stale for up to 10 minutes).

### Pitfall 5: band_id NULL in Genre Aggregation

**What goes wrong:** Event-first check-ins may have NULL band_id on the checkins row (headliner is populated from event_lineup). Genre queries that JOIN checkins.band_id directly will miss these.
**Why it happens:** The event-first flow populates band_id from the headliner but it could be NULL if no lineup exists.
**How to avoid:** For genre breakdown and top bands, always JOIN through event_lineup (checkins -> event_lineup -> bands) rather than through checkins.band_id. This correctly accounts for multi-band events.
**Warning signs:** Missing genres/bands for event-first check-ins.

### Pitfall 6: Riverpod 3.1.0 AsyncValue Gotcha

**What goes wrong:** Using `.valueOrNull` on AsyncValue (old API) instead of `.value` (Riverpod 3.1.0).
**Why it happens:** Outdated examples or Claude training data.
**How to avoid:** Always use `.value` for AsyncValue in Riverpod 3.1.0, as documented in STATE.md.
**Warning signs:** Compile error or linter warning about deprecated member.

## Code Examples

### Backend: StatsService Structure

```typescript
// Source: Extrapolated from existing UserService.getUserStats() + FeedService caching patterns
import Database from '../config/database';
import { cache } from '../utils/cache';

const CONCERT_CRED_TTL = 600; // 10 minutes per PRFL-08

interface ConcertCred {
  totalShows: number;
  uniqueBands: number;
  uniqueVenues: number;
  badgesEarned: number;
  followersCount: number;
  followingCount: number;
  genres: GenreStat[];
  topBands: TopRatedBand[];
  topVenues: TopRatedVenue[];
}

interface GenreStat {
  genre: string;
  count: number;
  percentage: number;
}

interface TopRatedBand {
  id: string;
  name: string;
  genre: string | null;
  imageUrl: string | null;
  avgRating: number;
  timesSeen: number;
}

interface TopRatedVenue {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  imageUrl: string | null;
  avgRating: number;
  timesVisited: number;
}

export class StatsService {
  private db = Database.getInstance();

  async getConcertCred(userId: string): Promise<ConcertCred> {
    return cache.getOrSet(`stats:concert-cred:${userId}`, () => this.computeConcertCred(userId), CONCERT_CRED_TTL);
  }

  private async computeConcertCred(userId: string): Promise<ConcertCred> {
    const [basic, genres, topBands, topVenues] = await Promise.all([
      this.getBasicStats(userId),
      this.getGenreBreakdown(userId),
      this.getTopRatedBands(userId),
      this.getTopRatedVenues(userId),
    ]);

    return { ...basic, genres, topBands, topVenues };
  }

  async invalidate(userId: string): Promise<void> {
    await cache.del(`stats:concert-cred:${userId}`);
  }
}
```

### Backend: Adding Cache Invalidation to CheckinService

```typescript
// Source: Existing fire-and-forget pattern from CheckinService
// Add to createEventCheckin() after successful insert, alongside existing feed cache invalidation:

// Fire-and-forget: invalidate stats cache for the user
this.invalidateStatsCacheForCheckin(userId).catch((err) =>
  console.error('Warning: stats cache invalidation failed:', err)
);
```

### Mobile: ConcertCred Freezed Model

```dart
// Source: Existing Freezed pattern from user_statistics.dart
@freezed
sealed class ConcertCred with _$ConcertCred {
  const factory ConcertCred({
    @Default(0) int totalShows,
    @Default(0) int uniqueBands,
    @Default(0) int uniqueVenues,
    @Default(0) int badgesEarned,
    @Default(0) int followersCount,
    @Default(0) int followingCount,
    @Default([]) List<GenreStat> genres,
    @Default([]) List<TopRatedBand> topBands,
    @Default([]) List<TopRatedVenue> topVenues,
  }) = _ConcertCred;

  factory ConcertCred.fromJson(Map<String, dynamic> json) =>
      _$ConcertCredFromJson(json);
}
```

### Mobile: Profile Provider Pattern

```dart
// Source: Existing pattern from profile_providers.dart
@riverpod
Future<ConcertCred> concertCred(Ref ref, String userId) async {
  final repository = ref.watch(profileRepositoryProvider);
  return repository.getConcertCred(userId);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Genre stats computed client-side | Server-side SQL aggregation with cache | Phase 6 (now) | Accurate for all check-in counts, lower bandwidth |
| UserService.getUserStats() uncached | StatsService with Redis cache-aside | Phase 6 (now) | Profile loads faster, DB load reduced |
| Basic stats only (counts) | Full concert cred (counts + genres + favorites) | Phase 6 (now) | Richer profile experience |
| Badge showcase separate from profile | Badge collection integrated into profile | Phase 6 (now) | Single screen for concert identity |

**Deprecated/outdated:**
- `userGenreStatsProvider` computing genres client-side from 100 check-ins: Replace with server-side aggregation
- `UserStatistics` Freezed model: Replace with `ConcertCred` that includes genres and favorites

## Open Questions

1. **Top-rated favorites: minimum ratings threshold?**
   - What we know: Users rate bands (0.5-5.0) and venues (0.5-5.0) per check-in. Some may have only 1 rating for a band.
   - What's unclear: Should "top-rated" require a minimum number of ratings (e.g., 2+) to avoid single-visit bands ranking at the top?
   - Recommendation: Start with minimum 1 rating (any rated band/venue qualifies), then adjust based on UX feedback. The data is cached so changing the threshold is a one-line SQL change.

2. **Public vs. private profile stats?**
   - What we know: The current `getUserByUsername` endpoint already returns stats for public profiles. `getUserStats` requires auth.
   - What's unclear: Should the full concert cred (including top-rated bands/venues) be visible on public profiles, or only the owner's view?
   - Recommendation: Make concert cred public by default (same as Untappd). Concert attendance is not sensitive data and public profiles drive engagement.

3. **Badge progress on profile vs. separate screen?**
   - What we know: Badge collection screen exists (Phase 4) with full progress rings and rarity. Profile has a horizontal badge showcase.
   - What's unclear: Should the profile show badge progress inline, or just earned badges with a "View All" link to the collection screen?
   - Recommendation: Profile shows earned badges (horizontal scroll) with a "View All" link. Don't duplicate the full progress UI; the badge collection screen already handles that well.

## Sources

### Primary (HIGH confidence)

- **Existing codebase** -- Direct file reads of all relevant source files:
  - `backend/src/services/UserService.ts` -- Current getUserStats() implementation
  - `backend/src/services/CheckinService.ts` -- Check-in creation flow, fire-and-forget patterns
  - `backend/src/services/FeedService.ts` -- Cache-aside pattern with Redis
  - `backend/src/services/BadgeService.ts` -- Badge evaluation and progress
  - `backend/src/services/BadgeEvaluators.ts` -- Aggregate query patterns for badge criteria
  - `backend/src/utils/cache.ts` -- CacheService with getOrSet, delPattern, TTL constants
  - `backend/src/controllers/UserController.ts` -- Existing stats endpoint handler
  - `backend/src/routes/userRoutes.ts` -- Route structure and middleware
  - `backend/src/routes/badgeRoutes.ts` -- Badge route patterns
  - `backend/src/types/index.ts` -- TypeScript type definitions
  - `backend/migrations/005_expand-create-checkin-band-ratings.ts` -- Band ratings schema
  - `mobile/lib/src/features/profile/presentation/profile_screen.dart` -- Current profile UI
  - `mobile/lib/src/features/profile/domain/user_statistics.dart` -- Current stats model
  - `mobile/lib/src/features/profile/data/profile_repository.dart` -- Current profile API calls
  - `mobile/lib/src/features/profile/presentation/providers/profile_providers.dart` -- Current providers
  - `mobile/lib/src/features/badges/presentation/badge_collection_screen.dart` -- Badge collection UI
  - `mobile/lib/src/features/badges/presentation/badge_providers.dart` -- Badge providers
  - `mobile/lib/src/features/badges/domain/badge.dart` -- Badge Freezed models
  - `mobile/lib/src/features/auth/domain/user.dart` -- User model with stats fields
  - `mobile/lib/src/features/checkins/domain/checkin.dart` -- CheckIn model
  - `mobile/lib/src/features/checkins/data/checkin_repository.dart` -- CheckIn repository
  - `mobile/lib/src/core/providers/providers.dart` -- Core providers
  - `mobile/lib/src/core/api/api_config.dart` -- API endpoints

- **STATE.md** -- All accumulated decisions from Phases 1-5

### Secondary (MEDIUM confidence)

- Standard PostgreSQL aggregate query patterns (COUNT, AVG, GROUP BY, DISTINCT)
- Standard Redis caching patterns (cache-aside, TTL expiration, key invalidation)

### Tertiary (LOW confidence)

- None -- all findings verified against existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries; everything is already in the project
- Architecture: HIGH -- All patterns directly extrapolated from existing codebase (FeedService caching, CheckinService fire-and-forget, UserService aggregate queries)
- Pitfalls: HIGH -- Identified from direct code review (client-side genre computation, NULL band_id, scalar subquery performance, cache key collisions)

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (stable -- no external dependencies to become stale)

---

## Appendix: Existing Code Inventory

### What Already Exists (Extend, Don't Rebuild)

**Backend:**
- `UserService.getUserStats()` -- Basic stats (7 scalar subqueries in one SELECT). Extend with genre/favorites or deprecate in favor of StatsService.
- `UserController.getUserStats()` -- Route handler at GET /api/users/:userId/stats. Add new handler for concert cred.
- `cache.getOrSet()` -- Cache-aside with Redis + memory fallback. Ready to use.
- `cache.del()` / `cache.delPattern()` -- Cache invalidation. Ready to use.
- `CacheKeys` -- Type-safe key builders. Extend with stats keys.
- `CacheTTL` -- TTL constants (SHORT=60s, MEDIUM=300s, LONG=3600s, DAY=86400s). 600s is between MEDIUM and LONG; define a custom constant.
- Fire-and-forget pattern in CheckinService -- `this.invalidate*().catch(err => console.error(...))`. Use this exact pattern.

**Mobile:**
- `ProfileScreen` with `_MainStatsRow`, `_LevelProgress`, `_RecentCheckins`, `_BadgesShowcase`, `_GenreStats`, `_WishlistPreview` sections
- `UserStatistics` Freezed model (totalCheckins, uniqueBands, uniqueVenues, etc.)
- `ProfileRepository.getUserStatistics()` calling `/users/me/statistics`
- `profile_providers.dart` with `userRecentCheckinsProvider`, `userGenreStatsProvider`, `userBadgesProvider`
- `BadgeCollectionScreen` with full progress rings, rarity, and WebSocket badge-earned listener
- `User` model already has `totalCheckins`, `uniqueBands`, `uniqueVenues`, `badgesCount`, `followersCount`, `followingCount`
- `AppTheme` with all color constants (electricPurple, neonPink, liveGreen, toastGold, etc.)

### What Needs to Be Created

**Backend:**
- `StatsService` class with `getConcertCred()`, `invalidate()`, and individual query methods
- `ConcertCred`, `GenreStat`, `TopRatedBand`, `TopRatedVenue` interfaces in types/index.ts
- New route: GET /api/users/:userId/concert-cred (or extend existing stats endpoint)
- Cache invalidation call in CheckinService.createEventCheckin() and .deleteCheckin()
- Extend CacheKeys with `concertCred: (userId) => \`stats:concert-cred:${userId}\``

**Mobile:**
- `ConcertCred` Freezed model with nested `GenreStat`, `TopRatedBand`, `TopRatedVenue`
- `concertCredProvider` in profile_providers.dart
- `ProfileRepository.getConcertCred()` method
- Redesigned `ProfileScreen` sections for concert cred data
- Integration of badge showcase into profile (earned badges + "View All" to collection screen)

### Database Tables Involved (No New Tables Needed)

| Table | Role in Stats | Key Columns |
|-------|---------------|-------------|
| checkins | Total shows, venue ratings | user_id, venue_id, event_id, venue_rating, created_at |
| checkin_band_ratings | Band ratings, favorites | checkin_id, band_id, rating |
| event_lineup | Genre aggregation (join path) | event_id, band_id |
| bands | Band names, genres | id, name, genre, image_url |
| venues | Venue names, locations | id, name, city, state, image_url |
| user_badges | Badge count | user_id, badge_id |
| user_followers | Follower/following counts | follower_id, following_id |
