---
phase: 11-platform-trust-between-show-retention
plan: 01
subsystem: database
tags: [postgres, migrations, tsvector, gin-index, wilson-score, full-text-search, verification, genres]

# Dependency graph
requires:
  - phase: 10-viral-growth-engine
    provides: event_rsvps table, user_genre_preferences table (migration 032)
provides:
  - verification_claims table with pending/approved/denied workflow
  - claimed_by_user_id columns on venues and bands
  - wilson_lower_bound SQL function for trending scoring
  - tsvector GENERATED STORED columns with GIN indexes on bands, venues, events
  - genres TEXT[] column on bands with backfill from genre
  - owner_response and owner_response_at columns on reviews
  - TypeScript types for VerificationClaim, TrendingEvent, SearchResults, OwnerReviewResponse
affects: [11-02-trending-service, 11-03-verification-service, 11-04-search-service, 11-05-mobile-trending, 11-06-mobile-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: [tsvector GENERATED STORED columns, partial unique index for one-pending-per-entity, Wilson lower bound SQL function]

key-files:
  created:
    - backend/migrations/033_verification-claims-and-claimed-profiles.ts
    - backend/migrations/034_search-tsvector-columns.ts
    - backend/migrations/035_genre-array-migration.ts
    - backend/migrations/036_review-owner-response.ts
  modified:
    - backend/src/types/index.ts

key-decisions:
  - "Wilson score implemented as PostgreSQL IMMUTABLE STRICT function (not npm package) for SQL-level usage in trending queries"
  - "tsvector columns use GENERATED ALWAYS AS ... STORED (not VIRTUAL) because GIN indexes require materialized data"
  - "Genre migration adds new genres TEXT[] column alongside existing genre VARCHAR — old column kept for backward compatibility"
  - "Owner response added directly to reviews table (not separate table) — matches Google Maps one-response-per-review pattern"

patterns-established:
  - "Partial unique index: idx_claims_one_pending enforces one pending claim per entity at database level"
  - "Weighted tsvector search: name=A, secondary=B, tertiary=C, description=D across bands/venues/events"
  - "Wilson lower bound function: wilson_lower_bound(positive, total) for confidence-interval ranking"

requirements-completed: [VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04, VERIFY-05, VERIFY-06, SCALE-01, SCALE-03]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 11 Plan 01: Database Migrations & Types Summary

**4 migrations (verification claims, tsvector search, genre array, review responses) + TypeScript types for all Phase 11 features**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T15:30:34Z
- **Completed:** 2026-02-28T15:33:57Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created verification_claims table with partial unique index enforcing one pending claim per entity, plus claimed_by_user_id on venues and bands
- Added tsvector GENERATED STORED columns with weighted search fields and GIN indexes on bands, venues, events for full-text search
- Migrated genre to genres TEXT[] array with backfill from existing genre column, keeping old column for backward compatibility
- Added owner_response columns to reviews table and wilson_lower_bound SQL function for trending scoring
- Added all Phase 11 TypeScript interfaces: VerificationClaim, TrendingEvent, SearchResults, OwnerReviewResponse, plus updated Venue/Band/Review interfaces

## Task Commits

Each task was committed atomically:

1. **Task 1: Create database migrations 033-036** - `b34cde0` (feat)
2. **Task 2: Add TypeScript types for Phase 11 features** - `416de38` (feat)

## Files Created/Modified
- `backend/migrations/033_verification-claims-and-claimed-profiles.ts` - Claims table, claimed_by columns, Wilson function, updated_at trigger
- `backend/migrations/034_search-tsvector-columns.ts` - tsvector GENERATED STORED columns + GIN indexes on bands, venues, events
- `backend/migrations/035_genre-array-migration.ts` - genres TEXT[] column with backfill from genre, GIN index
- `backend/migrations/036_review-owner-response.ts` - owner_response and owner_response_at on reviews
- `backend/src/types/index.ts` - Phase 11 types added (VerificationClaim, ClaimStatus, TrendingEvent, SearchResults, etc.) + updated Venue/Band/Review

## Decisions Made
- Wilson score implemented as PostgreSQL function (`wilson_lower_bound`) rather than npm package — keeps scoring in SQL for direct use in trending queries
- tsvector columns use GENERATED ALWAYS AS ... STORED because GIN indexes require materialized data (not VIRTUAL)
- Genre migration adds new `genres TEXT[]` alongside existing `genre VARCHAR(100)` — backward compatibility preserved during transition
- Review owner response uses inline columns on reviews table (not a separate table) — simpler, avoids a join, matches standard patterns

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Migrations will be applied via `npm run migrate up` when ready.

## Next Phase Readiness
- All database schema changes for Phase 11 are ready
- Subsequent plans (11-02 through 11-06) can build services and routes on top of these tables/columns
- Migration 033 creates the foundation for ClaimService and admin approval routes
- Migration 034 enables SearchService with tsvector full-text search
- Migration 035 enables genre array filtering in DiscoveryService
- Migration 036 enables review response feature for claimed venue/band owners

## Self-Check: PASSED

All 6 files verified present. Both task commits (b34cde0, 416de38) verified in git log.

---
*Phase: 11-platform-trust-between-show-retention*
*Completed: 2026-02-28*
