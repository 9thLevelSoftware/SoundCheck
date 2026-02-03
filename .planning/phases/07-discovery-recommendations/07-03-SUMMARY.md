---
phase: 07-discovery-recommendations
plan: 03
subsystem: discovery
tags: [recommendations, personalization, genre-affinity, friend-attendance, trending, cold-start, for-you]
dependency-graph:
  requires: [07-01, 07-02]
  provides: [personalized-event-recommendations, for-you-discover-section]
  affects: [08-polish-launch]
tech-stack:
  added: []
  patterns: [weighted-cte-scoring, cold-start-fallback-to-trending, hidden-when-empty-section]
key-files:
  created: []
  modified:
    - backend/src/services/DiscoveryService.ts
    - backend/src/controllers/EventController.ts
    - backend/src/routes/eventRoutes.ts
    - backend/src/utils/cache.ts
    - backend/src/services/CheckinService.ts
    - backend/src/services/EventService.ts
    - mobile/lib/src/features/discover/data/discovery_repository.dart
    - mobile/lib/src/features/discover/presentation/providers/discover_providers.dart
    - mobile/lib/src/features/discover/presentation/discover_screen.dart
decisions:
  - id: 07-03-01
    description: "Three-CTE weighted scoring: genre affinity 3x, friend attendance 5x, trending 1x (friends matter most for social discovery)"
  - id: 07-03-02
    description: "Cold start fallback to trending events when personalized query returns zero results (server-side, never empty For You)"
  - id: 07-03-03
    description: "For You section auto-hides when recommendations empty (no empty state -- clean UX for new users)"
  - id: 07-03-04
    description: "EventService.mapDbEventsWithHeadliner made public (was private) for lineup hydration reuse in DiscoveryService"
metrics:
  duration: 6 min
  completed: 2026-02-03
---

# Phase 7 Plan 3: Personalized Event Recommendations Summary

SQL-based personalized recommendations using genre affinity, friend attendance, and trending signals with cold-start fallback. "For You" section on discover screen shows personalized results, auto-hides for users with no data.

## What Was Built

### Backend (Task 1)
1. **DiscoveryService.getRecommendedEvents**: New method with three-CTE weighted scoring query:
   - `user_genres` CTE: user's top 5 genres by check-in count (through event_lineup -> bands join)
   - `friend_checkins` CTE: friends checked into upcoming events (via user_followers)
   - `recent_trending` CTE: events with recent check-ins (last 7 days)
   - Scoring: genre_count * 3.0 + friend_count * 5.0 + trending_count * 1.0
   - HAVING clause filters events with total_score > 0
   - Already-attended events excluded via NOT IN subquery
   - Optional Haversine distance filter when lat/lon/radius provided

2. **Cold start fallback**: When personalized query returns zero results, server falls back to `eventService.getTrendingNearby()` (location-aware) or `eventService.getTrendingEvents()` (global). "For You" is never truly empty.

3. **GET /api/events/recommended**: New authenticated endpoint with optional lat/lon/radius/limit query params. Route placed before /:id to avoid param conflict.

4. **EventService.mapDbEventsWithHeadliner**: Changed from `private` to `public` for reuse by DiscoveryService.

5. **Cache**: `CacheKeys.recommendations(userId)` with 600s TTL. Invalidated fire-and-forget on check-in create (both event-first and legacy paths) and check-in delete.

### Mobile (Task 2)
1. **DiscoveryRepository.getRecommendations**: New method calling GET /api/events/recommended with optional location params. Parses response into List<DiscoverEvent>.

2. **recommendedEventsProvider**: Riverpod FutureProvider watching currentLocationProvider. Calls getRecommendations with lat/lon when location available, without when not. Returns empty list on error (graceful degradation).

3. **"For You" section**: Inserted as FIRST section in discover screen's _buildTrendingContent:
   - Header: "For You" with subtitle "Based on your concert taste"
   - Horizontal scrollable list of _ForYouCard widgets (200px wide)
   - Card shows: band/event image, date badge in voltLime, genre tag pill in electricPurple, event/band name bold, venue + city in textTertiary
   - Section auto-hides when data is empty (SizedBox.shrink) or on error
   - Loading state: small centered spinner with section header

4. **Final discover screen order**: For You > Nearby Shows > Genre Browse > Trending Near You > Popular This Week

## Decisions Made

1. **[07-03-01] Weighted scoring: friends 5x, genre 3x, trending 1x**: Friend attendance gets highest weight because social proof is the strongest discovery signal. Genre affinity is secondary. Trending provides baseline visibility for events without personal connections.
2. **[07-03-02] Cold start handled server-side**: New users with no check-in history or friends see trending events returned by the same /recommended endpoint. Client doesn't need separate cold-start logic.
3. **[07-03-03] Auto-hide For You section**: When recommendations are empty (or error), the section renders SizedBox.shrink(). No "No recommendations yet" empty state -- cleaner UX, user doesn't need to know the system couldn't personalize.
4. **[07-03-04] mapDbEventsWithHeadliner made public**: Simplest approach to share lineup hydration between EventService and DiscoveryService. No duplication, single source of truth.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- [x] Backend compiles: `npx tsc --noEmit` passes clean
- [x] Mobile codegen: `dart run build_runner build` succeeds (22 outputs)
- [x] Mobile analysis: `dart analyze lib/` - zero errors (72 warnings/infos, all pre-existing)
- [x] DiscoveryService.ts has getRecommendedEvents method
- [x] EventController.ts has getRecommendedEvents handler
- [x] eventRoutes.ts has /recommended route before /:id
- [x] CacheKeys includes recommendations key
- [x] CheckinService invalidates recommendations cache on create (2 paths) and delete (1 path)
- [x] EventService.mapDbEventsWithHeadliner is public
- [x] Cold start: falls back to trending when personalized query is empty
- [x] DiscoveryRepository has getRecommendations method
- [x] discover_providers.dart has recommendedEvents function
- [x] "For You" section appears first on discover screen
- [x] "For You" section hidden when recommendations empty
- [x] Section order: For You > Nearby Shows > Genre Browse > Trending > Popular

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 63892fc | Backend: recommendation engine with 3-CTE scoring, /recommended endpoint, cache invalidation |
| 2 | f6e91ac | Mobile: For You section with recommendation cards, provider, repository method |

## Next Phase Readiness

Phase 7 (Discovery & Recommendations) is now complete. All 3 plans delivered:
- Plan 01: Band/venue aggregate ratings with cache-aside
- Plan 02: Event discovery endpoints (nearby, trending, genre, search)
- Plan 03: Personalized recommendations with For You section

Phase 8 (Polish & Launch) can proceed.
