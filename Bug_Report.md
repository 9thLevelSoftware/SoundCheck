# SoundCheck Code Quality & Issues Review

## Executive Summary
- Total issues found: 5
- Critical bugs: 2
- Code coverage: Not measured (no coverage report in repo)
- Technical debt: High (schema/code divergence and multiple stubs)

## Issues by Category

### Backend Issues

- ID: BUG-003
- Title: User stats counts reviews instead of check-ins
- Severity: Medium
- File: `backend/src/services/UserService.ts:227`
- Description: `getUserStats` uses `reviews` table counts for `totalCheckins`, which appears to be legacy and mismatched to the check-in model.
- Reproduction: Call `GET /api/users/me` and compare stats to check-in activity; counts will not align.
- Impact: Incorrect user statistics in profile views and leaderboards.
- Fix: Update queries to read from `checkins` and align with schema fields.

### Mobile Issues

- ID: BUG-004
- Title: User stats endpoint requested by mobile does not exist
- Severity: Medium
- File: `mobile/lib/src/features/checkins/data/checkin_repository.dart:204`
- Description: Mobile calls `GET /api/users/:userId/stats` but no backend route exposes this path.
- Reproduction: Use app profile stats panel; observe 404 from backend for stats request.
- Impact: Profile stats load failures and broken UX.
- Fix: Implement `GET /api/users/:userId/stats` or update mobile to use `/api/users/me` and extract stats.

- ID: BUG-005
- Title: Android dev base URL uses localhost over cleartext
- Severity: Medium
- File: `mobile/lib/src/core/api/api_config.dart:17`
- Description: Android devices cannot reach `http://localhost:3000` and cleartext HTTP is blocked by default on Android 9+.
- Reproduction: Run app with `ENVIRONMENT=dev` on Android; network calls fail.
- Impact: Dev builds cannot authenticate or load data on Android.
- Fix: Use `http://10.0.2.2:3000` for emulator or add a network security config/cleartext exception for debug builds.

### Database Issues

- ID: BUG-001
- Title: Review subsystem references missing tables
- Severity: Critical
- File: `backend/src/services/ReviewService.ts:113`, `backend/database-schema.sql`
- Description: Code queries `reviews` and related tables (`review_helpfulness`), but the schema defines only `checkins` and no `reviews` table.
- Reproduction: Run schema from `backend/database-schema.sql`, call `GET /api/reviews`, observe SQL error `relation "reviews" does not exist`.
- Impact: Review endpoints, badge calculations, and admin stats fail at runtime.
- Fix: Either add `reviews` and related tables to the schema or remove/replace review features with check-ins.

- ID: BUG-002
- Title: Event and check-in schema mismatch
- Severity: Critical
- File: `backend/src/services/EventService.ts:39`, `backend/src/services/CheckinService.ts:114`, `backend/database-schema.sql`
- Description: Code expects `events` table and `checkins.event_id`, `checkin_toasts`, `checkin_comments.comment_text`, but schema defines `shows`, `checkins.band_id/venue_id`, `toasts`, and `checkin_comments.content`.
- Reproduction: Call `POST /api/checkins` or `GET /api/checkins/:id` with current schema; observe SQL errors for missing columns/tables.
- Impact: Core check-in and event workflows fail, breaking the app's primary feature set.
- Fix: Align schema with the service layer (preferred) or refactor services/controllers to match the existing schema.

## Performance Issues
- No runtime profiling data or query plans present; performance risks not evaluated.

## Code Quality Metrics
- Cyclomatic complexity: Not measured
- Type coverage: Not measured
- Test coverage: Not measured
- Dependency health: Not measured (no audit results)
