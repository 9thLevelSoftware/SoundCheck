# SoundCheck Beta Readiness Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute a comprehensive 3-phase review of the SoundCheck application to determine beta readiness, fix all blockers, and produce a GO/NO-GO certification report.

**Architecture:** Parallel specialist agent squads review security, backend, API surface, mobile, and infrastructure simultaneously (Phase 1). Cross-cutting integration tests and performance analysis follow (Phase 2). Blockers are fixed in isolated worktrees, verified with evidence, and certified by a Reality Checker (Phase 3).

**Tech Stack:** Node.js/Express/TypeScript backend, Flutter/Dart mobile, PostgreSQL, Redis, BullMQ, 6 external API integrations

**Spec:** `docs/superpowers/specs/2026-03-18-beta-readiness-review-design.md`

---

## Report Output Convention

Every review agent writes its findings to `docs/reviews/`. Each finding uses this format:

```markdown
### [FINDING-ID]: [Title]
**Severity:** Blocker | High | Medium | Low
**File(s):** `exact/path/to/file.ts:line`
**Description:** What is wrong and why it matters
**Evidence:** Code snippet, trace, or proof
**Recommended Fix:** Specific remediation
```

Finding IDs use the pattern: `{SQUAD}-{NUMBER}` (e.g., `SEC-001`, `BE-003`, `API-012`, `MOB-007`, `INF-002`, `E2E-001`, `PERF-005`).

---

## Phase 1 — Parallel Domain Squads

All 9 agents in Tasks 1-9 run **in parallel**. No dependencies between them.

---

### Task 1: Agent 1A — Backend Security Audit

**Agent type:** Security Engineer
**Output file:** Create: `docs/reviews/phase1-security-backend.md`

- [ ] **Step 1: Audit JWT authentication implementation**

Read and analyze these files for JWT security:
- `backend/src/middleware/auth.ts` — token validation, error handling, optional auth paths
- `backend/src/services/UserService.ts` — token generation, secret handling, expiry config
- `backend/src/__tests__/middleware/auth.test.ts` — test coverage of auth edge cases
- `backend/src/__tests__/integration/auth.test.ts` — integration auth tests

Check for: weak secret entropy, missing expiry validation, algorithm confusion attacks (alg:none), token reuse after logout, missing audience/issuer claims.

- [ ] **Step 2: Audit social authentication flows**

Read and analyze:
- `backend/src/services/SocialAuthService.ts` — Google/Apple token verification
- `backend/src/routes/socialAuthRoutes.ts` — social auth endpoints
- `backend/src/__tests__/services/SocialAuthService.test.ts` — test coverage

Check for: ID token verification bypasses, nonce reuse, account linking vulnerabilities, missing email verification on social accounts.

- [ ] **Step 3: Audit all route files for injection vectors**

Read every route file in `backend/src/routes/` (28 files listed in spec). For each route:
- Trace user input from request → controller → service → database query
- Verify parameterized queries (no string concatenation in SQL)
- Check for command injection in any shell-calling code
- Check for XSS in any response that renders user content

Route files to audit:
```
backend/src/routes/badgeRoutes.ts
backend/src/routes/bandRoutes.ts
backend/src/routes/blockRoutes.ts
backend/src/routes/checkinRoutes.ts
backend/src/routes/claimRoutes.ts
backend/src/routes/consentRoutes.ts
backend/src/routes/dataExportRoutes.ts
backend/src/routes/discoveryRoutes.ts
backend/src/routes/eventRoutes.ts
backend/src/routes/feedRoutes.ts
backend/src/routes/followRoutes.ts
backend/src/routes/moderationRoutes.ts
backend/src/routes/notificationRoutes.ts
backend/src/routes/onboardingRoutes.ts
backend/src/routes/passwordResetRoutes.ts
backend/src/routes/reportRoutes.ts
backend/src/routes/rsvpRoutes.ts
backend/src/routes/searchRoutes.ts
backend/src/routes/shareRoutes.ts
backend/src/routes/socialAuthRoutes.ts
backend/src/routes/subscriptionRoutes.ts
backend/src/routes/trendingRoutes.ts
backend/src/routes/tokenRoutes.ts
backend/src/routes/uploadsRoutes.ts
backend/src/routes/userRoutes.ts
backend/src/routes/venueRoutes.ts
backend/src/routes/wishlistRoutes.ts
backend/src/routes/wrappedRoutes.ts
```

- [ ] **Step 4: Audit data exposure in API responses and logs**

Read and check:
- All controller files (`backend/src/controllers/*.ts`) — verify no password hashes, internal IDs, or excessive PII in responses
- `backend/src/index.ts` — Helmet/CORS/CSP configuration
- Winston logging config — search for PII in log formatters
- Sentry config — verify `beforeSend` scrubs sensitive data
- `backend/src/__tests__/utils/logSanitizer.test.ts` — log sanitization coverage

- [ ] **Step 5: Audit rate limiting implementation**

Read and analyze:
- `backend/src/middleware/checkinRateLimit.ts` — checkin-specific limiting
- `backend/src/middleware/perUserRateLimit.ts` — per-user rate limiting
- `backend/src/config/redis.ts` — Redis connection and failover

Check for: bypass via header manipulation, race conditions in counter increment, behavior when Redis is down (fail open vs fail closed).

- [ ] **Step 6: Audit admin and privileged endpoints**

Read all controller files and identify admin-only operations. Verify:
- `backend/src/controllers/AdminController.ts` — admin authorization enforced
- Every route with admin-level operations has proper middleware
- No privilege escalation paths (regular user accessing admin endpoints)

- [ ] **Step 7: Audit secrets and environment variable handling**

Check for:
- Hardcoded secrets in source code (grep for API keys, passwords, tokens in non-.env files)
- `.env` in `.gitignore`
- `backend/src/config/database.ts` — connection string handling
- `backend/src/config/redis.ts` — Redis URL handling
- Any secrets committed in git history (gitleaks coverage in CI)

