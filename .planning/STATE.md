# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-02)

**Core value:** The live check-in moment: check in fast, rate the experience, share with friends -- feeding discovery, gamification, and concert identity.
**Current focus:** Phase 2: Event Data Pipeline (next)

## Current Position

Phase: 1 of 8 (Data Model Foundation) -- VERIFIED COMPLETE
Plan: 3 of 3 in Phase 1 (all complete)
Status: Phase 1 verified, ready for Phase 2 planning
Last activity: 2026-02-02 -- Phase 1 verified (5/5 must-haves passed)

Progress: [###___________________] 14% (3/22 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 6 min
- Total execution time: 0.3 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-data-model-foundation | 3/3 | 18 min | 6 min |

**Recent Trend:**
- Last 5 plans: 7m, 5m, 6m
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

### Pending Todos

None yet.

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

Last session: 2026-02-02
Stopped at: Phase 1 verified and complete. Ready for Phase 2 planning.
Resume file: None
