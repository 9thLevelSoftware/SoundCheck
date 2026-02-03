---
phase: 02-event-data-pipeline
plan: 03
subsystem: user-events-merge-lookup
tags: [user-events, auto-merge, organic-verification, on-demand-lookup, band-matching, source-tracking]
dependency-graph:
  requires: [02-01, 02-02]
  provides: [user-event-creation, auto-merge-logic, organic-verification, on-demand-lookup, source-status-api]
  affects: [03-checkin-experience]
tech-stack:
  added: []
  patterns: [auto-merge-on-sync, organic-verification, on-demand-ingestion, band-name-resolution]
key-files:
  created: []
  modified:
    - backend/src/services/EventService.ts
    - backend/src/services/EventSyncService.ts
    - backend/src/controllers/EventController.ts
    - backend/src/routes/eventRoutes.ts
    - backend/src/types/index.ts
decisions:
  - id: 02-03-01
    decision: "User-created events set source='user_created' and is_verified=false automatically when createdByUserId is present"
    rationale: "Automatic source detection reduces API surface complexity while ensuring all user events are properly tracked"
  - id: 02-03-02
    decision: "Auto-merge in EventSyncService runs before standard upsert to prevent duplicate events"
    rationale: "Merge-first ordering ensures user-created events are enriched by Ticketmaster data rather than duplicated"
  - id: 02-03-03
    decision: "On-demand lookup creates a new TicketmasterAdapter per request rather than sharing the controller instance"
    rationale: "The adapter constructor validates API key and daily quota; fresh instance isolates lookup quota tracking from sync pipeline"
metrics:
  duration: 5 min
  completed: 2026-02-03
---

# Phase 2 Plan 3: User Event Enrichment, Auto-Merge, and On-Demand Lookup Summary

User-created events tracked with source='user_created' and is_verified=false, auto-merged with Ticketmaster data on sync (venue+date match), organically verified via promoteIfVerified() when 2+ unique users check in, and on-demand Ticketmaster lookup available at GET /api/events/lookup/:ticketmasterId for events outside synced coverage.

## What Was Done

### Task 1: EventService Source Tracking, Auto-Merge, and Organic Verification

- **Types**: Added `status?: string` to Event interface, created `CreateUserEventRequest` interface with lineup supporting `bandId` or `bandName`
- **Source tracking**: `createEvent()` auto-sets `source='user_created'` and `is_verified=false` when `createdByUserId` is provided and no explicit source is passed. Added `source` parameter to `CreateEventRequest`.
- **API responses**: `mapDbEventToEvent()` now includes `status` (defaulting to 'active') alongside existing `source` field in all event responses
- **findUserCreatedEventAtVenueDate()**: Looks up user-created events by venue_id + event_date where external_id IS NULL -- used by sync pipeline for auto-merge candidate detection
- **mergeTicketmasterIntoUserEvent()**: Enriches a user-created event with Ticketmaster data (external_id, event_name, ticket_url, prices, status), promotes source to 'ticketmaster' and is_verified to true
- **promoteIfVerified()**: Organic verification for PIPE-06 -- promotes user-created events to is_verified=true when 2+ unique users have checked in. Idempotent (no-op once verified). Called by CheckinService in Phase 3
- **EventSyncService auto-merge**: Added Step 3 in `processEvent()` that calls `findUserCreatedEventAtVenueDate()` before the standard upsert. When a match is found, calls `mergeTicketmasterIntoUserEvent()` and upserts lineup, then skips standard upsert

### Task 2: On-Demand Lookup Endpoint and Enhanced Event Creation

- **lookupEvent handler**: `GET /api/events/lookup/:ticketmasterId` -- creates TicketmasterAdapter, calls `getEventById()`, then `eventSyncService.ingestSingleEvent()` to normalize/match/upsert. Returns 503 if API key not configured, 404 if TM event not found, 422 if missing venue data
- **Enhanced createEvent**: Lineup entries now accept `bandName` string (resolved via `BandMatcher.matchOrCreateBand()`) in addition to `bandId`. Validation: venueId required, eventDate must be valid, at least one band required
- **Route ordering**: `/lookup/:ticketmasterId` placed before `/:id` in eventRoutes.ts to prevent Express param conflict. Route order: /upcoming, /trending, /lookup/:ticketmasterId, POST /, /:id, DELETE /:id

## Decisions Made

1. **Automatic source detection**: When `createdByUserId` is provided and no explicit `source` is passed, the event source is automatically set to `'user_created'`. This simplifies the API -- callers don't need to know about source tracking.

2. **Merge-before-upsert ordering**: The auto-merge check runs before the standard Ticketmaster upsert in EventSyncService. This ensures user-created events are enriched first, avoiding any window where a duplicate could exist.

3. **Fresh TicketmasterAdapter per lookup request**: The `lookupEvent` handler creates a new adapter instance rather than storing one on the controller. This cleanly handles the case where the API key is not set at startup but added later.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `npm run build`: Zero TypeScript errors
- Event interface in types/index.ts: `source: string` (line 206), `status?: string` (line 207)
- Source tracking: `source = 'user_created'` set in EventService.createEvent() when createdByUserId present
- Auto-merge: `findUserCreatedEventAtVenueDate()` called in EventSyncService.processEvent() before standard upsert
- Organic verification: `promoteIfVerified()` method exists with 2+ unique user check-in threshold
- On-demand lookup: `lookupEvent` handler exists, calls `ingestSingleEvent()`
- Band name resolution: `BandMatcher.matchOrCreateBand(bandName)` called in createEvent for lineup entries
- Route order: /upcoming, /trending, /lookup/:ticketmasterId, POST /, /:id, DELETE /:id

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | a516264 | feat(02-03): enhance EventService with user event source tracking and auto-merge logic |
| 2 | 4593af1 | feat(02-03): add on-demand Ticketmaster lookup endpoint and enhanced event creation |

## PIPE Requirements Coverage (Phase 2 Complete)

All 8 PIPE requirements addressed across Phase 2:

| PIPE | Requirement | Plan | Status |
|------|-------------|------|--------|
| PIPE-01 | Ticketmaster adapter | 02-01 | Done |
| PIPE-02 | BullMQ sync schedule | 02-02 | Done |
| PIPE-03 | Event deduplication | 02-02 | Done |
| PIPE-04 | Band name matching | 02-01 | Done |
| PIPE-05 | User-created events | 02-03 | Done |
| PIPE-06 | Unverified -> verified (auto-merge + organic check-in promotion) | 02-03 | Done |
| PIPE-07 | Cancel/reschedule detection | 02-02 | Done |
| PIPE-08 | API rate limits | 02-01 | Done |

## Next Phase Readiness

Phase 3 (Check-in Experience) can now proceed. It has:
- EventService with `promoteIfVerified()` ready for CheckinService to call after each check-in
- Complete event data pipeline: Ticketmaster sync, user-created events, auto-merge, on-demand lookup
- All event API responses include `source` and `status` for frontend display
- CreateUserEventRequest type ready for mobile app integration
