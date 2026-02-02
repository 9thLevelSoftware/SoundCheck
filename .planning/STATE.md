# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-02)

**Core value:** The live check-in moment: check in fast, rate the experience, share with friends -- feeding discovery, gamification, and concert identity.
**Current focus:** Phase 1: Data Model Foundation

## Current Position

Phase: 1 of 8 (Data Model Foundation)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-02 -- Completed 01-02-PLAN.md (data migration: triggers, shows-to-events, checkins backfill)

Progress: [##____________________] 9% (2/22 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 6 min
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-data-model-foundation | 2/3 | 12 min | 6 min |

**Recent Trend:**
- Last 5 plans: 7m, 5m
- Trend: improving

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

## Session Continuity

Last session: 2026-02-02T23:47:13Z
Stopped at: Completed 01-02-PLAN.md (data migration: triggers, shows-to-events, checkins backfill)
Resume file: None
