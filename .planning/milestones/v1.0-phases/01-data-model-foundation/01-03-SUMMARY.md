---
phase: 01-data-model-foundation
plan: 03
subsystem: api
tags: [event-service, checkin-service, notification-service, dual-write, events-table, event-lineup, backward-compat]

# Dependency graph
requires:
  - phase: 01-data-model-foundation plan 01
    provides: events table, event_lineup table, checkin_band_ratings table, checkins expanded with event_id/venue_rating/review_text/image_urls
  - phase: 01-data-model-foundation plan 02
    provides: dual-path trigger function, data migration from shows to events, checkins backfill
provides:
  - EventService querying events+event_lineup (not shows)
  - EventService.findOrCreateEvent helper for dual-write
  - CheckinService dual-write to both old and new columns
  - CheckinService writing to checkin_band_ratings for per-band ratings
  - NotificationService resolving show data through events table
  - Event and EventLineupEntry TypeScript interfaces
  - Backward-compatible API response shape (bandId, band, showDate aliases)
affects:
  - 02-event-discovery (EventService is the foundation for all event queries)
  - 03-checkin-flow (CheckinService dual-write is the bridge during migration)
  - 04-gamification (badge evaluation may reference event data)
  - 05-social (notifications use events table for show-related data)

# Tech tracking
tech-stack:
  added: []
  patterns: [dual-write service pattern for expand-contract migration, findOrCreateEvent for implicit event creation, batch lineup fetch for list queries, backward-compat response aliases]

key-files:
  created: []
  modified:
    - backend/src/services/EventService.ts
    - backend/src/services/CheckinService.ts
    - backend/src/services/NotificationService.ts
    - backend/src/controllers/EventController.ts
    - backend/src/types/index.ts

key-decisions:
  - "NotificationService writes only event_id (not show_id) because production notifications table was created by migration 007 without show_id column"
  - "CheckinService dual-write treats event creation failure as non-fatal: checkin is created without event_id if findOrCreateEvent fails"
  - "findOrCreateEvent adds band to existing venue+date event lineup rather than creating duplicate events"
  - "Backward-compat fields (bandId, band, showDate) populated from headliner in lineup"

patterns-established:
  - "Dual-write checkin: INSERT populates both old columns (band_id, venue_id, rating, comment, photo_url, event_date) and new columns (event_id, venue_rating, review_text, image_urls, is_verified)"
  - "findOrCreateEvent pattern: look up by venue+band+date, then venue+date, then create new -- prevents duplicate events during checkin flow"
  - "Batch lineup fetch: list queries fetch all event lineups in single query using ANY($1) then group by event_id in-memory"
  - "Notification event resolution: LEFT JOIN events ev ON n.event_id = ev.id with event_lineup headliner join for band data"

# Metrics
duration: 6min
completed: 2026-02-02
---

# Phase 1 Plan 3: Service Layer Migration (EventService, CheckinService, NotificationService) Summary

**EventService rewritten to query events+event_lineup, CheckinService dual-write with checkin_band_ratings, NotificationService resolving through events table**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-02T23:50:57Z
- **Completed:** 2026-02-02T23:57:10Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Rewrote EventService to query `events` + `event_lineup` tables instead of `shows` -- all 7 public methods (createEvent, getEventById, getEventsByVenue, getEventsByBand, getUpcomingEvents, getTrendingEvents, deleteEvent) now use the new schema
- Added `findOrCreateEvent()` helper that intelligently finds existing events at venue+date or creates new ones with lineup entries, used by CheckinService for dual-write
- Updated CheckinService.createCheckin() to dual-write: populates both old columns (band_id, venue_id, rating, comment, photo_url, event_date) AND new columns (event_id, venue_rating, review_text, image_urls, is_verified) in a single INSERT
- Added checkin_band_ratings write to createCheckin for per-band rating tracking in multi-band events
- Migrated NotificationService from shows table to events table: JOINs events + event_lineup for headliner band data
- Added Event and EventLineupEntry interfaces to types/index.ts with full type safety
- Maintained backward-compatible API response shape with bandId, band, and showDate aliases

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite EventService to use events + event_lineup tables** - `f752577` (feat)
2. **Task 2: Update CheckinService for dual-write and NotificationService for events** - `ff4f6f7` (feat)

## Files Modified

- `backend/src/services/EventService.ts` - Complete rewrite: queries events+event_lineup, findOrCreateEvent helper, batch lineup fetch, backward-compat fields (515 lines)
- `backend/src/services/CheckinService.ts` - Dual-write createCheckin, EventService integration, checkin_band_ratings write, event data in getCheckinById (752 lines)
- `backend/src/services/NotificationService.ts` - Events-based resolution, event_lineup headliner join, eventId in CreateNotificationData (436 lines)
- `backend/src/controllers/EventController.ts` - Optional lineup array parameter in createEvent handler (228 lines)
- `backend/src/types/index.ts` - Event, EventLineupEntry interfaces with backward-compat fields (299 lines)

## Decisions Made

1. **NotificationService writes only event_id**: The production notifications table was created by migration 007 from scratch, which did not include a `show_id` column. The `INSERT INTO notifications` now only writes `event_id`. If callers pass `showId` (backward compat), it is resolved to `event_id` since they are equivalent UUIDs after migration 010.

2. **Non-fatal event creation in CheckinService**: If `findOrCreateEvent()` fails (e.g., FK constraint, race condition), the checkin is still created without `event_id` populated. This prevents event creation issues from blocking the core checkin flow. The `event_id` can be backfilled later.

3. **findOrCreateEvent adds to existing event lineup**: When a checkin comes in for a venue+date that already has an event but the specific band is not in the lineup, the band is added to that event's lineup rather than creating a new event. This correctly handles multi-band shows.

4. **Backward-compat response fields from headliner**: The mobile app expects `bandId`, `band`, and `showDate` on event responses. These are populated from the first headliner in the lineup (or the first band if no headliner is flagged). This ensures zero changes needed in the Flutter app.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all files compiled cleanly and verification checks passed on first attempt.

## User Setup Required

None - no external service configuration required. All changes are code-only service layer updates.

## Next Phase Readiness

- Phase 1 (Data Model Foundation) is now COMPLETE: schema expanded (01-01), data migrated (01-02), service layer migrated (01-03)
- The shows table is now effectively read-only: nothing in the service layer writes to it
- All API endpoint paths and HTTP methods unchanged -- mobile app continues to work
- Dual-write ensures both old and new columns are populated during the transition period
- The old columns (band_id, venue_id, rating on checkins, shows table) can be safely removed in a future contract phase once all consumers (including mobile app) are verified
- Key concern: The checkin_band_ratings write uses ON CONFLICT DO NOTHING, so duplicate ratings are harmless but won't update if the user somehow re-rates

---
*Phase: 01-data-model-foundation*
*Completed: 2026-02-02*