- [ ] **Step 8: Write findings report**

Write all findings to `docs/reviews/phase1-security-backend.md` using the finding format above. Include:
- Summary statistics (total findings by severity)
- Findings grouped by category (auth, injection, data exposure, rate limiting, admin, secrets)
- Each finding with severity, file reference, evidence, and recommended fix

---

### Task 2: Agent 1B — Mobile Security Audit

**Agent type:** Security Engineer
**Output file:** Create: `docs/reviews/phase1-security-mobile.md`

- [ ] **Step 1: Audit secure storage and token handling**

Read and analyze:
- Search for all `flutter_secure_storage` usage across `mobile/lib/src/`
- `mobile/lib/src/core/` — look for auth provider, token storage, secure storage wrapper
- `mobile/lib/src/features/auth/` — all files in data/domain/presentation layers

Check for: tokens stored in non-secure locations, tokens persisted after logout, token exposure in debug logs, clearance on app uninstall.

- [ ] **Step 2: Audit Dio HTTP client and interceptors**

Search for Dio configuration:
- `mobile/lib/src/core/` — API client, interceptors, error handling
- Find all Dio interceptor implementations

Check for: token refresh race condition (multiple concurrent 401s), tokens in request/response logs, missing TLS verification, hardcoded API URLs.

- [ ] **Step 3: Audit deep link handling**

Read:
- `mobile/lib/src/core/router/app_router.dart` — route definitions, deep link patterns
- Android `AndroidManifest.xml` — intent filters for deep links
- iOS `Info.plist` — URL schemes and universal links

Check for: URI scheme hijacking, unvalidated deep link parameters, navigation to sensitive screens via deep links without auth check.

- [ ] **Step 4: Audit sensitive data in application state**

Search across all Riverpod providers in `mobile/lib/src/`:
- Identify providers that hold tokens, PII, or credentials
- Check if they use `autoDispose` to clean up
- Verify state is cleared on logout
- Check for PII in error reporting (Sentry context)

- [ ] **Step 5: Audit build and platform configuration**

Read:
- `mobile/android/app/build.gradle` or `build.gradle.kts` — ProGuard, minification, debug flags
- `mobile/ios/Runner/Info.plist` — ATS, privacy permissions
- `mobile/lib/main.dart` — debug vs release configuration
- Search for debug-only code paths that might leak into release builds

- [ ] **Step 6: Write findings report**

Write all findings to `docs/reviews/phase1-security-mobile.md`.

---

### Task 3: Agent 2A — Backend Service Layer Audit

**Agent type:** Backend Architect
**Output file:** Create: `docs/reviews/phase1-backend-services.md`

- [ ] **Step 1: Audit CheckinService for correctness and race conditions**

Read all checkin service files:
```
backend/src/services/CheckinService.ts
backend/src/services/checkin/CheckinCreatorService.ts
backend/src/services/checkin/CheckinQueryService.ts
backend/src/services/checkin/CheckinRatingService.ts
backend/src/services/checkin/CheckinToastService.ts
backend/src/services/checkin/types.ts
backend/src/controllers/CheckinController.ts
backend/src/__tests__/services/CheckinService.test.ts
backend/src/__tests__/services/CheckinService.integration.test.ts
backend/src/__tests__/controllers/CheckinController.test.ts
```

Check for: race conditions on concurrent check-ins (same user, same event), transaction boundary correctness, validation completeness, error handling paths, proper rollback on partial failure.

- [ ] **Step 2: Audit BadgeService and BadgeEvaluators**

Read:
```
backend/src/services/BadgeService.ts
backend/src/services/BadgeEvaluators.ts
```

Check for: JSONB criteria evaluation edge cases (exactly at threshold, zero values, null criteria fields), anti-farming logic correctness, badge awarding race conditions (duplicate badges), badge progress calculation accuracy.

- [ ] **Step 3: Audit EventSyncService and external API integrations**

Read:
```
backend/src/services/EventSyncService.ts
backend/src/services/EventService.ts
backend/src/services/TicketmasterAdapter.ts
backend/src/services/BandMatcher.ts
backend/src/services/FoursquareService.ts
backend/src/services/MusicBrainzService.ts
backend/src/services/SetlistFmService.ts
backend/src/jobs/eventSyncWorker.ts
backend/src/jobs/syncScheduler.ts
```

Check for: API failure handling (timeout, rate limit, 500), dedup logic correctness (duplicate events), fuzzy band matching accuracy, data consistency when sync partially fails, job retry behavior.

- [ ] **Step 4: Audit FeedService, DiscoveryService, and social features**

Read:
```
backend/src/services/FeedService.ts
backend/src/services/DiscoveryService.ts
backend/src/services/FollowService.ts
backend/src/services/UserDiscoveryService.ts
backend/src/controllers/FeedController.ts
backend/src/controllers/DiscoveryController.ts
backend/src/controllers/FollowController.ts
```

Check for: cursor-based pagination edge cases (first/last/empty page, cursor invalidation), FOMO feed logic correctness, recommendation algorithm soundness, follow/unfollow race conditions.

- [ ] **Step 5: Audit remaining services for error handling and logic**

Read all remaining service files:
```
backend/src/services/AuditService.ts
backend/src/services/BandService.ts
backend/src/services/BlockService.ts
backend/src/services/ClaimService.ts
backend/src/services/ConsentService.ts
backend/src/services/DataExportService.ts
backend/src/services/DataRetentionService.ts
backend/src/services/EmailService.ts
backend/src/services/ImageModerationService.ts
backend/src/services/ModerationService.ts
backend/src/services/NotificationService.ts
backend/src/services/OnboardingService.ts
backend/src/services/PasswordResetService.ts
backend/src/services/PushNotificationService.ts
backend/src/services/R2Service.ts
backend/src/services/ReportService.ts
backend/src/services/RsvpService.ts
backend/src/services/SearchService.ts
backend/src/services/ShareCardService.ts
backend/src/services/StatsService.ts
backend/src/services/SubscriptionService.ts
backend/src/services/TrendingService.ts
backend/src/services/VenueService.ts
backend/src/services/WishlistService.ts
backend/src/services/WrappedService.ts
```

