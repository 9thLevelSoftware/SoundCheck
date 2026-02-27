# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-02-27
**Phases:** 8 | **Plans:** 22 | **Requirements:** 77/77

### What Was Built
- Event-centric data model with multi-band lineups and expand-contract migration
- Ticketmaster event pipeline with BullMQ scheduling, dedup, and fuzzy band matching (pg_trgm)
- Event-first check-in flow with GPS auto-suggest, dual ratings, R2 photo uploads
- Data-driven badge engine: 37 badges, 7 categories, JSONB criteria, progress tracking, anti-farming
- FOMO social feed with WebSocket real-time, Happening Now, Redis Pub/Sub, Firebase push
- Concert cred profile with stats aggregation, genre breakdown, personalized recommendations
- App Store compliance: account deletion, privacy manifests, demo account, Flutter version pin
- Audit logging with fire-and-forget pattern across all critical operations

### What Worked
- **Expand-contract migration pattern**: Zero downtime schema evolution. Conditional DDL handled both fresh and pre-migrated database states.
- **BullMQ for everything async**: Badge eval, event sync, notification batching, cancellation checks — all reliable background jobs.
- **Presigned URL photo uploads**: Client PUTs directly to R2 bypassing Railway. Fast, scalable, correct.
- **JSONB badge criteria**: 37 badges, zero custom code per badge type. New badges are data-only.
- **Event-first check-in screen**: GPS auto-suggest makes check-in genuinely fast (under 10 seconds).
- **Execution velocity**: 22 plans in 2.3 hours (6.3 min avg). Research + planning upfront paid off in execution speed.
- **Phase-by-phase dependency ordering**: Schema → events → check-ins → badges → feed → profile → discovery → polish. Each phase built cleanly on the previous.

### What Was Inefficient
- **Legacy review system not cleaned up**: The old `reviews` table still exists alongside `checkin_band_ratings`. Dual data models create confusion.
- **CheckinService size**: Started at ~800 LOC, grew to 1,400. Facade pattern established but 70% of extraction deferred.
- **Search left as ILIKE**: PostgreSQL full-text search (tsvector) would have been minimal additional effort during migration phases.
- **No staging environment**: All development against production schema patterns. Testing against a staging instance would have caught the 3 bugs found during human testing faster.
- **Board gap analysis revealed launch blockers too late**: Report/flag mechanism (App Store Guideline 1.2), forgot password flow, and onboarding were missed in requirements.

### Patterns Established
- **Graceful degradation everywhere**: R2, Firebase, Redis, Ticketmaster all use isConfigured/apiKeyConfigured flags. Nothing hard-fails on missing config.
- **Fire-and-forget for non-critical writes**: Cache invalidation, audit logging, notification enqueue — never block the main response path.
- **Dedicated Pub/Sub connections**: ioredis subscriber mode blocks regular commands. Separate connection for subscribe.
- **Backward-compat response fields**: Headliner band_id populated from event_lineup for old mobile clients.
- **BullMQ jobId dedup**: Badge eval, notification batching use jobId to prevent duplicate processing.

### Key Lessons
1. **Requirements need adversarial review before execution.** Five launch blockers (report/flag, forgot password, onboarding, biometric stub, Facebook stub) were found by a Board of Directors review after all 77 requirements were "complete." A pre-development gap analysis would have caught these.
2. **Between-show retention is the existential product risk.** Concert check-ins are inherently low-frequency (1-4x/month). Without "trending shows near you" or RSVP features, users have no reason to open the app between events.
3. **Social sharing is the cheapest growth lever missing.** `share_plus` is in pubspec.yaml but never wired. Every unshared check-in is a missed acquisition opportunity.
4. **Trust infrastructure must be planned from day one.** No content moderation, no venue verification, no report mechanism means ratings are gameable and the platform is vulnerable to abuse.
5. **Expand-contract migration is the right default.** Every schema change in v1.0 used this pattern and every one was zero-downtime. Worth the extra migration file.

### Cost Observations
- Model mix: Primarily Opus for planning/review, Sonnet for execution
- Total execution: ~2.3 hours across 22 plans
- Notable: Research phase (reading codebase, API docs) took comparable time to execution. Planning investments paid 3-4x in execution speed.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Plans | Phases | Key Change |
|-----------|-------|--------|------------|
| v1.0 | 22 | 8 | Initial GSD workflow. Research → plan → execute → verify per phase. |

### Cumulative Quality

| Milestone | Tests | Test Files | LOC (Backend) | LOC (Mobile) |
|-----------|-------|------------|---------------|--------------|
| v1.0 | 363 | 166 | 25,212 TS | 60,266 Dart |

### Top Lessons (Verified Across Milestones)

1. Requirements need adversarial review (Board of Directors or equivalent) before execution begins
2. Research + planning upfront pays 3-4x in execution speed
3. Graceful degradation (isConfigured flags) prevents integration lock-in
