---
phase: "17"
plan: "01"
subsystem: backend
tags: [user-discovery, global-feed, search, seed-data, social-graph]
dependency_graph:
  requires: [phase-14, phase-15]
  provides: [user-search-api, user-suggestions-api, global-feed-api, multi-demo-accounts]
  affects: [SearchService, FeedService, CheckinCreatorService, discoveryRoutes, feedRoutes]
tech_stack:
  added: []
  patterns: [suggestion-scoring-algorithm, ILIKE-user-search, global-feed-no-follower-join]
key_files:
  created:
    - backend/src/services/UserDiscoveryService.ts
    - backend/src/controllers/UserDiscoveryController.ts
  modified:
    - backend/src/services/SearchService.ts
    - backend/src/types/index.ts
    - backend/src/controllers/SearchController.ts
    - backend/src/routes/discoveryRoutes.ts
    - backend/src/services/FeedService.ts
    - backend/src/controllers/FeedController.ts
    - backend/src/routes/feedRoutes.ts
    - backend/src/scripts/seed-demo.ts
    - backend/src/services/checkin/CheckinCreatorService.ts
decisions:
  - Used ILIKE with smart ranking for user search (no tsvector on users table)
  - Global feed cache keyed per-user due to block filter being user-specific
  - Suggestion scoring weights shared bands 3x > shared venues 2x > activity 0.1x
  - Per-user rate limiting on discovery endpoint using existing RateLimitPresets.read
metrics:
  duration: "4 min"
  completed: "2026-03-01"
  tasks: 7
  files: 11
---

# Phase 17 Plan 01: Backend -- User Discovery + Global Feed + Seed Content Summary

User search in unified SearchService, suggestion algorithm for user discovery, global feed endpoint, multi-account demo seeding with cross-follows, and global feed cache invalidation on check-in creation.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add user type to unified SearchService | 6cdf5e8 | SearchService.ts, types/index.ts, SearchController.ts |
| 2 | Create UserDiscoveryService with suggestion algorithm | 1771dd4 | UserDiscoveryService.ts (NEW) |
| 3 | Create UserDiscoveryController + route | c99ad35 | UserDiscoveryController.ts (NEW), discoveryRoutes.ts |
| 4 | Add getGlobalFeed() to FeedService | 02bbe56 | FeedService.ts |
| 5 | Add global feed endpoint to FeedController + routes | a3687bf | FeedController.ts, feedRoutes.ts |
| 6 | Enhance seed-demo.ts for multiple demo accounts | cdc5cb9 | seed-demo.ts |
| 7 | Add global feed cache invalidation to check-in creation | 6af6588 | CheckinCreatorService.ts |

## Decisions Made

1. **ILIKE for user search**: Users table lacks a tsvector search_vector column, so searchUsers() uses ILIKE with smart ranking (exact match > prefix > partial), matching the existing UserService.searchUsers pattern.

2. **Global feed cache key includes userId**: Block filter SQL is user-specific (`feed:global:${userId}:${cursor}`), so each user sees a correctly filtered global feed.

3. **Suggestion scoring weights**: Shared bands weighted 3x, shared venues 2x, activity capped at 20 check-ins * 0.1 -- prioritizes musical taste overlap over raw activity volume.

4. **Per-user rate limiting on discovery**: Used existing `RateLimitPresets.read` (100 req/min) for suggestions endpoint rather than creating a custom limit.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript type check: `npx tsc --noEmit` -- PASSED (zero errors)
- All 7 tasks committed individually with proper conventional commit format
- New endpoints wired into existing route registration in index.ts (discoveryRoutes already at /api/discover, feedRoutes already at /api/feed)
- BlockService.getBlockFilterSQL() used in both UserDiscoveryService and global feed query
- Redis cache-aside pattern maintained consistently (getCache/setCache with TTL)

## API Endpoints Added

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/search?q=X&types=user | No | User search in unified search |
| GET | /api/discover/users/suggestions | Yes | Follow suggestions based on shared taste |
| GET | /api/feed/global | Yes | Global feed with cursor pagination |
