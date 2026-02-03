# Phase 7 Plan 2: Event Discovery Endpoints + Mobile UI Summary

**One-liner:** GPS-based nearby upcoming shows, genre browse, trending-by-checkins, and multi-entity event search with event-first discover screen.

## Execution Stats

- **Duration:** ~9 min
- **Tasks:** 2/2 complete
- **Commits:** 2

## What Was Built

### Backend (Task 1)
Five new/enhanced event discovery endpoints:

1. **GET /api/events/discover** - Nearby upcoming events (Haversine + bounding box, configurable radius/days, auth required)
2. **GET /api/events/trending** - Enhanced with optional lat/lon for location-aware trending (backward compat preserved)
3. **GET /api/events/genre/:genre** - Events filtered by genre via event_lineup -> bands join
4. **GET /api/events/search** - Multi-entity search (event name, band name, venue name, genre ILIKE)
5. **GET /api/search/events** - Alternative search path for discoverability

All discovery endpoints use Redis cache with 300s TTL via CacheKeys.nearbyEvents, trendingEvents, genreEvents.

### Mobile (Task 2)
Event-first discover screen with models, repository, providers:

1. **DiscoverEvent** Freezed model with fromEventJson factory for backend Event response parsing
2. **DiscoveryRepository** with 4 API methods matching backend endpoints
3. **6 new Riverpod providers:** nearbyUpcomingEvents, trendingNearbyEvents, genreList, genreEvents (family), discoverEventSearch, enhanced discoverSearchResults
4. **Discover screen redesign:** Nearby Shows (GPS), Browse by Genre (chips + modal sheet), Trending Near You (check-in badges), Popular This Week (bands - secondary)
5. **Search results enhanced:** Events section shown first with calendar icon, toastGold accent

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | f4d88dd | feat(07-02): add event discovery endpoints (nearby, trending, genre, search) |
| 2 | 685988f | feat(07-02): add mobile event discovery UI with models, repository, and providers |

## Key Files

### Created
- `mobile/lib/src/features/discover/domain/discovery_models.dart` - DiscoverEvent Freezed model
- `mobile/lib/src/features/discover/data/discovery_repository.dart` - DiscoveryRepository API client

### Modified
- `backend/src/services/EventService.ts` - getNearbyUpcoming, getTrendingNearby, getByGenre, searchEvents
- `backend/src/controllers/EventController.ts` - 3 new handlers + enhanced trending
- `backend/src/routes/eventRoutes.ts` - /discover, /genre/:genre, /search routes
- `backend/src/routes/searchRoutes.ts` - /api/search/events
- `backend/src/utils/cache.ts` - nearbyEvents, trendingEvents, genreEvents cache keys
- `mobile/lib/src/core/providers/providers.dart` - discoveryRepositoryProvider (keepAlive)
- `mobile/lib/src/features/discover/presentation/providers/discover_providers.dart` - 6 new providers + events in search results
- `mobile/lib/src/features/discover/presentation/discover_screen.dart` - Event-first layout

## Decisions Made

1. **ILIKE instead of pg_trgm similarity for event search:** Used ILIKE '%query%' for event search instead of pg_trgm similarity operator (%) because pg_trgm requires extension enabled and threshold configuration. ILIKE is simpler and sufficient for the current scale. Can migrate to pg_trgm later if needed.
2. **DiscoverEvent.fromEventJson factory instead of standard fromJson:** Backend Event response has deeply nested venue/lineup objects that don't map cleanly to flat Freezed fields. Custom factory extracts headliner from band compat field or lineup[0].band.
3. **Genre events in modal bottom sheet:** Rather than inline expansion (complex scroll management), genre chip tap opens a scrollable modal sheet with filtered events. Better UX for browsing genre results.
4. **Events shown first in search results:** Event-first discovery means search results prioritize events section above bands/venues/users.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- [x] Backend compiles: `npx tsc --noEmit` passes clean
- [x] Mobile codegen: `dart run build_runner build` succeeds
- [x] Mobile analysis: `dart analyze lib/` - zero new errors (pre-existing warnings only)
- [x] EventService has getNearbyUpcoming, getTrendingNearby, getByGenre, searchEvents
- [x] Routes: /discover, /genre/:genre, /search before /:id
- [x] Existing getNearbyEvents unchanged (check-in flow)
- [x] Existing /trending backward-compatible (works without lat/lon)
- [x] CacheKeys includes nearbyEvents, trendingEvents, genreEvents
- [x] DiscoverSearchResults includes events field
- [x] Discover screen shows Nearby Shows, Genre Browse, Trending sections
