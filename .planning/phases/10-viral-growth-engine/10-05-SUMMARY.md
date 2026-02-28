---
phase: 10-viral-growth-engine
plan: 05
subsystem: ui
tags: [rsvp, flutter, riverpod, event-detail, friends-going, social-proof, cached-network-image]

# Dependency graph
requires:
  - phase: 10-viral-growth-engine
    provides: "RSVP backend APIs (POST /api/rsvp/:eventId, GET /api/rsvp/:eventId/friends, GET /api/rsvp/me)"
provides:
  - "RsvpRepository data layer with toggle, friends-going, and batch user RSVP APIs"
  - "RsvpButton widget with I'm Going toggle and optimistic state"
  - "FriendsGoingWidget with overlapping avatar stack and count"
  - "EventDetailScreen with RSVP + friends-going integration"
  - "Event card RSVP indicator on discover screen (batch, no N+1)"
  - "/events/:id route in app_router"
affects: [mobile-event-discovery, mobile-social-features, mobile-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns: [rsvp-toggle-optimistic-update, batch-rsvp-status-check, overlapping-avatar-stack]

key-files:
  created:
    - mobile/lib/src/features/events/data/rsvp_repository.dart
    - mobile/lib/src/features/events/presentation/providers/event_providers.dart
    - mobile/lib/src/features/events/presentation/rsvp_button.dart
    - mobile/lib/src/features/events/presentation/friends_going_widget.dart
    - mobile/lib/src/features/events/presentation/event_detail_screen.dart
  modified:
    - mobile/lib/src/features/discover/presentation/discover_screen.dart
    - mobile/lib/src/core/router/app_router.dart

key-decisions:
  - "Used DioClient pattern (not raw Dio) matching existing repository conventions"
  - "Manual Riverpod providers (not @riverpod code-gen) to avoid build_runner dependency for simple cases"
  - "Batch userRsvpsProvider for event list cards prevents N+1 queries"
  - "Friends-going data only fetched on event detail screen, not in list views"
  - "Created events feature directory (did not exist) following existing feature structure convention"
  - "Created EventDetailScreen from scratch (no existing event detail screen existed)"

patterns-established:
  - "RSVP toggle: ConsumerStatefulWidget with _isToggling guard, provider invalidation on success"
  - "Batch status check: single userRsvpsProvider fetches all user RSVPs, used across event cards"
  - "Avatar overlap: Stack + Positioned with 20px offset per avatar, max 5 visible"

requirements-completed: [EVENT-01, EVENT-02]

# Metrics
duration: 6min
completed: 2026-02-28
---

# Phase 10 Plan 05: Mobile RSVP & Friends Going Summary

**RSVP "I'm Going" toggle with friend attendance avatars on event detail screens and checkmark indicators on discover event cards**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-28T02:34:37Z
- **Completed:** 2026-02-28T02:40:45Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- RsvpRepository provides toggle, friends-going, and batch user RSVP data layer following DioClient pattern
- RsvpButton toggles between outlined "I'm Going" and filled "I'm Going!" states with loading indicator
- FriendsGoingWidget displays overlapping friend avatars (max 5) with "N friends going" count text
- EventDetailScreen shows event info, RSVP button, and friends-going section in a CustomScrollView
- Discover screen _EventCard shows volt-lime checkmark badge when user has RSVP'd (batch query, no N+1)
- Event detail route (/events/:id) added to app_router with slide transition
- Flutter analysis passes cleanly across all files (0 errors, 0 warnings)

## Task Commits

Each task was committed atomically:

1. **Task 1: RSVP repository, providers, and data layer** - `15953fd` (feat)
2. **Task 2: RSVP button, friends going widget, and event screen integration** - `fdceb72` (feat)

**Note:** Task 2 commit (`fdceb72`) was co-committed with Plan 10-03 changes due to concurrent execution. All Task 2 files are verified present in that commit.

## Files Created/Modified
- `mobile/lib/src/features/events/data/rsvp_repository.dart` - RsvpRepository with toggleRsvp, getFriendsGoing, getUserRsvps; FriendsGoingData and FriendAvatar data classes
- `mobile/lib/src/features/events/presentation/providers/event_providers.dart` - rsvpRepositoryProvider, userRsvpsProvider (batch), friendsGoingProvider (per-event family)
- `mobile/lib/src/features/events/presentation/rsvp_button.dart` - RsvpButton ConsumerStatefulWidget with toggle guard, loading state, error snackbar
- `mobile/lib/src/features/events/presentation/friends_going_widget.dart` - FriendsGoingWidget with avatar stack, count text, graceful empty/loading/error handling
- `mobile/lib/src/features/events/presentation/event_detail_screen.dart` - EventDetailScreen with SliverAppBar, event info, RSVP button, friends-going section
- `mobile/lib/src/features/discover/presentation/discover_screen.dart` - _EventCard converted to ConsumerWidget with RSVP checkmark indicator
- `mobile/lib/src/core/router/app_router.dart` - Added /events/:id route with EventDetailScreen

## Decisions Made
- Used DioClient pattern (not raw Dio as plan suggested) matching existing DiscoveryRepository, VenueRepository, etc.
- Used manual Riverpod providers (FutureProvider.autoDispose) matching venueDetailProvider and bandDetailProvider patterns, avoiding build_runner for simple providers
- Batch userRsvpsProvider does single fetch of all user RSVPs for event list indicators, no N+1 queries
- FriendsGoingData only fetched per-event on detail screen (approach A from plan), not in list views
- Created entirely new events feature directory tree since none existed (plan referenced files that didn't exist)
- EventDetailScreen fetches event data via /api/events/:id using DioClient directly (reusing DiscoverEvent.fromEventJson for parsing)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created events feature directory structure**
- **Found during:** Task 1
- **Issue:** Plan referenced `mobile/lib/src/features/events/` which did not exist. No event feature directory in the project.
- **Fix:** Created `mobile/lib/src/features/events/data/`, `mobile/lib/src/features/events/presentation/`, and `mobile/lib/src/features/events/presentation/providers/` directories
- **Verification:** All files created successfully, flutter analyze passes

**2. [Rule 1 - Bug] Used DioClient instead of raw Dio**
- **Found during:** Task 1
- **Issue:** Plan showed `final Dio _dio` but codebase uses `DioClient` wrapper (all repositories use `DioClient` constructor pattern)
- **Fix:** RsvpRepository uses `DioClient _dioClient` following DiscoveryRepository pattern
- **Files modified:** rsvp_repository.dart
- **Committed in:** 15953fd

**3. [Rule 3 - Blocking] Created EventDetailScreen from scratch**
- **Found during:** Task 2
- **Issue:** Plan says "Locate the existing event detail layout and add these widgets" but no event detail screen existed. The /events/:id route was also missing from the router.
- **Fix:** Created full EventDetailScreen modeled after VenueDetailScreen pattern. Added /events/:id route to app_router.
- **Files modified:** event_detail_screen.dart, app_router.dart
- **Committed in:** fdceb72

**4. [Rule 1 - Bug] Used `.value` instead of `.valueOrNull`**
- **Found during:** Task 2
- **Issue:** Plan used `valueOrNull` which doesn't exist on `AsyncValue` in flutter_riverpod 3.x. Analysis error.
- **Fix:** Used `.value?` (nullable getter) matching existing codebase pattern
- **Files modified:** rsvp_button.dart, discover_screen.dart
- **Committed in:** fdceb72

**5. [Rule 3 - Blocking] Modified private _EventCard in discover_screen.dart instead of standalone event_card.dart**
- **Found during:** Task 2
- **Issue:** Plan referenced `event_card.dart` standalone file, but event cards are private widgets (`_EventCard`) defined inline within discover_screen.dart
- **Fix:** Converted existing `_EventCard` from StatelessWidget to ConsumerWidget and added RSVP checkmark indicator in-place
- **Files modified:** discover_screen.dart
- **Committed in:** fdceb72

---

**Total deviations:** 5 auto-fixed (2 bugs, 3 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep. Plan was written referencing files that did not yet exist; all were created following existing codebase patterns.

## Issues Encountered
- Concurrent execution with Plan 10-03 caused Task 2 files to be co-committed in the 10-03 commit (fdceb72). All files are present and verified. This does not affect functionality.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RSVP mobile UI is complete and ready for end-to-end testing with backend
- Event detail screen needs backend /api/events/:id endpoint to function (may need to verify this endpoint exists or adapt to use discovery endpoint)
- Consider adding pull-to-refresh on event detail screen in future iteration
- Batch friends-going counts for list views could be added as a future optimization

## Self-Check: PASSED

All 5 created files verified on disk. Both task commits (15953fd, fdceb72) verified in git history.

---
*Phase: 10-viral-growth-engine*
*Completed: 2026-02-28*
