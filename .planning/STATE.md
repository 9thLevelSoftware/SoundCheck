# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-02)

**Core value:** The live check-in moment: check in fast, rate the experience, share with friends -- feeding discovery, gamification, and concert identity.
**Current focus:** Phase 3: Core Check-in Flow (in progress)

## Current Position

Phase: 3 of 8 (Core Check-in Flow)
Plan: 2 of 3 in Phase 3 (awaiting checkpoint verification)
Status: In progress -- 03-02 paused at checkpoint (human-verify), 03-03 also awaiting checkpoint
Last activity: 2026-02-03 -- 03-02 Tasks 1-2 complete, awaiting event-first check-in verification

Progress: [#######_______________] 32% (7/22 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 5.3 min
- Total execution time: 0.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-data-model-foundation | 3/3 | 18 min | 6 min |
| 02-event-data-pipeline | 3/3 | 13 min | 4.3 min |
| 03-core-check-in-flow | 1/3 | 5 min | 5 min |

**Recent Trend:**
- Last 5 plans: 4m, 4m, 5m, 5m
- Trend: stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Init]: Rebuild on existing stack (Flutter + Node/Express + PostgreSQL), not rewrite
- [Init]: Events as first-class entities with multi-band lineups (the core structural change)
- [Init]: Dual ratings (band performance + venue experience) scored independently
- [Init]: Ticketmaster Discovery API as primary event source (Songkick is dead)
- [Init]: BullMQ for async job processing (badge eval, event sync)
- [01-01]: Used conditional DDL in migrations to handle both fresh and pre-migrated database states
- [01-01]: Created full notifications table in migration 007 (was missing from DB entirely)
- [01-01]: Preserved old migration scripts as migrate:legacy and migrate:events-legacy
- [01-02]: Conditional column checks in data migrations to handle production DB without legacy checkin columns
- [01-02]: Dual-path trigger function unions both legacy and new-style data paths for stats computation
- [01-02]: Data migration down() functions are no-ops (original data preserved by expand phase)
- [01-03]: NotificationService writes only event_id (production table has no show_id column)
- [01-03]: CheckinService dual-write treats event creation failure as non-fatal
- [01-03]: findOrCreateEvent adds band to existing venue+date event lineup rather than creating duplicates
- [01-03]: Backward-compat response fields (bandId, band, showDate) populated from headliner in lineup
- [02-01]: Partial unique index (WHERE external_id IS NOT NULL) on venues and bands for source+external_id dedup
- [02-01]: In-memory daily API call counter with midnight UTC reset for Ticketmaster quota tracking
- [02-01]: 200ms inter-request delay for Ticketmaster per-second rate limiting (BullMQ limiter for job-level in 02-02)
- [02-02]: EventSyncService uses graceful constructor flag (apiKeyConfigured) instead of throwing when TM key is missing
- [02-02]: BullMQ queue exports null when REDIS_URL unavailable; all consumers guard against null
- [02-03]: User-created events auto-set source='user_created' and is_verified=false when createdByUserId present
- [02-03]: Auto-merge runs before standard upsert in sync pipeline to prevent user-event duplication
- [02-03]: On-demand lookup creates fresh TicketmasterAdapter per request for clean API key validation
- [03-01]: Location verification is non-blocking (returns boolean, never throws)
- [03-01]: Time window validation is permissive on error (allows check-in rather than blocking)
- [03-01]: Rating starts at 0 for event-first check-ins, set later via PATCH /ratings (two-step UX)
- [03-01]: Headliner band_id populated from event_lineup for backward compat with old mobile clients
- [03-01]: Legacy createCheckin delegates to createEventCheckin when eventId present
- [03-02]: Event-first check-in screen defaults to GPS auto-suggest, manual check-in is fallback via text link
- [03-02]: Rating bottom sheet uses two tabs (bands/venue) with partial submission allowed
- [03-02]: CreateCheckInRequest fields now all optional to support both event-first and legacy flows
- [03-03]: R2Service uses isConfigured flag and logs warning when credentials missing (graceful degradation)
- [03-03]: Photo upload uses presigned URLs -- client PUTs directly to R2, never proxied through Railway
- [03-03]: Fresh Dio instance for R2 upload (presigned URLs are self-authenticating, DioClient auth would interfere)

### Pending Todos

- Set up TICKETMASTER_API_KEY environment variable (see .planning/phases/02-event-data-pipeline/02-USER-SETUP.md)
- Configure sync_regions in database with lat/lon/radius for metro areas to sync
- Set up Cloudflare R2 credentials for photo uploads (CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL)

### Blockers/Concerns

- [Research]: Songkick API unavailable -- removed from plan, Ticketmaster is primary
- [Research]: Bandsintown API requires approval -- build Ticketmaster first, add when approved
- [RESOLVED 01-01]: Shows/events dual table in existing DB -- old events table dropped, new events table created with correct schema
- [Research]: Badge service queries reviews table, not checkins -- must be rewritten in Phase 4
- [RESOLVED 01-02]: Production DB missing shows table and legacy checkin columns -- handled with conditional migration logic
- [01-01]: checkins.band_rating INTEGER column from old migration still exists -- needs cleanup in contract phase
- [01-02]: Production checkins table has minimal schema (no band_id/venue_id/rating/comment/photo_url/event_date) -- contract phase must handle this (nothing to remove for absent columns)
- [RESOLVED 01-03]: Shows table now read-only -- nothing in service layer writes to it, safe for future contract phase removal

## Session Continuity

Last session: 2026-02-03
Stopped at: 03-02 checkpoint -- awaiting event-first check-in flow verification
Resume file: .planning/phases/03-core-check-in-flow/03-02-PLAN.md
