---
phase: 03-core-check-in-flow
plan: 02
subsystem: ui
tags: [flutter, checkin, gps, geolocation, rating, flutter_rating_bar, riverpod, freezed]

# Dependency graph
requires:
  - phase: 03-core-check-in-flow
    provides: Event-first check-in API (POST /api/checkins with eventId), nearby events endpoint (GET /api/events/nearby), ratings endpoint (PATCH /api/checkins/:id/ratings)
provides:
  - Event-first check-in screen with GPS auto-suggest nearby events
  - Single-tap check-in on event card (creates event-based check-in)
  - Per-set band rating bottom sheet with half-star increments via flutter_rating_bar
  - Venue rating bottom sheet with half-star increments
  - NearbyEvent domain model with venue, band, lineup, distanceKm
  - CheckInRepository methods for getNearbyEvents, createEventCheckIn, submitRatings
  - Riverpod providers for nearbyEvents, createEventCheckIn, submitRatings
  - Manual check-in fallback (old band+venue search flow)
affects: [03-03-PLAN (photo upload enrichment card), 04-gamification (check-in triggers), 05-social-feed (feed refresh after check-in)]

# Tech tracking
tech-stack:
  added: [flutter_rating_bar ^4.0.1]
  patterns:
    - "Event-first screen with 3-state enum (_ScreenState.events/success/manual)"
    - "GPS position caching in initState for reuse during check-in submission"
    - "Enrichment card pattern: optional post-check-in actions with completion checkmarks"
    - "Two-tab rating bottom sheet with DraggableScrollableSheet and partial submission"

key-files:
  created:
    - mobile/lib/src/features/checkins/presentation/rating_bottom_sheet.dart
    - mobile/lib/src/features/checkins/domain/nearby_event.dart
  modified:
    - mobile/lib/src/features/checkins/presentation/checkin_screen.dart
    - mobile/lib/src/features/checkins/data/checkin_repository.dart
    - mobile/lib/src/features/checkins/presentation/providers/checkin_providers.dart
    - mobile/lib/src/features/checkins/domain/checkin.dart
    - mobile/lib/src/core/api/api_config.dart
    - mobile/pubspec.yaml

key-decisions:
  - "Event-first check-in screen defaults to GPS auto-suggest; manual check-in is fallback via small text link"
  - "Rating bottom sheet uses two tabs (bands/venue) with partial submission allowed (rate some bands, skip others)"
  - "CreateCheckInRequest fields now all optional to support both event-first (eventId) and legacy (bandId+venueId) flows"
  - "Duplicate check-in error (409) detected via error message string matching and shown as warning snackbar"

patterns-established:
  - "3-state screen pattern: enum-based state machine (events/success/manual) with switch expression in build()"
  - "Enrichment card widget: icon + label + completion checkmark for optional post-action items"
  - "Event card widget: distance badge, lineup chips, check-in count, full-width action button"

# Metrics
duration: 16min
completed: 2026-02-03
---

# Phase 3 Plan 2: Mobile Check-in Flow Summary

**Event-first quick-tap check-in screen with GPS auto-suggest, per-set band ratings and venue rating via flutter_rating_bar half-star increments, and manual check-in fallback**

## Performance

- **Duration:** 16 min
- **Started:** 2026-02-03T02:11:57Z
- **Completed:** 2026-02-03T02:28:20Z
- **Tasks:** 2 (+ 1 checkpoint)
- **Files modified:** 9

## Accomplishments
- Redesigned check-in screen from band-search-first to event-first quick-tap flow with GPS auto-suggest
- Single tap "CHECK IN" on event card creates check-in with location verification
- Post-check-in success state with enrichment options (rate bands, rate venue, add photos placeholder)
- Rating bottom sheet with per-set band ratings and venue rating using half-star increments (0.5-5.0)
- NearbyEvent domain model with venue, band, lineup, distance, and check-in count
- Three new repository methods: getNearbyEvents, createEventCheckIn, submitRatings
- Three new Riverpod providers wiring GPS -> nearby events -> check-in -> ratings
- Backward-compatible manual check-in flow accessible as fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Add flutter_rating_bar, create NearbyEvent model, update repository and providers** - `5cc30eb` (feat)
2. **Task 2: Rewrite checkin_screen.dart and create rating_bottom_sheet.dart** - `b5eda35` (feat)

## Files Created/Modified
- `mobile/lib/src/features/checkins/domain/nearby_event.dart` - NearbyEvent, NearbyEventVenue, NearbyEventBand, NearbyEventLineup freezed models
- `mobile/lib/src/features/checkins/presentation/rating_bottom_sheet.dart` - Two-tab rating bottom sheet (bands + venue) with flutter_rating_bar
- `mobile/lib/src/features/checkins/presentation/checkin_screen.dart` - Full rewrite: event-first flow with 3 states (events/success/manual)
- `mobile/lib/src/features/checkins/data/checkin_repository.dart` - Added getNearbyEvents, createEventCheckIn, submitRatings methods
- `mobile/lib/src/features/checkins/presentation/providers/checkin_providers.dart` - Added nearbyEventsProvider, createEventCheckInProvider, submitRatingsProvider
- `mobile/lib/src/features/checkins/domain/checkin.dart` - Made CreateCheckInRequest fields optional, added eventId/locationLat/locationLon, added CheckInBandRating and isVerified
- `mobile/lib/src/core/api/api_config.dart` - Added events and nearbyEvents endpoint constants
- `mobile/pubspec.yaml` - Added flutter_rating_bar ^4.0.1

## Decisions Made
- Event-first check-in screen defaults to GPS auto-suggest; manual check-in is a fallback via "Can't find your show?" text link at bottom
- Rating bottom sheet uses two tabs (Rate Bands / Rate Venue) with partial submission -- user can rate some bands and skip others
- CreateCheckInRequest fields now all optional to support both event-first (eventId only) and legacy (bandId + venueId) flows without breaking existing code
- Duplicate check-in error (409) detected via error message string matching and shown as user-friendly warning snackbar rather than a crash

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Check-in screen ready for end-to-end testing with backend
- "Add photos" enrichment card is a placeholder (links to 03-03 photo upload)
- Rating submission wired to PATCH /api/checkins/:id/ratings from 03-01
- Manual check-in fallback preserves backward compatibility for users without nearby events

---
*Phase: 03-core-check-in-flow*
*Completed: 2026-02-03*
