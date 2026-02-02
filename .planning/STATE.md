# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-02)

**Core value:** The live check-in moment: check in fast, rate the experience, share with friends -- feeding discovery, gamification, and concert identity.
**Current focus:** Phase 1: Data Model Foundation

## Current Position

Phase: 1 of 8 (Data Model Foundation)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-02-02 -- Completed 01-01-PLAN.md (migration tooling + expand-phase DDL)

Progress: [#_____________________] 4% (1/22 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 7 min
- Total execution time: 0.1 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-data-model-foundation | 1/3 | 7 min | 7 min |

**Recent Trend:**
- Last 5 plans: 7m
- Trend: baseline

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Research]: Songkick API unavailable -- removed from plan, Ticketmaster is primary
- [Research]: Bandsintown API requires approval -- build Ticketmaster first, add when approved
- [RESOLVED 01-01]: Shows/events dual table in existing DB -- old events table dropped, new events table created with correct schema
- [Research]: Badge service queries reviews table, not checkins -- must be rewritten in Phase 4
- [01-01]: Production DB was set up from old migration script only -- many database-schema.sql tables are missing (shows, vibe_tags, toasts, checkin_vibes, user_wishlist, deletion_requests, user_consents, user_social_accounts, refresh_tokens). Plans 02/03 must account for this.
- [01-01]: checkins.band_rating INTEGER column from old migration still exists -- needs cleanup in contract phase

## Session Continuity

Last session: 2026-02-02T23:38:31Z
Stopped at: Completed 01-01-PLAN.md (migration tooling + expand-phase DDL)
Resume file: None