For each service check: unhandled exceptions, null/undefined paths, missing error propagation, incorrect return types, logic errors.

- [ ] **Step 6: Audit error propagation from services to controllers**

Read all 25 controller files in `backend/src/controllers/`. For each:
- Verify service errors are caught and produce correct HTTP status codes
- Verify error messages are user-safe (no stack traces, no internal details)
- Verify consistent error response format across all controllers

- [ ] **Step 7: Write findings report**

Write all findings to `docs/reviews/phase1-backend-services.md`.

---

### Task 4: Agent 2B — Database Layer Audit

**Agent type:** Backend Architect
**Output file:** Create: `docs/reviews/phase1-backend-database.md`

- [ ] **Step 1: Audit all database migrations for correctness**

Read every migration file in `backend/migrations/` (043 files). For each:
- Verify UP/DOWN symmetry (every UP has a reversible DOWN)
- Check for destructive operations without safety (DROP without IF EXISTS)
- Verify ALTER statements are correct (column types, constraints, defaults)
- Check for data migrations that could fail on production data

Migration files:
```
backend/migrations/001_setup-migration-infrastructure.ts
through
backend/migrations/043_drop-reviews-tables.ts
```

- [ ] **Step 2: Audit index coverage across all queries**

Cross-reference:
- Read `backend/src/config/database.ts` to understand query patterns
- Read all service files and extract every SQL query (WHERE clauses, JOINs, ORDER BY)
- Cross-reference against indexes created in migrations
- Identify: missing indexes on frequently queried columns, missing GIN indexes on tsvector columns, over-indexed tables

- [ ] **Step 3: Audit denormalized count triggers**

Read:
- `backend/migrations/037_denormalized-count-triggers.ts` — trigger definitions
- `backend/migrations/009_expand-update-triggers.ts` — earlier trigger work
- `backend/migrations/040_add-missing-user-stat-columns.ts`
- `backend/migrations/041_add-missing-band-and-venue-stat-columns.ts`

Check for: triggers that fire on wrong operations (INSERT but not DELETE), race conditions under concurrent writes, counter drift scenarios (trigger failure mid-transaction), bulk operation handling.

- [ ] **Step 4: Audit foreign key integrity and cascade behavior**

Across all migrations, catalog:
- Every REFERENCES clause and its ON DELETE/ON UPDATE behavior
- Missing foreign keys (columns that reference other tables but lack FK constraints)
- CASCADE deletions that could cause unexpected data loss
- RESTRICT constraints that could block legitimate operations

- [ ] **Step 5: Audit query patterns for N+1 and unbounded selects**

Read all service files and search for:
- Loops that execute queries (N+1 pattern)
- SELECT without LIMIT on user-facing endpoints
- JOINs that could produce cartesian products
- Missing pagination on list endpoints

- [ ] **Step 6: Audit transaction boundaries**

Across all services, identify operations that modify multiple tables and check:
- Are they wrapped in transactions?
- Do they handle partial failure correctly?
- Is the isolation level appropriate?

Key multi-table operations to verify:
- Check-in creation (checkins + checkin_band_ratings + badge evaluation + count triggers)
- User deletion (cascade across follows, checkins, badges, etc.)
- Event sync (events + event_lineups + bands)

- [ ] **Step 7: Write findings report**

Write all findings to `docs/reviews/phase1-backend-database.md`.

---

### Task 5: Agent 3A — API Contract Validation

**Agent type:** API Tester
**Output file:** Create: `docs/reviews/phase1-api-contracts.md`

- [ ] **Step 1: Audit request validation across all controllers**

Read `backend/src/middleware/validate.ts` to understand the validation pattern.

For each of the 25 controllers in `backend/src/controllers/`:
- Identify the Zod schema (or lack thereof) for each endpoint
- Verify the schema covers all expected fields
- Check that validation middleware is actually applied in the corresponding route file
- Flag endpoints with no input validation

- [ ] **Step 2: Audit HTTP status codes and error response format**

For each controller:
- Verify correct status codes: 200 (success), 201 (created), 400 (validation), 401 (unauth), 403 (forbidden), 404 (not found), 500 (server error)
- Check error response format is consistent: `{ error: { code, message, details? } }`
- Flag any controller that returns raw error messages or stack traces

- [ ] **Step 3: Audit pagination implementations**

Search for cursor-based pagination across all controllers and services. Check:
- First page (no cursor) works correctly
- Middle page (valid cursor) returns correct next cursor
- Last page (no more results) returns empty with no next cursor
- Empty results (no data at all) handled gracefully
- Invalid cursor (malformed, expired) returns appropriate error
- Page size limits enforced

- [ ] **Step 4: Audit edge case handling**

For each endpoint that accepts user input, check handling of:
- Empty string vs null vs missing field
- Boundary values (max int, negative numbers, zero)
- Unicode characters, emoji, RTL text
- Extremely long strings (>10KB)
- Empty arrays where non-empty expected
- Nested objects with unexpected depth
- Content-Type mismatches (sending form data to JSON endpoint)

- [ ] **Step 5: Write findings report**

Write all findings to `docs/reviews/phase1-api-contracts.md`.

---

### Task 6: Agent 3B — Auth Coverage & Infrastructure Endpoints

**Agent type:** API Tester
**Output file:** Create: `docs/reviews/phase1-api-auth-infra.md`

