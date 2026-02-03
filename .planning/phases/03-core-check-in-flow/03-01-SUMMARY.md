---
phase: 03-core-check-in-flow
plan: 01
subsystem: api
tags: [checkin, haversine, timezone, ratings, geolocation, express]

# Dependency graph
requires:
  - phase: 01-data-model-foundation
    provides: checkins table with event_id, venue_rating, is_verified columns; checkin_band_ratings table
  - phase: 02-event-data-pipeline
    provides: events table with lineup, venues with timezone/coordinates, promoteIfVerified method
provides:
  - Event-first check-in creation via createEventCheckin (requires eventId)
  - Location verification using Haversine with venue-type radius thresholds
  - Time window validation using venue timezone
  - Per-set band ratings via PATCH /api/checkins/:id/ratings
  - Nearby events endpoint GET /api/events/nearby with distance sorting
  - Backward-compatible POST /api/checkins accepting both eventId and bandId+venueId
  - Duplicate check-in enforcement returning 409
affects: [03-02-PLAN (photo upload), 03-03-PLAN (mobile flow), 04-gamification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Haversine distance in JS (private helper) matching VenueService SQL pattern"
    - "Venue-timezone time window validation using toLocaleString"
    - "Error statusCode propagation from service to controller for 409/404"
    - "Venue-type-specific radius thresholds for location verification"

key-files:
  created: []
  modified:
    - backend/src/services/CheckinService.ts
    - backend/src/services/EventService.ts
    - backend/src/controllers/CheckinController.ts
    - backend/src/controllers/EventController.ts
    - backend/src/routes/checkinRoutes.ts
    - backend/src/routes/eventRoutes.ts

key-decisions:
  - "Location verification is non-blocking: returns boolean, never throws, check-in succeeds even without verification"
  - "Time window validation is permissive on error: catches exceptions and allows check-in rather than blocking"
  - "Rating starts at 0 for event-first check-ins, set later via PATCH /ratings (two-step UX)"
  - "Headliner band_id populated from event_lineup for backward compat with old mobile clients"
  - "Legacy createCheckin delegates to createEventCheckin when eventId present in request body"

patterns-established:
  - "statusCode property on Error objects for HTTP status propagation from service to controller"
  - "Dual-format endpoint: single POST handler detects request format and branches"
  - "Venue-type radius map for location verification thresholds"

# Metrics
duration: 5min
completed: 2026-02-03
---

# Phase 3 Plan 1: Event-First Check-in API Summary

**Event-first check-in with Haversine location verify, venue-timezone time windows, per-set band ratings via PATCH, and nearby events endpoint**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-03T02:02:07Z
- **Completed:** 2026-02-03T02:07:22Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Event-first check-in creation requiring eventId with location verification and time window validation
- Per-set band ratings and venue rating via PATCH /api/checkins/:id/ratings with 0.5 step validation
- Nearby events endpoint GET /api/events/nearby using Haversine distance subquery
- Backward-compatible POST /api/checkins supporting both new (eventId) and legacy (bandId+venueId) formats
- Duplicate check-in enforcement via unique constraint returning 409 status

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite CheckinService with event-first creation, location verification, and time window validation** - `7cc257c` (feat)
2. **Task 2: Update CheckinController, EventController, and routes for new endpoints** - `0274ee5` (feat)

## Files Created/Modified
- `backend/src/services/CheckinService.ts` - Added createEventCheckin, addRatings, verifyLocation, isWithinTimeWindow, validateRating helpers
- `backend/src/services/EventService.ts` - Added getNearbyEvents with Haversine distance subquery
- `backend/src/controllers/CheckinController.ts` - Dual-format createCheckin, updateRatings handler, 409/404 status propagation
- `backend/src/controllers/EventController.ts` - getNearbyEvents handler with lat/lng validation
- `backend/src/routes/checkinRoutes.ts` - Added PATCH /:id/ratings route
- `backend/src/routes/eventRoutes.ts` - Added GET /nearby route before /:id

## Decisions Made
- Location verification is non-blocking: returns boolean, never throws -- check-in succeeds even without GPS
- Time window validation is permissive on error: catches and allows rather than blocking users
- Rating starts at 0 for event-first check-ins, set later via PATCH /ratings (supports two-step check-in UX)
- Headliner band_id populated from event_lineup ORDER BY is_headliner DESC for backward compat
- Legacy createCheckin delegates to createEventCheckin when eventId is present (single entry point)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Check-in API foundation is complete for mobile quick-tap flow
- PATCH /ratings endpoint ready for post-check-in rating UX
- GET /events/nearby ready for event discovery screen
- Photo upload and mobile flow (Plans 02 and 03) can build on these endpoints

---
*Phase: 03-core-check-in-flow*
*Completed: 2026-02-03*
