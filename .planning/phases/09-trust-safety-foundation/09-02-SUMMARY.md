---
phase: 09-trust-safety-foundation
plan: 02
subsystem: api
tags: [moderation, safesearch, cloud-vision, bullmq, reports, content-moderation, admin]

# Dependency graph
requires:
  - phase: 09-trust-safety-foundation
    provides: "reports and moderation_items tables, TypeScript types, mapper functions"
provides:
  - "ReportService with report CRUD, content validation, deduplication, and photo scan enqueue"
  - "ModerationService with moderation queue management, auto-hide/unhide, admin review actions"
  - "ImageModerationService with Cloud Vision SafeSearch wrapper and graceful degradation"
  - "ReportController with rate-limited report submission and admin moderation queue endpoints"
  - "BullMQ moderation queue and worker for async image scanning"
  - "Report routes (POST /api/reports) and moderation routes (GET/PATCH /api/admin/moderation)"
  - "Migration 030: is_hidden columns on checkins and checkin_comments"
affects: [09-03, 09-04]

# Tech tracking
tech-stack:
  added: ["@google-cloud/vision"]
  patterns: ["Async moderation pipeline: report -> enqueue scan -> auto-hide if flagged -> admin review"]

key-files:
  created:
    - backend/src/services/ReportService.ts
    - backend/src/services/ModerationService.ts
    - backend/src/services/ImageModerationService.ts
    - backend/src/controllers/ReportController.ts
    - backend/src/routes/reportRoutes.ts
    - backend/src/routes/moderationRoutes.ts
    - backend/src/jobs/moderationQueue.ts
    - backend/src/jobs/moderationWorker.ts
    - backend/migrations/030_add-is-hidden-columns.ts
  modified:
    - backend/src/index.ts

key-decisions:
  - "Created moderationQueue in Task 1 (moved from Task 2) because ReportService imports it for photo scan enqueue"
  - "Migration 030 adds is_hidden columns separately since migration 026 was already committed in Plan 01"
  - "ImageModerationService uses dynamic require() with try/catch for graceful degradation when @google-cloud/vision is missing"
  - "Photo reports treat the checkin as the content entity (photos are stored as image_urls array on checkins, not a separate table)"

patterns-established:
  - "Report submission pattern: validate content -> dedup via UNIQUE -> enqueue scan -> return report"
  - "Admin moderation pattern: requireAdmin middleware -> paginated queue -> review with approve/remove/warn actions"
  - "Graceful degradation for external services: configured flag + try/catch constructor"

requirements-completed: [SAFE-01, SAFE-02, SAFE-03]

# Metrics
duration: 5min
completed: 2026-02-27
---

# Phase 9 Plan 02: Report & Moderation Pipeline Summary

**Content reporting API with 10/day rate limiting, Cloud Vision SafeSearch auto-scanning via BullMQ worker, and admin moderation queue with approve/remove/warn actions**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-27T20:35:02Z
- **Completed:** 2026-02-27T20:39:57Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Built complete report-to-moderation pipeline: users report content, photos are auto-scanned by Cloud Vision SafeSearch, flagged content is hidden, admins review via moderation queue
- Report endpoint with per-user rate limiting (10/day), content existence validation, deduplication via UNIQUE constraint, and automatic photo scan job enqueue
- Admin moderation queue with paginated listing, approve (unhide), remove (keep hidden + mark reports actioned), and warn actions
- ImageModerationService with graceful degradation -- app works without Cloud Vision credentials, scanning is simply skipped

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ReportService, ModerationService, and ImageModerationService** - `8ba062a` (feat)
2. **Task 2: Create moderation queue/worker, controller, routes, and mount in index.ts** - `9295213` (feat)

## Files Created/Modified
- `backend/src/services/ReportService.ts` - Report CRUD with content validation, dedup, photo scan enqueue
- `backend/src/services/ModerationService.ts` - Moderation queue management, auto-hide/unhide, admin review actions
- `backend/src/services/ImageModerationService.ts` - Cloud Vision SafeSearch wrapper with graceful degradation
- `backend/src/controllers/ReportController.ts` - HTTP handlers for report submission and admin moderation
- `backend/src/routes/reportRoutes.ts` - POST /api/reports with Zod validation
- `backend/src/routes/moderationRoutes.ts` - GET/PATCH /api/admin/moderation with requireAdmin
- `backend/src/jobs/moderationQueue.ts` - BullMQ queue for async image scanning jobs
- `backend/src/jobs/moderationWorker.ts` - Worker that processes SafeSearch scans, auto-hides flagged content
- `backend/migrations/030_add-is-hidden-columns.ts` - Add is_hidden to checkins and checkin_comments
- `backend/src/index.ts` - Mount report/moderation routes, initialize moderation worker

## Decisions Made
- Created moderationQueue.ts in Task 1 instead of Task 2 because ReportService imports it for photo scan enqueue (cannot compile without it)
- Created migration 030 for is_hidden columns separately since migration 026 was already committed in Plan 01
- ImageModerationService uses dynamic `require()` with try/catch for graceful degradation rather than static import (avoids crash when @google-cloud/vision credentials are missing)
- Photo reports use the checkin ID as contentId since photos are stored as image_urls array on the checkins table (no separate checkin_photos table)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created moderationQueue.ts in Task 1 (planned for Task 2)**
- **Found during:** Task 1 (ReportService creation)
- **Issue:** ReportService imports moderationQueue to enqueue scan jobs for photo reports. TypeScript compilation fails without the module.
- **Fix:** Created moderationQueue.ts in Task 1 following the badgeQueue.ts pattern exactly.
- **Files modified:** backend/src/jobs/moderationQueue.ts
- **Verification:** TypeScript compiles without errors
- **Committed in:** 8ba062a (Task 1 commit)

**2. [Rule 2 - Missing Critical] Created migration 030 for is_hidden columns**
- **Found during:** Task 1 (ModerationService creation)
- **Issue:** ModerationService.autoHideContent() needs is_hidden columns on checkins and checkin_comments, but these columns don't exist and migration 026 was already committed.
- **Fix:** Created migration 030_add-is-hidden-columns.ts using conditional DDL pattern.
- **Files modified:** backend/migrations/030_add-is-hidden-columns.ts
- **Verification:** Migration file follows established pattern with IF NOT EXISTS checks
- **Committed in:** 8ba062a (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for correctness. moderationQueue was a file ordering issue; is_hidden migration was omitted from Plan 01 scope. No scope creep.

## Issues Encountered
None

## User Setup Required
- **GOOGLE_APPLICATION_CREDENTIALS** environment variable needed for Cloud Vision SafeSearch to work. Without it, image scanning is gracefully skipped (app still functions, photos are not scanned).
- To enable SafeSearch: create a GCP service account with `roles/visionai.user`, download the JSON key file, set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`.

## Next Phase Readiness
- Report and moderation pipeline complete for Plans 03-04 to build on
- Plan 03 (User Blocking) can proceed -- shares no dependencies with this plan's services
- Plan 04 (Password Reset) can proceed independently
- Admin moderation queue accessible once is_admin is set for a user in the database

## Self-Check: PASSED

All 10 files verified present. Both task commits (8ba062a, 9295213) verified in git log.

---
*Phase: 09-trust-safety-foundation*
*Completed: 2026-02-27*