- [ ] **Step 1: Verify auth middleware coverage on all routes**

Read `backend/src/middleware/auth.ts` to understand the auth middleware.

For each of the 28 route files in `backend/src/routes/`:
- List every endpoint (method + path)
- Check if `requireAuth` or `optionalAuth` middleware is applied
- Flag any endpoint that SHOULD be protected but ISN'T
- Flag any endpoint that is protected but SHOULDN'T be (public endpoints)

Produce a complete route-by-route auth coverage matrix.

- [ ] **Step 2: Verify rate limiting coverage and configuration**

Read:
- `backend/src/middleware/checkinRateLimit.ts`
- `backend/src/middleware/perUserRateLimit.ts`

For each route file, verify:
- Auth endpoints: 5 requests / 15 minutes
- General endpoints: 30-100 requests / 15 minutes
- Check-in endpoint: 3 requests / hour
- Which endpoints have NO rate limiting that should?

- [ ] **Step 3: Audit WebSocket implementation**

Search for WebSocket setup in `backend/src/index.ts` and related files. Check:
- Handshake authentication (JWT validated before upgrade)
- Connection cleanup on disconnect/timeout
- Message format validation (malformed messages don't crash server)
- Reconnection handling (stale connections cleaned up)
- Redis pub/sub integration for fan-out
- WebSocket-specific rate limiting

- [ ] **Step 4: Audit file upload flow**

Read:
- `backend/src/middleware/upload.ts`
- `backend/src/routes/uploadsRoutes.ts`
- `backend/src/services/R2Service.ts`
- `backend/src/__tests__/routes/uploads.test.ts`

Check for: file size limits enforced, content type validation (only images), presigned URL expiry, upload to arbitrary paths prevented, image moderation pipeline triggered.

- [ ] **Step 5: Audit health check endpoint**

Read the health check route (likely in `backend/src/index.ts` or a dedicated route). Check:
- Does it verify database connectivity?
- Does it verify Redis connectivity?
- Does it have an appropriate timeout?
- Does it return machine-readable status?

- [ ] **Step 6: Write findings report**

Write all findings to `docs/reviews/phase1-api-auth-infra.md`.

---

### Task 7: Agent 4A — Mobile State & Navigation Audit

**Agent type:** Frontend Developer
**Output file:** Create: `docs/reviews/phase1-mobile-state.md`

- [ ] **Step 1: Audit all Riverpod providers for memory leaks and stale state**

Search for all provider definitions across `mobile/lib/src/`. For each provider:
- Check if `autoDispose` is used where appropriate (providers that hold temporary data)
- Identify providers that hold auth tokens or user session data
- Verify all session-dependent providers are invalidated on logout
- Check for circular provider dependencies
- Identify providers that rebuild excessively (missing `select` or `family` usage)

- [ ] **Step 2: Audit GoRouter configuration**

Read:
- `mobile/lib/src/core/router/app_router.dart`

Check for:
- Dead routes (defined but never navigated to from any widget)
- Missing routes (widgets that call `context.go('/path')` for undefined routes)
- Auth redirect completeness (every protected screen redirects unauthenticated users)
- Deep link parameter parsing (`:id` parameters validated)
- Navigation stack issues (back button behavior after deep link)

- [ ] **Step 3: Audit Dio interceptor and network error handling**

Find and read the Dio client configuration and interceptors. Check for:
- Token refresh race condition: what happens when 3 requests simultaneously get 401?
- Network timeout handling (configurable? reasonable default?)
- DNS resolution failure handling
- Connection lost mid-request handling
- Retry logic (if any) — exponential backoff? Max retries?
- Request/response logging — does it log tokens or sensitive data?

- [ ] **Step 4: Audit logout flow completeness**

Trace the logout flow:
- Find the logout action/handler
- Verify: JWT cleared from secure storage, all Riverpod providers invalidated/reset, navigation resets to login screen, no cached data accessible after logout
- Check: is there a "force logout" path for 401 responses with expired/invalid tokens?

- [ ] **Step 5: Write findings report**

Write all findings to `docs/reviews/phase1-mobile-state.md`.

---

### Task 8: Agent 4B — Mobile UI/UX & Crash Path Audit

**Agent type:** Frontend Developer
**Output file:** Create: `docs/reviews/phase1-mobile-ui.md`

- [ ] **Step 1: Audit all feature modules for loading/error/empty states**

For each of the 19 feature directories in `mobile/lib/src/features/`:
```
auth, badges, bands, checkins, discover, events, feed,
notifications, onboarding, profile, reporting, search,
sharing, shows, subscription, trending, venues, verification, wrapped
```

Read the presentation layer (screens, widgets). For each screen check:
- Loading state: is there a loading indicator while data fetches?
- Error state: is there an error UI when the API call fails?
- Empty state: is there a message when the list/data is empty?
- Null safety: does the code handle null values from API responses?

- [ ] **Step 2: Audit crash paths from unexpected API responses**

For each screen that fetches data:
- What happens if the API returns 500?
- What happens if a required field is null in the response?
- What happens if the response shape changes (extra fields, missing fields)?
- What happens if the list endpoint returns an empty array?
- Does Freezed model deserialization handle missing fields gracefully?

- [ ] **Step 3: Audit accessibility compliance**

Across all screens check:
- Touch targets: all interactive elements are at least 44x44 logical pixels
- Contrast: text meets WCAG AA ratio (4.5:1 normal, 3:1 large)
- Semantic labels: images and icons have `semanticLabel` or `Semantics` widget
- Screen reader: logical focus order, no invisible interactive elements

Key files to check:
- `mobile/lib/src/shared/widgets/` — shared widgets used across features
- Each feature's presentation layer

- [ ] **Step 4: Audit image handling and offline behavior**

Check across all screens:
- Missing images: `CachedNetworkImage` with error/placeholder widgets
- Loading placeholders: skeleton or shimmer during image load
- Network drop: what happens when network drops mid-screen? Does the app crash or show cached data?
- Pull-to-refresh: available on list screens?

Also read: `mobile/lib/src/shared/widgets/skeleton_list.dart`

- [ ] **Step 5: Audit form validation consistency**

Find all form screens (check-in, registration, profile edit, search, report). Check:
- Client-side validation matches server-side Zod schemas
- Error messages are user-friendly
- Form state preserved on navigation (back button doesn't lose input)
- Keyboard handling (dismiss on submit, next field focus)

- [ ] **Step 6: Write findings report**

Write all findings to `docs/reviews/phase1-mobile-ui.md`.

---

### Task 9: Agent 5 — Infrastructure Audit

**Agent type:** DevOps Automator
**Output file:** Create: `docs/reviews/phase1-infrastructure.md`

- [ ] **Step 1: Audit deployment configuration**

Read:
- `railway.toml` (project root)
- `nixpacks.toml` (project root)
- `backend/package.json` — scripts section (build, start, migrate)

Check for: build command correctness, start command correctness, migration runs before start, health check configured, environment-specific settings.

- [ ] **Step 2: Audit environment variable completeness**

Read:
- `backend/src/index.ts` — all `process.env.*` references
- `backend/src/config/database.ts` — database URL config
- `backend/src/config/redis.ts` — Redis URL config
- Search all service files for `process.env.*` usage

Produce a complete inventory of every environment variable referenced in code, categorized as:
- Required (app won't start without it)
- Optional (has fallback/default)
- Missing (referenced but no default, no documentation)

- [ ] **Step 3: Audit BullMQ job reliability**

Read:
```
backend/src/jobs/queue.ts
backend/src/jobs/badgeQueue.ts
backend/src/jobs/badgeWorker.ts
backend/src/jobs/eventSyncWorker.ts
backend/src/jobs/moderationQueue.ts
backend/src/jobs/moderationWorker.ts
backend/src/jobs/notificationQueue.ts
backend/src/jobs/notificationWorker.ts
backend/src/jobs/syncScheduler.ts
```

Check for: job persistence across deploys (Redis-backed), failed job retry policy (attempts, backoff), dead letter queue configuration, stalled job detection, graceful shutdown (drain queues before exit), job-specific timeout configuration.

- [ ] **Step 4: Audit logging and monitoring**

Search for Winston and Sentry configuration in `backend/src/`. Check:
- Winston: log levels, rotation, structured format, no PII in logs
- Sentry: DSN configured, error context, user scrubbing, performance monitoring
- Missing monitoring: which error paths DON'T report to Sentry? Which critical operations DON'T have logging?

- [ ] **Step 5: Audit CI/CD pipeline**

Read: `.github/workflows/ci.yml`

Check for: runs backend tests, runs mobile tests, gitleaks secrets scan, type checking (tsc), linting, build verification. Flag missing checks that should be present for beta.

- [ ] **Step 6: Audit Redis failover behavior**

Read `backend/src/config/redis.ts` and all Redis consumers.

Check: what happens when Redis is unavailable? Does rate limiting fail open (allow all) or fail closed (deny all)? Do BullMQ workers crash or retry? Does WebSocket pub/sub degrade gracefully?

- [ ] **Step 7: Write findings report**

Write all findings to `docs/reviews/phase1-infrastructure.md`.

---

## Phase 2 — Integration & Cross-Cutting

**Prerequisite:** All Phase 1 tasks (1-9) must be complete before starting Phase 2.

Phase 2 agents must read Phase 1 reports before starting their own work.

---

### Task 10: Agent 6A — Core E2E Flow Verification

**Agent type:** Evidence Collector
**Output file:** Create: `docs/reviews/phase2-e2e-core-flows.md`
**Prerequisite:** Tasks 1-9 complete

- [ ] **Step 1: Read all Phase 1 findings reports**

Read all reports in `docs/reviews/phase1-*.md` to understand known issues before tracing flows.

- [ ] **Step 2: Trace Flow 1 — Registration to Home**

Trace: Registration (email + password) -> onboarding carousel -> genre picker -> home screen

Follow the code path through:
- Mobile: `mobile/lib/src/features/auth/` -> `mobile/lib/src/features/onboarding/` -> router redirect to home
- API: registration endpoint in `backend/src/routes/userRoutes.ts` -> `backend/src/controllers/UserController.ts` -> `backend/src/services/UserService.ts`
- DB: user row created, default settings applied

Flag any broken chain link: missing navigation, API returning wrong shape, DB constraint violation.

- [ ] **Step 3: Trace Flow 2 — Event Discovery to RSVP**

Trace: Event discovery -> event detail -> RSVP

Follow through:
- Mobile: `mobile/lib/src/features/events/` and `mobile/lib/src/features/discover/`
- API: event routes -> EventController -> EventService, RSVP routes -> RsvpController -> RsvpService
- DB: event_rsvps table

- [ ] **Step 4: Trace Flow 3 — Check-in (the core flow)**

Trace: Check-in at event -> select bands -> rate bands -> rate venue -> add photo -> submit

Follow through:
- Mobile: `mobile/lib/src/features/checkins/` — all layers
- API: `backend/src/routes/checkinRoutes.ts` -> `backend/src/controllers/CheckinController.ts` -> full checkin service chain
- DB: checkins + checkin_band_ratings + badge evaluation triggers + count triggers
- Side effects: badge queue job, feed update, notification

This is the most critical flow. Document every step with file references.

- [ ] **Step 5: Trace Flow 4 — Feed**

Trace: Feed appears with friend check-ins -> tap to view detail

- Mobile: `mobile/lib/src/features/feed/`
- API: `backend/src/routes/feedRoutes.ts` -> FeedController -> FeedService
- WebSocket: real-time feed updates

- [ ] **Step 6: Trace Flow 5 — Badge Award**

Trace: Badge awarded after qualifying check-in -> notification -> badge showcase

- Backend: CheckinService -> badgeQueue job -> BadgeWorker -> BadgeEvaluators -> BadgeService
- Notification: NotificationService -> PushNotificationService -> FCM
- Mobile: `mobile/lib/src/features/badges/`

- [ ] **Step 7: Trace Flows 6-7 — Profile Stats & Search**

Trace:
- Profile stats update after check-in (denormalized count triggers -> profile screen)
- Search for band/venue/event -> results -> detail screen

- [ ] **Step 8: Write E2E core flows report**

Write all findings to `docs/reviews/phase2-e2e-core-flows.md`. For each flow:
- Complete code path trace (file:line references)
- Status: VERIFIED (works end-to-end) or BROKEN (with exact break point)
- Any findings from the trace

---

### Task 11: Agent 6B — Secondary E2E Flow Verification

**Agent type:** Evidence Collector
**Output file:** Create: `docs/reviews/phase2-e2e-secondary-flows.md`
**Prerequisite:** Tasks 1-9 complete

- [ ] **Step 1: Read all Phase 1 findings reports**

Read all reports in `docs/reviews/phase1-*.md`.

- [ ] **Step 2: Trace social auth flows (Google + Apple)**

Trace both paths through:
- Mobile: `mobile/lib/src/features/auth/` — Google and Apple sign-in
- API: `backend/src/routes/socialAuthRoutes.ts` -> SocialAuthService
- DB: user creation/linking, social_auth_provider column

- [ ] **Step 3: Trace follow and notification flows**

Trace:
- Follow user -> their check-ins appear in feed
- Push notification received -> tap -> navigates to correct screen

Through:
- Mobile: `mobile/lib/src/features/notifications/`, feed feature
- API: follow routes, notification routes, push notification service
- Jobs: notification queue/worker

- [ ] **Step 4: Trace sharing and wrapped flows**

Trace:
- Share card generated -> share to external app
- Wrapped data generates correctly for user with check-in history

Through:
- Mobile: `mobile/lib/src/features/sharing/`, `mobile/lib/src/features/wrapped/`
- API: share routes -> ShareCardService, wrapped routes -> WrappedService

- [ ] **Step 5: Trace claim, report, and moderation flows**

Trace:
- Claim venue ownership -> verification flow -> claim status
- Report user -> block user -> blocked user's content hidden

Through:
- Mobile: `mobile/lib/src/features/verification/`, `mobile/lib/src/features/reporting/`
- API: claim routes, report routes, block routes, moderation routes
- Services: ClaimService, ReportService, BlockService, ModerationService

- [ ] **Step 6: Trace subscription and password reset flows**

Trace:
- Subscription purchase (RevenueCat) -> Pro features unlocked
- Password reset flow -> email sent -> token valid -> password changed

Through:
- Mobile: `mobile/lib/src/features/subscription/`
- API: subscription routes, password reset routes
- Services: SubscriptionService, PasswordResetService, EmailService

- [ ] **Step 7: Write E2E secondary flows report**

Write all findings to `docs/reviews/phase2-e2e-secondary-flows.md`.

---

### Task 12: Agent 7A — Performance & Query Analysis

**Agent type:** Performance Benchmarker
**Output file:** Create: `docs/reviews/phase2-performance.md`
**Prerequisite:** Tasks 1-9 complete

- [ ] **Step 1: Read Phase 1 database findings**

Read `docs/reviews/phase1-backend-database.md` to build on existing index and query findings.

- [ ] **Step 2: Catalog all database queries across all services**

Read every service file in `backend/src/services/` and extract every SQL query. For each query:
- Classify: simple lookup, list/search, aggregation, write, transaction
- Estimate complexity at 2,000 users
- Flag: missing indexes, full table scans, N+1 patterns, unbound SELECTs

- [ ] **Step 3: Analyze concurrency risks**

Identify and analyze:
- Check-in race condition: two users checking into same event simultaneously
- Badge evaluation: concurrent badge triggers from BullMQ workers
- Follow/unfollow: rapid toggle creating inconsistent counts
- WebSocket: fan-out scaling under 500+ concurrent connections
- Rate limiter: Redis INCR race conditions

- [ ] **Step 4: Estimate response times at beta scale**

For each API endpoint, estimate response time at:
- 100 concurrent users (typical)
- 500 concurrent users (peak)
- 2,000 registered users (data volume)

Flag any endpoint likely to exceed 500ms. Key suspects:
- Feed endpoint (complex JOIN + filter)
- Discovery/recommendations (aggregation queries)
- Search (tsvector + fuzzy fallback)
- Wrapped (annual aggregation)

- [ ] **Step 5: Analyze connection pool and Redis memory**

Read `backend/src/config/database.ts` and `backend/src/config/redis.ts`.
- PostgreSQL: pool size vs expected concurrent connections
- Redis: key accumulation from rate limiting, pub/sub channel cleanup, memory limits

- [ ] **Step 6: Write performance report**

Write all findings to `docs/reviews/phase2-performance.md`.

---

### Task 13: Agent 7B — Data Integrity Verification

**Agent type:** Performance Benchmarker
**Output file:** Create: `docs/reviews/phase2-data-integrity.md`
**Prerequisite:** Tasks 1-9 complete

- [ ] **Step 1: Read Phase 1 database findings**

Read `docs/reviews/phase1-backend-database.md`.

- [ ] **Step 2: Verify denormalized count consistency**

Read the trigger definitions in migrations 037 and 040-041. For each `*_count` column:
- Verify the trigger fires on INSERT, UPDATE, DELETE
- Check edge cases: bulk operations, transaction rollbacks, concurrent writes
- Identify any count that could drift (trigger missing a case)

Columns to verify: `checkin_count`, `follower_count`, `following_count`, `unique_band_count`, `unique_venue_count`, `badge_count`, and any others.

- [ ] **Step 3: Verify foreign key coverage and orphan paths**

Across all migrations, produce a complete FK map:
- Every REFERENCES clause with its ON DELETE behavior
- Tables/columns that SHOULD have FKs but don't
- Identify data paths that could create orphaned records (parent deleted without cascade)

- [ ] **Step 4: Verify migration rollback safety**

For every migration, check:
- Does the DOWN migration correctly reverse the UP?
- Are there data migrations that are irreversible? If so, are they documented?
- Could a rollback cause data loss?

- [ ] **Step 5: Verify seed script**

Read the seed scripts:
- `backend/src/scripts/seed.ts`
- `backend/src/scripts/seed-demo.ts`

For each script check:
- Does it produce consistent, non-conflicting data?
- Does it respect all FK constraints?
- Does it work on a fresh database?
- Does it work on a database with existing data (idempotent)?

- [ ] **Step 6: Write data integrity report**

Write all findings to `docs/reviews/phase2-data-integrity.md`.

---

### Task 14: Agent 8 — Consolidated Findings Report

**Agent type:** Reality Checker
**Output file:** Create: `docs/reviews/consolidated-findings.md`
**Prerequisite:** Tasks 1-13 complete

- [ ] **Step 1: Read ALL findings reports**

Read every report in `docs/reviews/`:
```
phase1-security-backend.md
phase1-security-mobile.md
phase1-backend-services.md
phase1-backend-database.md
phase1-api-contracts.md
phase1-api-auth-infra.md
phase1-mobile-state.md
phase1-mobile-ui.md
phase1-infrastructure.md
phase2-e2e-core-flows.md
phase2-e2e-secondary-flows.md
phase2-performance.md
phase2-data-integrity.md
```

- [ ] **Step 2: Deduplicate findings across reports**

Identify the same issue reported by multiple squads. Merge duplicates, keeping the most detailed evidence. Track which squads independently found the same issue (validates severity).

- [ ] **Step 3: Validate severity assignments**

For EVERY finding marked "Blocker":
- Does it have concrete evidence (code reference, reproduction path)?
- Does it actually meet the Blocker definition: data loss, auth bypass, crash on core flow, or security vulnerability?
- Downgrade findings that don't meet the bar

For findings NOT marked "Blocker":
- Should any be upgraded based on cross-squad evidence?

- [ ] **Step 4: Cross-reference findings across domains**

Look for patterns:
- Does a security finding explain a backend logic issue?
- Does an API contract issue cause a mobile crash?
- Does an infrastructure gap make a backend issue worse?
- Are there systemic patterns (e.g., "error handling is inconsistent everywhere")?

- [ ] **Step 5: Write consolidated findings report**

Write `docs/reviews/consolidated-findings.md` with:

```markdown
# SoundCheck Beta Readiness — Consolidated Findings

## Summary
- Total findings: X
- Blocker: X | High: X | Medium: X | Low: X
- By domain: Security X, Backend X, API X, Mobile X, Infra X, E2E X, Performance X

## Blockers (must fix before beta)
[Each finding with ID, description, evidence, files, recommended fix]

## High Priority (fix within first beta week)
[...]

## Medium Priority (fix during beta)
[...]

## Low Priority (backlog)
[...]

## Systemic Patterns
[Cross-cutting themes observed across multiple squads]

## Domain-Specific Notes
[Any domain that needs special attention during Phase 3]
```

- [ ] **Step 6: Verify report completeness**

Cross-check: every finding ID from every Phase 1 and Phase 2 report appears in the consolidated report (either as its own entry or merged into a duplicate). No finding should be silently dropped.

---

## Phase 3 — Resolution & Certification

**Prerequisite:** Task 14 (consolidated findings) must be complete.

Phase 3 is iterative. Tasks 15-18 may loop until the Reality Checker certifies.

---

### Task 15: Fix Planning — Triage Blockers

**Agent type:** Backend Architect
**Output file:** Create: `docs/reviews/fix-plan.md`
**Prerequisite:** Task 14 complete

- [ ] **Step 1: Read consolidated findings report**

Read `docs/reviews/consolidated-findings.md`. Extract all Blocker-severity findings.

- [ ] **Step 2: Group blockers by domain and analyze dependencies**

For each blocker:
- Identify the domain: backend, mobile, security, infrastructure
- Determine if it depends on another fix (e.g., "fix the migration before fixing the service")
- Determine if it blocks other fixes

- [ ] **Step 3: Write fix specification for each blocker**

For each blocker, write:
```markdown
### Fix for [FINDING-ID]: [Title]
**Domain:** backend | mobile | security | infrastructure
**Root Cause:** [Why this issue exists]
**Files to Modify:**
- `exact/path/to/file.ts:line-range` — [what to change]
**Proposed Fix:** [Specific code changes or approach]
**Risk of Regression:** [What could break]
**Dependencies:** [Other fixes that must come first]
**Verification:** [How to confirm the fix works]
```

- [ ] **Step 4: Produce prioritized fix order**

Order all fixes by dependency (unblocking fixes first), then by severity impact.

Write the complete fix plan to `docs/reviews/fix-plan.md`.

---

### Task 16: Parallel Fix Implementation

**Agent types:** Senior Developer (x2), Security Engineer, DevOps Automator
**Prerequisite:** Task 15 complete
**Execution:** Each agent works in an isolated git worktree

- [ ] **Step 1: Read fix plan**

Each agent reads `docs/reviews/fix-plan.md` and claims their domain's blockers.

- [ ] **Step 2: Implement fixes (per agent, in worktree)**

**Senior Developer (Backend):**
- Fix all backend blockers per fix plan specifications
- Run `cd backend && npm test` after each fix
- Reference the finding ID in each commit message: `fix: resolve BE-XXX — [description]`

**Senior Developer (Mobile):**
- Fix all mobile blockers per fix plan specifications
- Run `cd mobile && flutter analyze && flutter test` after each fix
- Reference: `fix: resolve MOB-XXX — [description]`

**Security Engineer:**
- Fix all security blockers per fix plan specifications
- Run backend tests after each fix
- Reference: `fix: resolve SEC-XXX — [description]`

**DevOps Automator:**
- Fix all infrastructure blockers per fix plan specifications
- Verify CI pipeline, deployment config, monitoring
- Reference: `fix: resolve INF-XXX — [description]`

- [ ] **Step 3: Each agent verifies their own fixes pass tests**

Run full test suites:
- Backend: `cd backend && npm test`
- Mobile: `cd mobile && flutter test && flutter analyze`

---

### Task 17: Fix Verification

**Agent type:** Evidence Collector
**Output file:** Create: `docs/reviews/fix-verification.md`
**Prerequisite:** Task 16 complete (all fix branches merged)

- [ ] **Step 1: Run full test suites**

```bash
cd backend && npm test
cd mobile && flutter test && flutter analyze
```

Report results.

- [ ] **Step 2: Re-verify each blocker fix**

For each blocker in `docs/reviews/fix-plan.md`:
- Read the fix code
- Re-run the specific check that originally flagged the issue
- Collect before/after evidence
- Verify no regression in adjacent functionality

- [ ] **Step 3: Write fix verification report**

Write `docs/reviews/fix-verification.md` with:
- Each finding ID, fix status, verification evidence
- Full test suite results
- Any new issues introduced by fixes

---

### Task 18: Certification — Beta Readiness Report

**Agent type:** Reality Checker
**Output file:** Create: `docs/reviews/beta-readiness-report.md`
**Prerequisite:** Task 17 complete

- [ ] **Step 1: Read fix verification report**

Read `docs/reviews/fix-verification.md`.

- [ ] **Step 2: Verify all blockers are resolved**

For each original blocker:
1. Fix was implemented (code change exists)
2. Fix was verified with evidence
3. No regressions introduced

**If any blocker remains unresolved:** document it and flag for loop back to Task 16.

- [ ] **Step 3: Produce Beta Readiness Report**

Write `docs/reviews/beta-readiness-report.md`:

```markdown
# SoundCheck Beta Readiness Report

## Recommendation: GO / NO-GO

## Executive Summary
[2-3 paragraphs summarizing the review]

## Review Scope
- Phases completed: 1, 2, 3
- Total agents dispatched: X
- Total findings: X (Blocker: X, High: X, Medium: X, Low: X)

## Blocker Resolution
| Finding ID | Description | Status | Evidence |
|---|---|---|---|
| [all blockers listed with resolution status] |

## Remaining Issues (Post-Beta)
### High Priority (fix within first beta week)
[...]

### Medium Priority (fix during beta)
[...]

### Low Priority (backlog)
[...]

## Operational Readiness Checklist
- [ ] All required environment variables configured
- [ ] Sentry error tracking active
- [ ] UptimeRobot monitoring `/health`
- [ ] PostgreSQL backups configured
- [ ] Redis persistence verified
- [ ] CI/CD pipeline passing
- [ ] Rate limiting verified
- [ ] SSL/TLS certificates valid

## Known Limitations
[Things that won't be perfect at beta but are acceptable]

## Recommendation
[GO or NO-GO with detailed reasoning]
```

- [ ] **Step 4: If NO-GO, identify specific loop-back items**

If any blocker is unresolved, produce a specific list of items that need to loop back to Task 16, with clear instructions for the fix agents.

---

## Execution Notes

### Parallelism Map

```
PHASE 1 (all parallel):
  Task 1  ─┐
  Task 2  ─┤
  Task 3  ─┤
  Task 4  ─┼── all run simultaneously, no dependencies
  Task 5  ─┤
  Task 6  ─┤
  Task 7  ─┤
  Task 8  ─┤
  Task 9  ─┘
            │
            ▼ (barrier: all must complete)
PHASE 2 (parallel, then sequential):
  Task 10 ─┐
  Task 11 ─┼── parallel with each other
  Task 12 ─┤
  Task 13 ─┘
            │
            ▼ (barrier: all must complete)
  Task 14 ── sequential (consolidation)
            │
            ▼
PHASE 3 (sequential with loop):
  Task 15 ── fix planning
            │
            ▼
  Task 16 ── parallel fix implementation (worktrees)
            │
            ▼
  Task 17 ── fix verification
            │
            ▼
  Task 18 ── certification (loops to 16 if NO-GO)
```

### Agent-to-Task Mapping

| Agent Type | Tasks |
|---|---|
| Security Engineer | 1, 2, 16 (security fixes) |
| Backend Architect | 3, 4, 15 |
| API Tester | 5, 6 |
| Frontend Developer | 7, 8 |
| DevOps Automator | 9, 16 (infra fixes) |
| Evidence Collector | 10, 11, 17 |
| Performance Benchmarker | 12, 13 |
| Reality Checker | 14, 18 |
| Senior Developer | 16 (backend + mobile fixes) |

### Report File Structure

```
docs/reviews/
  phase1-security-backend.md
  phase1-security-mobile.md
  phase1-backend-services.md
  phase1-backend-database.md
  phase1-api-contracts.md
  phase1-api-auth-infra.md
  phase1-mobile-state.md
  phase1-mobile-ui.md
  phase1-infrastructure.md
  phase2-e2e-core-flows.md
  phase2-e2e-secondary-flows.md
  phase2-performance.md
  phase2-data-integrity.md
  consolidated-findings.md
  fix-plan.md
  fix-verification.md
  beta-readiness-report.md
```
