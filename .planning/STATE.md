# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-02)

**Core value:** The live check-in moment: check in fast, rate the experience, share with friends -- feeding discovery, gamification, and concert identity.
**Current focus:** Phase 5: Social Feed & Real-time (in progress)

## Current Position

Phase: 5 of 8 (Social Feed & Real-time)
Plan: 1 of 3 in Phase 5 (05-01 complete)
Status: In progress
Last activity: 2026-02-03 -- Completed 05-01-PLAN.md (Feed Backend Service)

Progress: [#############_________] 59% (13/22 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 13
- Average duration: 5.9 min
- Total execution time: 1.27 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-data-model-foundation | 3/3 | 18 min | 6 min |
| 02-event-data-pipeline | 3/3 | 13 min | 4.3 min |
| 03-core-check-in-flow | 3/3 | 29 min | 9.7 min |
| 04-badge-engine | 3/3 | 21 min | 7 min |
| 05-social-feed-realtime | 1/3 | 4 min | 4 min |

**Recent Trend:**
- Last 5 plans: 8m, 5m, 4m, 12m, 4m
- Trend: Feed backend service was fast -- pure backend, no mobile/codegen overhead

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
- [04-01]: Evaluator registry uses Map<string, BadgeEvaluator> for extensible criteria dispatch
- [04-01]: N+1 optimization groups badges by criteria.type; genre_explorer subgroups by genre
- [04-01]: road_warrior uses safe column mapping (whitelist) instead of string interpolation for SQL safety
- [04-01]: Badge eval job has 30s delay for anti-farming and jobId dedup per user+checkin
- [04-01]: Notification failure is non-fatal: badge award persists even if notification/WebSocket fails
- [04-02]: Daily check-in rate limit applied to POST /api/checkins (covers both event-first and legacy flows)
- [04-02]: Rate limit middleware fails open on error (allows request rather than blocking)
- [04-02]: Rarity endpoint is public (no auth) for discovery/marketing use
- [04-02]: Badge route reorder: named routes before parameterized /:id to prevent path conflicts
- [04-02]: awardBadge stores evaluator metadata in user_badges.metadata JSONB column
- [04-03]: @JsonKey(name: 'badgeType') maps backend JSON key to Dart category field
- [04-03]: Hide Flutter Material Badge in import to avoid name conflict with domain Badge model
- [04-03]: WebSocket badge_earned listener on ConsumerStatefulWidget for SnackBar access via BuildContext
- [04-03]: Badge earned toast invalidates all badge providers for immediate data refresh
- [05-01]: Badge earned indicator uses time-proximity heuristic (earned_at within 1min-1hr of created_at)
- [05-01]: Fire-and-forget cache invalidation after check-in creation (never blocks response)
- [05-01]: GET /api/feed/ backward-compat forwards to friends feed
- [05-01]: Happening Now expiry: COALESCE(end_time+1h, start_time+4h, event_date+1day)

### Pending Todos

- Set up TICKETMASTER_API_KEY environment variable (see .planning/phases/02-event-data-pipeline/02-USER-SETUP.md)
- Configure sync_regions in database with lat/lon/radius for metro areas to sync
- Set up Cloudflare R2 credentials for photo uploads (see .planning/phases/03-core-check-in-flow/03-USER-SETUP.md)

### Blockers/Concerns

- [Research]: Songkick API unavailable -- removed from plan, Ticketmaster is primary
- [Research]: Bandsintown API requires approval -- build Ticketmaster first, add when approved
- [RESOLVED 01-01]: Shows/events dual table in existing DB -- old events table dropped, new events table created with correct schema
- [RESOLVED 04-01]: Badge service queries reviews table, not checkins -- rewritten in Phase 4 Plan 1
- [RESOLVED 01-02]: Production DB missing shows table and legacy checkin columns -- handled with conditional migration logic
- [01-01]: checkins.band_rating INTEGER column from old migration still exists -- needs cleanup in contract phase
- [01-02]: Production checkins table has minimal schema (no band_id/venue_id/rating/comment/photo_url/event_date) -- contract phase must handle this (nothing to remove for absent columns)
- [RESOLVED 01-03]: Shows table now read-only -- nothing in service layer writes to it, safe for future contract phase removal
- [RESOLVED 04-01]: user_badges metadata column deferred to plan 02 migration -- completed in 04-02

## Session Continuity

Last session: 2026-02-03
Stopped at: Completed 05-01-PLAN.md (Feed Backend Service). Ready for 05-02.
Resume file: None
