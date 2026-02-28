---
phase: 11-platform-trust-between-show-retention
plan: 05
subsystem: mobile-ui
tags: [flutter, riverpod, trending, search, dio, wilson-score]

requires:
  - phase: 11-02
    provides: "GET /api/trending endpoint with Wilson-scored composite ranking"
  - phase: 11-03
    provides: "GET /api/search unified search endpoint with categorized results"
provides:
  - "TrendingFeedSection widget for Discover screen"
  - "TrendingRepository API client for GET /api/trending"
  - "Unified search with categorized bands/venues/events results"
  - "SearchEvent model for unified search event results"
affects: [mobile-discover, mobile-search, between-show-retention]

tech-stack:
  added: []
  patterns: [manual-riverpod-providers-for-trending, unified-search-single-api-call]

key-files:
  created:
    - mobile/lib/src/features/trending/data/trending_repository.dart
    - mobile/lib/src/features/trending/presentation/providers/trending_providers.dart
    - mobile/lib/src/features/trending/presentation/trending_feed_screen.dart
  modified:
    - mobile/lib/src/features/discover/presentation/discover_screen.dart
    - mobile/lib/src/features/search/data/search_providers.dart
    - mobile/lib/src/features/search/presentation/search_screen.dart

key-decisions:
  - "Manual Riverpod providers for trending feature (not @riverpod codegen) consistent with Phase 10 event_providers pattern"
  - "Unified search replaces separate band/venue API calls with single GET /api/search call"
  - "SearchEvent lightweight model instead of reusing DiscoverEvent for search results"

patterns-established:
  - "Trending feature uses manual providers with DioClient pattern matching rsvp_repository"
  - "Search providers switched from multi-call to single unified endpoint pattern"

requirements-completed: [EVENT-03, EVENT-04, SCALE-01]

duration: 7min
completed: 2026-02-28
---

# Phase 11 Plan 05: Trending Feed & Search Upgrade Summary

**Trending Shows Near You horizontal feed on Discover screen + unified search with categorized bands/venues/events results**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-28T15:46:35Z
- **Completed:** 2026-02-28T15:53:46Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- TrendingFeedSection renders at top of Discover screen with horizontal scrollable cards showing event name, venue, date, RSVP count, friend signals, and distance
- Search screen upgraded from separate band/venue calls to single unified GET /api/search endpoint returning categorized results
- Events section added to search results with filter chip, navigation to event detail, and "See all" overflow

## Task Commits

Each task was committed atomically:

1. **Task 1: Build trending feed feature** - `32f6c1a` (feat)
2. **Task 2: Upgrade search to unified endpoint** - `60c3869` (feat)

## Files Created/Modified
- `mobile/lib/src/features/trending/data/trending_repository.dart` - TrendingEvent model + TrendingRepository API client for GET /api/trending
- `mobile/lib/src/features/trending/presentation/providers/trending_providers.dart` - Manual Riverpod providers (trendingRepositoryProvider, trendingFeedProvider)
- `mobile/lib/src/features/trending/presentation/trending_feed_screen.dart` - TrendingFeedSection widget with horizontal card list
- `mobile/lib/src/features/discover/presentation/discover_screen.dart` - Added TrendingFeedSection as first section in trending content
- `mobile/lib/src/features/search/data/search_providers.dart` - Unified search provider calling GET /api/search, SearchResults with events, SearchEvent model
- `mobile/lib/src/features/search/presentation/search_screen.dart` - Categorized results display with Bands/Venues/Events sections and Events filter chip

## Decisions Made
- Used manual Riverpod providers (not @riverpod codegen) for trending feature, consistent with Phase 10 decision for event_providers.dart
- Replaced separate band/venue search API calls with a single unified GET /api/search call that returns all categories in one response
- Created lightweight SearchEvent model instead of reusing DiscoverEvent, since the unified search response has a different shape (flat fields vs nested venue object)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused discovery_models import**
- **Found during:** Task 2 (flutter analyze)
- **Issue:** search_providers.dart imported discovery_models.dart but used SearchEvent model instead
- **Fix:** Removed unused import
- **Files modified:** mobile/lib/src/features/search/data/search_providers.dart
- **Verification:** flutter analyze passes with 27 issues (all pre-existing)
- **Committed in:** 60c3869 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor cleanup, no scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Trending feed and unified search complete, ready for Plan 06 (notification triggers)
- Both features depend on backend endpoints from Plans 02-03 being deployed
- No blockers for next phase

---
*Phase: 11-platform-trust-between-show-retention*
*Completed: 2026-02-28*
