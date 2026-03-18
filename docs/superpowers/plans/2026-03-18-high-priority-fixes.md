# High-Priority Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 35 High-priority findings from the beta readiness review to strengthen the app for the first week of public invite-only beta. (CFR-API-002-004 deferred — AdminController was tombstoned in Phase 3, so input validation is moot until admin routes are rebuilt post-beta.)

**Architecture:** Fixes are grouped by domain into 14 tasks. Each task is independent and can be executed in any order. Tasks are ordered by user-impact: user-visible mobile fixes first, then security, then data integrity, then API robustness, then infrastructure, then performance.

**Tech Stack:** Node.js/Express/TypeScript backend, Flutter/Dart mobile, PostgreSQL, Redis, BullMQ

**Source:** `docs/reviews/consolidated-findings.md` (High Priority section)

---

## Task 1: Mobile — User-Visible UX Fixes

Fixes the most embarrassing user-facing issues that every beta tester will see.

**Files:**
- Modify: `mobile/lib/src/features/venues/presentation/venue_detail_screen.dart:999-1092`
- Modify: `mobile/lib/src/features/profile/presentation/edit_profile_screen.dart:72-151`
- Modify: `mobile/lib/src/core/router/app_router.dart:396,601,617`

- [ ] **Step 1: Remove hardcoded mock data from venue detail screen (CFR-MOB-056)**

Read `mobile/lib/src/features/venues/presentation/venue_detail_screen.dart`. Find the section around lines 999-1092 with hardcoded data (`'Sarah M.'`, `'Mike T.'`, `'Metallica'`, `'Ghost'`). This is the "Loyal Patrons" and "Frequently Performing Artists" section.

Replace the entire hardcoded section with a conditional that hides these sections when real data is not available:

```dart
// Remove or comment out the hardcoded _buildLoyalPatrons and _buildFrequentArtists
// sections. Replace with a check for real data:
if (venue.topPatrons != null && venue.topPatrons!.isNotEmpty)
  _buildLoyalPatrons(venue.topPatrons!),
if (venue.frequentBands != null && venue.frequentBands!.isNotEmpty)
  _buildFrequentArtists(venue.frequentBands!),
```

If the venue model doesn't have these fields yet, simply remove/comment out the entire mock sections. They can be added back when the API endpoint exists.

- [ ] **Step 2: Run dart analyze to verify**

Run: `cd mobile && dart analyze lib/src/features/venues/presentation/venue_detail_screen.dart`
Expected: No new errors from this change

- [ ] **Step 3: Fix profile image upload (CFR-MOB-064)**

Read `mobile/lib/src/features/profile/presentation/edit_profile_screen.dart`. Find `_saveProfile()` (around line 72) and `_selectedImage` (line 25).

The issue: `_saveProfile()` never references `_selectedImage`. The user picks an image but it's never uploaded.

Add image upload logic to `_saveProfile()` before the profile update call:

```dart
String? newAvatarUrl;
if (_selectedImage != null) {
  // Upload image via the existing upload API
  newAvatarUrl = await ref.read(uploadServiceProvider).uploadImage(_selectedImage!);
}
```

Then include `newAvatarUrl` in the profile update payload. If `uploadServiceProvider` doesn't exist, check for the existing upload mechanism in the codebase (search for `R2`, `presigned`, or `uploadImage` in mobile/lib/).

- [ ] **Step 4: Fix celebration route crash on deep link (CFR-MOB-002)**

Read `mobile/lib/src/core/router/app_router.dart:396`. Find the `CelebrationParams` cast.

Replace:
```dart
final params = state.extra as CelebrationParams;
```

With:
```dart
final extra = state.extra;
if (extra is! CelebrationParams) {
  return const Redirect('/feed');
}
final params = extra;
```

- [ ] **Step 5: Fix int.parse crash on wrapped deep link (CFR-027)**

In the same file (`app_router.dart`), find `int.parse` at lines 601 and 617.

Replace all instances of:
```dart
int.parse(state.pathParameters['year']!)
```

With:
```dart
int.tryParse(state.pathParameters['year'] ?? '') ?? DateTime.now().year
```

- [ ] **Step 6: Fix missing /venues/:id/shows route (CFR-MOB-005)**

Search `venue_detail_screen.dart` for navigation to `/venues/:id/shows` or similar. If the screen navigates to a route that doesn't exist in `app_router.dart`, either:
- Add the route to `app_router.dart` pointing to the venue's events/shows screen, OR
- Change the navigation to use a modal/bottom sheet instead of a route

- [ ] **Step 7: Run analysis and commit**

Run: `cd mobile && dart analyze`
Expected: No new errors

```bash
git add mobile/lib/src/features/venues/presentation/venue_detail_screen.dart \
  mobile/lib/src/features/profile/presentation/edit_profile_screen.dart \
  mobile/lib/src/core/router/app_router.dart
git commit -m "fix: resolve CFR-MOB-056, CFR-MOB-064, CFR-MOB-002, CFR-027, CFR-MOB-005 — user-visible UX fixes

Remove hardcoded mock data from venue detail, wire profile image
upload, guard celebration route cast, use int.tryParse for wrapped
deep links, add missing venue shows route.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Mobile — const/Theme.of(context) Pattern Fix

Batch fix for the pervasive `const` + `Theme.of(context)` pattern across 6+ files.

**Files:**
- Modify: `mobile/lib/src/shared/widgets/band_card.dart:166`
- Modify: `mobile/lib/src/shared/widgets/venue_card.dart:159`
- Modify: `mobile/lib/src/features/feed/presentation/widgets/feed_card.dart:168-382`
- Modify: `mobile/lib/src/features/feed/presentation/widgets/new_checkins_banner.dart:93`
- Modify: `mobile/lib/src/features/feed/presentation/feed_screen.dart:111`
- Modify: `mobile/lib/src/features/venues/presentation/venue_detail_screen.dart:335`
- Search for additional instances in: `mobile/lib/src/features/auth/`, `mobile/lib/src/features/checkins/`

- [ ] **Step 1: Search for all const/Theme.of(context) violations (CFR-MOB-050-055)**

Run a search across the mobile codebase:
```
grep -rn "const.*Theme\.of\|const.*ColorScheme\|const.*TextTheme" mobile/lib/src/
```

Also search for the reverse pattern (Theme.of inside const constructor):
```
grep -B5 "Theme\.of(context)" mobile/lib/src/ | grep "const "
```

Catalog every instance.

- [ ] **Step 2: Remove const keyword from all affected widgets**

For each instance found, remove the `const` keyword from the widget constructor that contains `Theme.of(context)`. For example:

Change:
```dart
const Text('Hello', style: TextStyle(color: Theme.of(context).colorScheme.primary))
```
To:
```dart
Text('Hello', style: TextStyle(color: Theme.of(context).colorScheme.primary))
```

Work through each file in the list. There are approximately 15-20 instances across 6-10 files.

- [ ] **Step 3: Run analysis and commit**

Run: `cd mobile && dart analyze`
Expected: Fewer warnings/errors than before

Stage only the specific files you modified (list them explicitly), then commit:

```bash
git add mobile/lib/src/shared/widgets/band_card.dart \
  mobile/lib/src/shared/widgets/venue_card.dart \
  mobile/lib/src/features/feed/presentation/widgets/feed_card.dart \
  mobile/lib/src/features/feed/presentation/widgets/new_checkins_banner.dart \
  mobile/lib/src/features/feed/presentation/feed_screen.dart \
  mobile/lib/src/features/venues/presentation/venue_detail_screen.dart
git commit -m "fix: resolve CFR-MOB-050-055 — remove const from widgets using Theme.of(context)

Batch fix across band_card, venue_card, feed_card, new_checkins_banner,
feed_screen, venue_detail_screen, and additional affected files.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Mobile — Security Hardening

Fixes security gaps in the mobile app that could leak data or leave sessions in bad state.

**Files:**
- Modify: `mobile/lib/src/core/services/crash_reporting_service.dart:57`
- Modify: `mobile/lib/src/features/subscription/presentation/subscription_service.dart:22`
- Modify: `mobile/lib/src/core/services/websocket_service.dart:67-68,152-153`
- Modify: `mobile/lib/src/core/providers/providers.dart` (logout method)
- Modify: `mobile/lib/src/features/auth/data/auth_repository.dart` (logout method)

- [ ] **Step 1: Disable Sentry screenshots in production (CFR-SEC-053)**

Read `mobile/lib/src/core/services/crash_reporting_service.dart`. Find `attachScreenshot = true` around line 57.

Change to:
```dart
options.attachScreenshot = !kReleaseMode;
```

Add `import 'package:flutter/foundation.dart';` if not already imported.

- [ ] **Step 2: Gate RevenueCat log level on build mode (CFR-SEC-054)**

Read `mobile/lib/src/features/subscription/presentation/subscription_service.dart`. Find `LogLevel.debug` at line 22.

Change to:
```dart
await Purchases.setLogLevel(kDebugMode ? LogLevel.debug : LogLevel.error);
```

- [ ] **Step 3: Clear WebSocket auth token after authentication (CFR-SEC-055)**

Read `mobile/lib/src/core/services/websocket_service.dart`. Find `_authToken` field usage.

After the WebSocket authenticates successfully (after sending the auth message and receiving confirmation), clear the in-memory token:
```dart
_authToken = null;
```

For reconnection, re-read the token from secure storage instead of using the cached field.

- [ ] **Step 4: Clear Sentry and analytics context on logout (CFR-SEC-051)**

Read `mobile/lib/src/core/providers/providers.dart`. Find the logout method (already modified by Phase 3 fixes — look for `_clearUserData`).

Add to the logout flow:
```dart
Sentry.configureScope((scope) => scope.setUser(null));
// If analytics service exists:
// AnalyticsService.clearUserId();
```

- [ ] **Step 5: Clear refresh token on logout (CFR-028)**

Read `mobile/lib/src/features/auth/data/auth_repository.dart`. Find the logout method.

Add:
```dart
await _secureStorage.delete(key: 'refresh_token');
```

alongside the existing `auth_token` deletion.

- [ ] **Step 6: Run analysis and commit**

Run: `cd mobile && dart analyze`

```bash
git add mobile/lib/src/core/services/crash_reporting_service.dart \
  mobile/lib/src/features/subscription/presentation/subscription_service.dart \
  mobile/lib/src/core/services/websocket_service.dart \
  mobile/lib/src/core/providers/providers.dart \
  mobile/lib/src/features/auth/data/auth_repository.dart
git commit -m "fix: resolve CFR-SEC-051,053,054,055,028 — mobile security hardening

Disable Sentry screenshots in release, gate RevenueCat logging,
clear WS token from memory after auth, clear Sentry user and
refresh_token on logout.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Backend — Block Filter Coverage

Adds block user filtering to the 3 surfaces where it's missing: event feed, notifications, and search.

**Files:**
- Modify: `backend/src/services/FeedService.ts:158-227`
- Modify: `backend/src/services/NotificationService.ts`
- Modify: `backend/src/services/SearchService.ts`

- [ ] **Step 1: Add block filter to event feed (CFR-038)**

Read `backend/src/services/FeedService.ts`. Find `getEventFeed()` starting around line 158. Note that other feed methods (globalFeed, friendsFeed) already call `getBlockFilterSQL()`.

Add the same block filter pattern to `getEventFeed()`. This requires:
1. Accept `userId` parameter (if not already)
2. Call `this.blockService.getBlockFilterSQL(userId)` (or however the existing feed methods do it)
3. Add the filter to the WHERE clause

Follow the exact pattern used by `getGlobalFeed()` or `getFriendsFeed()` in the same file.

Also fix the hardcoded `false AS has_user_toasted` — compute the actual toast status.

- [ ] **Step 2: Add block filter to notification query (CFR-E2E-055)**

Read `backend/src/services/NotificationService.ts`. Find the notification query method.

Add block filter to exclude notifications from blocked users. Import BlockService if needed:
```typescript
const blockFilter = await this.blockService.getBlockFilterSQL(userId);
```

Add to the WHERE clause of the notification query.

- [ ] **Step 3: Add block filter to search (CFR-E2E-066)**

Read `backend/src/services/SearchService.ts`. Find user and checkin search methods.

Add block filter to user search results and any checkin search results. Import BlockService:
```typescript
import { BlockService } from './BlockService';
```

Add `getBlockFilterSQL(userId)` to WHERE clauses of relevant search queries.

- [ ] **Step 4: Run tests and commit**

Run: `cd backend && npm test`
Expected: All tests pass

```bash
git add backend/src/services/FeedService.ts \
  backend/src/services/NotificationService.ts \
  backend/src/services/SearchService.ts
git commit -m "fix: resolve CFR-038, CFR-E2E-055, CFR-E2E-066 — complete block filter coverage

Add block user filtering to event feed, notification query, and
search results. All feed surfaces now consistently filter blocked
users.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Backend — Security Hardening

Backend security fixes for JWT, social auth, CORS, and PII.

**Files:**
- Modify: `backend/src/utils/auth.ts:24`
- Modify: `backend/src/services/SocialAuthService.ts:170-176`
- Modify: `backend/src/index.ts:71,127`
- Modify: `backend/src/middleware/auth.ts:60`

- [ ] **Step 1: Reduce JWT expiry from 7 days to 30 minutes (CFR-032)**

Read `backend/src/utils/auth.ts`. Find `JWT_EXPIRES_IN` at line 24.

Change:
```typescript
const JWT_EXPIRES_IN = '7d';
```
To:
```typescript
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30m';
```

This makes the token short-lived. The refresh token mechanism (already implemented) handles session continuity. Verify the refresh token endpoint exists in `backend/src/routes/tokenRoutes.ts`.

- [ ] **Step 2: Require email ownership proof for social auth linking (CFR-SEC-003)**

Read `backend/src/services/SocialAuthService.ts`. Find the auto-linking logic (around line 170-176) where a social auth email matches an existing account.

Add a guard: when a social account email matches an existing password-auth account, require the user to confirm ownership before linking. Options:

A) **Safest for beta:** Don't auto-link. Create a new account with the social auth and let the user merge later:
```typescript
// If existing user has password auth, don't auto-link — create separate account
if (existingUser && existingUser.passwordHash) {
  // Create new user with social provider instead of linking
  return this.createNewSocialUser(profile, provider);
}
```

B) **Or** require re-authentication: return a `linking_required` response that the mobile app handles by prompting for the existing account password.

Choose option A for simplicity — it's safer for beta. Users can contact support to merge accounts.

- [ ] **Step 3: Make CORS_ORIGIN required in production (CFR-SEC-018)**

Read `backend/src/index.ts`. Find `requiredEnvVars` around line 71.

The current `requiredEnvVars` likely checks `DATABASE_URL` and `JWT_SECRET`. Add conditional CORS check:
```typescript
if (process.env.NODE_ENV === 'production') {
  // CORS_ORIGIN is not strictly needed for mobile-only API, but ensure it's intentional
  if (!process.env.CORS_ORIGIN) {
    winstonLogger.warn('CORS_ORIGIN not set in production — defaulting to mobile-only mode (no origin required)');
  }
}
```

**Intentional deviation from spec:** The consolidated findings recommended adding CORS_ORIGIN to `requiredEnvVars`. For a mobile-only API, CORS is less critical since mobile apps don't send Origin headers — a warning is more appropriate than a hard startup failure. If a web client is added later, this should be revisited.

- [ ] **Step 4: Remove PII (email) from Sentry user context (CFR-013)**

Read `backend/src/middleware/auth.ts:60`. Find the `Sentry.setUser()` call.

Change:
```typescript
Sentry.setUser({ id: user.id, email: user.email, username: user.username });
```
To:
```typescript
Sentry.setUser({ id: user.id, username: user.username });
```

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npm test`

```bash
git add backend/src/utils/auth.ts \
  backend/src/services/SocialAuthService.ts \
  backend/src/index.ts \
  backend/src/middleware/auth.ts
git commit -m "fix: resolve CFR-032, CFR-SEC-003, CFR-SEC-018, CFR-013 — backend security hardening

Reduce JWT expiry to 30m (refresh tokens handle continuity),
prevent auto-linking social auth to password accounts,
warn on missing CORS_ORIGIN in production,
remove email from Sentry user context.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Backend — Data Integrity Fixes

Transaction wrapping, trigger improvements, FK fixes, and rating accuracy.

**Files:**
- Modify: `backend/src/services/checkin/CheckinToastService.ts:29-41`
- Modify: `backend/src/services/checkin/CheckinRatingService.ts:34-125`
- Create: `backend/migrations/045_fix-data-integrity.ts`
- Modify: `backend/src/services/StatsService.ts:64`

- [ ] **Step 1: Fix toast TOCTOU race with UNIQUE + ON CONFLICT (CFR-BE-001)**

Read `backend/src/services/checkin/CheckinToastService.ts`. Find the existing toast check at line 30.

The current pattern is: SELECT to check → INSERT if not exists (race window between SELECT and INSERT).

Replace with atomic upsert:
```typescript
const result = await this.db.query(
  `INSERT INTO toasts (checkin_id, user_id, created_at)
   VALUES ($1, $2, NOW())
   ON CONFLICT (checkin_id, user_id) DO NOTHING
   RETURNING id`,
  [checkinId, userId]
);
// result.rows.length === 0 means duplicate (already toasted)
```

This requires a UNIQUE constraint on `(checkin_id, user_id)`. Add it in the migration (Step 3).

- [ ] **Step 2: Wrap rating updates in transaction (CFR-BE-002)**

Read `backend/src/services/checkin/CheckinRatingService.ts`. Find the rating update logic (lines 34-125).

Wrap all writes in a transaction:
```typescript
const client = await this.db.getClient();
try {
  await client.query('BEGIN');
  // ... existing rating INSERT/UPDATE logic using client instead of this.db ...
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

- [ ] **Step 3: Create migration for data integrity fixes**

Create `backend/migrations/045_fix-data-integrity.ts` with:

```typescript
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // CFR-BE-001: UNIQUE constraint for toasts
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_toasts_checkin_user
    ON toasts (checkin_id, user_id);
  `);

  // CFR-DI-002: Add UPDATE handler to stats trigger
  // (The existing trigger only has INSERT and DELETE — add UPDATE for user_id changes)
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_checkin_stats()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE users SET total_checkins = total_checkins + 1 WHERE id = NEW.user_id;
        UPDATE events SET total_checkins = total_checkins + 1 WHERE id = NEW.event_id;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET total_checkins = GREATEST(total_checkins - 1, 0) WHERE id = OLD.user_id;
        UPDATE events SET total_checkins = GREATEST(total_checkins - 1, 0) WHERE id = OLD.event_id;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // CFR-025: Fix rating=0 polluting averages
  // Update band/venue average_rating triggers to exclude rating=0
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_band_average_rating()
    RETURNS TRIGGER AS $$
    BEGIN
      UPDATE bands SET average_rating = (
        SELECT COALESCE(AVG(rating), 0)
        FROM checkin_band_ratings
        WHERE band_id = COALESCE(NEW.band_id, OLD.band_id)
        AND rating > 0
      ) WHERE id = COALESCE(NEW.band_id, OLD.band_id);
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_venue_average_rating()
    RETURNS TRIGGER AS $$
    BEGIN
      UPDATE venues SET average_rating = (
        SELECT COALESCE(AVG(venue_rating), 0)
        FROM checkins
        WHERE venue_id = COALESCE(NEW.venue_id, OLD.venue_id)
        AND venue_rating > 0
      ) WHERE id = COALESCE(NEW.venue_id, OLD.venue_id);
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // CFR-DI-006: Fix events.created_by_user_id FK to allow user deletion
  pgm.sql(`
    ALTER TABLE events
    DROP CONSTRAINT IF EXISTS events_created_by_user_id_fkey;

    ALTER TABLE events
    ADD CONSTRAINT events_created_by_user_id_fkey
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS idx_toasts_checkin_user;`);
  // Trigger changes are not easily reversible — leave as-is
}
```

**WARNING: The SQL above is PSEUDOCODE showing only the pattern.** You MUST read the actual existing trigger functions first (in migrations 009 and 037) to get the full logic. The real triggers manage additional columns (unique_bands, unique_venues, total_toasts, etc.) that the pseudocode above omits. Copy the full existing trigger body, then add the missing UPDATE handler and rating>0 filter. Deploying the simplified version above would silently regress the trigger and break stat tracking.

- [ ] **Step 4: Align StatsService with trigger logic (CFR-E2E-016)**

Read `backend/src/services/StatsService.ts:64`. Find where `unique_bands` is computed.

The trigger counts only the headliner `band_id` on checkins. StatsService counts all bands from `checkin_band_ratings`. These must agree.

Decision: The `checkin_band_ratings` approach (StatsService) is more accurate — it counts all rated bands, not just headliners. Update the trigger to match, OR have StatsService read the denormalized column and only recompute on cache miss.

Simplest fix: Make StatsService read the denormalized columns instead of recomputing:
```typescript
// Instead of:
const uniqueBands = await this.db.query('SELECT COUNT(DISTINCT ...) FROM checkin_band_ratings...');
// Use:
const stats = await this.db.query('SELECT total_checkins, unique_band_count, unique_venue_count FROM users WHERE id = $1', [userId]);
```

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npm test`

```bash
git add backend/src/services/checkin/CheckinToastService.ts \
  backend/src/services/checkin/CheckinRatingService.ts \
  backend/migrations/045_fix-data-integrity.ts \
  backend/src/services/StatsService.ts
git commit -m "fix: resolve CFR-BE-001,002, CFR-DI-002,006, CFR-025, CFR-E2E-016 — data integrity

Add UNIQUE constraint for toasts, wrap ratings in transaction,
add UPDATE handler to stats trigger, filter rating=0 from averages,
fix FK on events.created_by_user_id, align StatsService with
denormalized columns.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Backend — API Safety

Fixes crash risks from non-null assertions and improves error handling consistency.

**Files:**
- Modify: `backend/src/controllers/SubscriptionController.ts`
- Modify: `backend/src/controllers/BlockController.ts`
- Modify: `backend/src/controllers/WrappedController.ts`
- Modify: `backend/src/middleware/auth.ts:109-134`
- Modify: `backend/src/index.ts:169-197`
- Modify: `backend/src/config/database.ts`

- [ ] **Step 1: Replace req.user! non-null assertions with defensive checks (CFR-017)**

Read `backend/src/controllers/SubscriptionController.ts`. Find `req.user!.id` at line 57.
Read `backend/src/controllers/BlockController.ts`. Find `req.user!.id` at lines 19, 46, 75, 101.
Read `backend/src/controllers/WrappedController.ts`. Find `req.user!.id` at lines 16, 32, 48, 78.

In each controller method, replace:
```typescript
const userId = req.user!.id;
```
With:
```typescript
const userId = req.user?.id;
if (!userId) {
  return res.status(401).json({ error: 'Authentication required' });
}
```

- [ ] **Step 2: Clean up requireOwnership middleware (CFR-API-052)**

Read `backend/src/middleware/auth.ts:109-134`. The `requireOwnership` middleware is defined but never used.

For beta, remove the dead code to reduce confusion:
```typescript
// Delete the requireOwnership function (lines 109-134)
// It can be re-implemented when needed post-beta
```

Or if you prefer to keep it, add a comment explaining it's available but not yet wired.

- [ ] **Step 3: Add Redis ping and timeout to health check (CFR-API-053, CFR-API-054)**

Read `backend/src/index.ts:169-197`. Find the health check endpoint.

Add Redis connectivity check and a timeout:
```typescript
app.get('/health', async (req, res) => {
  const timeout = setTimeout(() => {
    res.status(503).json({ status: 'timeout', db: 'unknown', redis: 'unknown' });
  }, 5000);

  try {
    const [dbResult, redisResult] = await Promise.all([
      db.query('SELECT 1').then(() => 'ok').catch(() => 'error'),
      redis.ping().then(() => 'ok').catch(() => 'error'),
    ]);

    clearTimeout(timeout);
    const status = dbResult === 'ok' && redisResult === 'ok' ? 'healthy' : 'degraded';
    res.json({
      status,
      db: dbResult,
      redis: redisResult,
      // keep existing pushNotifications field from Phase 3 fix
    });
  } catch (error) {
    clearTimeout(timeout);
    res.status(503).json({ status: 'error' });
  }
});
```

- [ ] **Step 4: Run tests and commit**

Run: `cd backend && npm test`

```bash
git add backend/src/controllers/SubscriptionController.ts \
  backend/src/controllers/BlockController.ts \
  backend/src/controllers/WrappedController.ts \
  backend/src/middleware/auth.ts \
  backend/src/index.ts
git commit -m "fix: resolve CFR-017, CFR-API-052,053,054 — API safety and health check

Replace req.user! assertions with defensive checks, remove unused
requireOwnership middleware, add Redis ping and 5s timeout to
health check.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Backend — Infrastructure Hardening

Fixes for graceful shutdown, BullMQ reliability, and error visibility.

**Files:**
- Modify: `backend/src/index.ts:370-396`
- Modify: `backend/src/jobs/notificationWorker.ts:56-57`
- Modify: `backend/src/jobs/badgeWorker.ts`
- Modify: `backend/src/jobs/eventSyncWorker.ts`
- Modify: `backend/src/jobs/moderationWorker.ts`

- [ ] **Step 1: Add server.close() to graceful shutdown (CFR-INF-003)**

Read `backend/src/index.ts`. Find the SIGTERM/SIGINT handler (around line 370-396).

Add `server.close()` as the FIRST step before closing other resources:
```typescript
process.on('SIGTERM', async () => {
  winstonLogger.info('SIGTERM received, starting graceful shutdown');
  server.close(() => {
    winstonLogger.info('HTTP server closed');
  });
  // ... existing cleanup (Redis, BullMQ, etc.) ...
});
```

- [ ] **Step 2: Fix notification worker LRANGE+DEL atomicity (CFR-INF-004)**

Read `backend/src/jobs/notificationWorker.ts`. Find the LRANGE+DEL at lines 56-57.

Replace with atomic Lua script or MULTI/EXEC:
```typescript
const multi = redis.multi();
multi.lrange(key, 0, -1);
multi.del(key);
const results = await multi.exec();
const tokens = results[0][1] as string[];
```

- [ ] **Step 3: Configure BullMQ lock duration on all workers (CFR-INF-005)**

Read each worker file and add appropriate `lockDuration` to the Worker constructor options:

```typescript
// eventSyncWorker.ts — long-running sync jobs
new Worker('event-sync', processor, { connection, lockDuration: 300000 }); // 5 minutes

// badgeWorker.ts — moderate evaluation
new Worker('badge-evaluation', processor, { connection, lockDuration: 60000 }); // 1 minute

// moderationWorker.ts — image processing
new Worker('moderation', processor, { connection, lockDuration: 60000 }); // 1 minute

// notificationWorker.ts — quick sends
new Worker('notifications', processor, { connection, lockDuration: 30000 }); // 30 seconds
```

- [ ] **Step 4: Wire BullMQ workers to Sentry (CFR-037)**

In each of the 4 worker files, add Sentry error reporting in the `failed` event handler:

```typescript
import * as Sentry from '@sentry/node';

worker.on('failed', (job, err) => {
  winstonLogger.error(`Job ${job?.id} failed`, { error: err.message });
  Sentry.captureException(err, {
    tags: { queue: 'badge-evaluation', jobId: job?.id },
  });
});
```

Apply to: `badgeWorker.ts`, `eventSyncWorker.ts`, `moderationWorker.ts`, `notificationWorker.ts`.

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npm test`

```bash
git add backend/src/index.ts \
  backend/src/jobs/notificationWorker.ts \
  backend/src/jobs/badgeWorker.ts \
  backend/src/jobs/eventSyncWorker.ts \
  backend/src/jobs/moderationWorker.ts
git commit -m "fix: resolve CFR-INF-003,004,005, CFR-037 — infrastructure hardening

Add server.close() to graceful shutdown, make notification worker
LRANGE+DEL atomic, configure BullMQ lockDuration per worker,
wire all workers to Sentry for error visibility.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Backend — Performance Indexes & Caching

Database indexes and Redis caching for endpoints at risk of exceeding 500ms at beta scale.

**Files:**
- Create: `backend/migrations/046_performance-indexes.ts`
- Modify: `backend/src/services/BadgeService.ts:296-310`
- Modify: `backend/src/services/WrappedService.ts`
- Modify: `backend/src/services/TrendingService.ts`

- [ ] **Step 1: Create performance indexes migration (CFR-DB-007, CFR-PERF-003)**

Create `backend/migrations/046_performance-indexes.ts`:

```typescript
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // CFR-DB-007: Feed cursor pagination index
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkins_created_id
    ON checkins (created_at DESC, id DESC);
  `);

  // CFR-PERF-003: Feed EXISTS subquery optimization
  pgm.sql(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_badges_user_earned
    ON user_badges (user_id, earned_at DESC);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS idx_checkins_created_id;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_user_badges_user_earned;`);
}
```

- [ ] **Step 2: Fix badge leaderboard N+1 query (CFR-DB-008)**

Read `backend/src/services/BadgeService.ts`. Find the leaderboard method (around line 296-310).

Replace the N+1 pattern (1 query for users + N queries for badge counts) with a single query:
```sql
SELECT u.id, u.username, u.avatar_url, COUNT(ub.id) as badge_count
FROM users u
JOIN user_badges ub ON ub.user_id = u.id
GROUP BY u.id, u.username, u.avatar_url
ORDER BY badge_count DESC
LIMIT $1
```

Or use the denormalized `badge_count` column if one exists on users.

- [ ] **Step 3: Add Redis caching to WrappedService (CFR-PERF-004)**

Read `backend/src/services/WrappedService.ts`. Find the aggregate query methods.

Add caching with 1-hour TTL:
```typescript
const cacheKey = `wrapped:${userId}:${year}`;
const cached = await cache.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... existing 9 aggregate queries ...

await cache.set(cacheKey, JSON.stringify(result), 3600); // 1 hour
return result;
```

Import the cache utility used elsewhere in the codebase.

- [ ] **Step 4: Add Redis caching to TrendingService (CFR-PERF-007)**

Read `backend/src/services/TrendingService.ts`. Find the trending query.

Add caching with 2-minute TTL (trending data changes slowly):
```typescript
const cacheKey = `trending:${region}:${page}`;
const cached = await cache.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... existing query ...

await cache.set(cacheKey, JSON.stringify(result), 120); // 2 minutes
return result;
```

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npm test`

```bash
git add backend/migrations/046_performance-indexes.ts \
  backend/src/services/BadgeService.ts \
  backend/src/services/WrappedService.ts \
  backend/src/services/TrendingService.ts
git commit -m "fix: resolve CFR-DB-007,008, CFR-PERF-003,004,007 — performance indexes and caching

Add composite indexes for feed cursor and badge queries, fix badge
leaderboard N+1 with single query, add Redis caching to Wrapped
(1hr TTL) and Trending (2min TTL) endpoints.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Backend — Remaining Performance Fixes

Notification query optimization and discovery query protection.

**Files:**
- Modify: `backend/src/services/NotificationService.ts`
- Modify: `backend/src/services/UserDiscoveryService.ts`

- [ ] **Step 1: Optimize notification query (CFR-PERF-005)**

Read `backend/src/services/NotificationService.ts`. Find the notification query that joins 8 tables with 3 serial queries.

Fold the serial count queries into the main query using window functions or subqueries:
```sql
SELECT n.*,
  COUNT(*) OVER() as total_count
FROM notifications n
-- ... existing JOINs ...
WHERE n.user_id = $1
ORDER BY n.created_at DESC
LIMIT $2 OFFSET $3
```

This eliminates 2 of the 3 serial queries.

- [ ] **Step 2: Add LIMIT to UserDiscovery CTEs (CFR-PERF-006)**

Read `backend/src/services/UserDiscoveryService.ts`. Find the recommendation query.

Add LIMIT clauses to CTEs to prevent unbounded scans:
```sql
WITH user_genres AS (
  SELECT ... FROM ... WHERE user_id = $1 LIMIT 100
),
genre_matches AS (
  SELECT ... FROM ... LIMIT 500
)
```

The existing cache already mitigates the hot path; this protects the cold-cache case.

- [ ] **Step 3: Run tests and commit**

Run: `cd backend && npm test`

```bash
git add backend/src/services/NotificationService.ts \
  backend/src/services/UserDiscoveryService.ts
git commit -m "fix: resolve CFR-PERF-005,006 — notification and discovery query optimization

Fold serial count queries into main notification query via window
function, add LIMIT to UserDiscovery CTEs for cold-cache protection.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Backend — Miscellaneous Fixes

Quick fixes for remaining High-priority backend issues.

**Files:**
- Modify: `backend/src/services/R2Service.ts`
- Modify: `backend/src/services/TicketmasterAdapter.ts:44-45`
- Modify: `backend/src/services/EventService.ts:548-552`
- Modify: `backend/src/services/checkin/CheckinQueryService.ts:119-125`

- [ ] **Step 1: Fix R2Service naming confusion (CFR-BE-006)**

Read `backend/src/services/R2Service.ts`. Find the getter that causes confusion.

Rename to clarify intent:
```typescript
// Change from private getter name to clear public API
get isConfigured(): boolean { ... }
// or
isReady(): boolean { ... }
```

- [ ] **Step 2: Move Ticketmaster counter to Redis (CFR-BE-007)**

Read `backend/src/services/TicketmasterAdapter.ts`. Find the in-memory daily counter at lines 44-45.

Replace with Redis-backed counter:
```typescript
private async incrementDailyCount(): Promise<number> {
  const key = `ticketmaster:daily:${new Date().toISOString().slice(0, 10)}`;
  const count = await this.redis.incr(key);
  if (count === 1) {
    // Set expiry to end of UTC day + buffer
    await this.redis.expireat(key, Math.floor(Date.now() / 86400000 + 1) * 86400);
  }
  return count;
}
```

- [ ] **Step 3: Fix Haversine NaN at identical coordinates (CFR-BE-008)**

Read `backend/src/services/EventService.ts:548-552` and `backend/src/services/checkin/CheckinQueryService.ts:119-125`.

In both files, find the acos() call in the Haversine formula. Wrap with LEAST/GREATEST to clamp:
```sql
acos(LEAST(GREATEST(
  sin(radians($1)) * sin(radians(lat)) +
  cos(radians($1)) * cos(radians(lat)) * cos(radians(lon) - radians($2))
, -1), 1)) * 6371
```

- [ ] **Step 4: Run tests and commit**

Run: `cd backend && npm test`

```bash
git add backend/src/services/R2Service.ts \
  backend/src/services/TicketmasterAdapter.ts \
  backend/src/services/EventService.ts \
  backend/src/services/checkin/CheckinQueryService.ts
git commit -m "fix: resolve CFR-BE-006,007,008 — R2 naming, Redis counter, Haversine NaN

Rename R2Service getter for clarity, move Ticketmaster daily counter
to Redis (survives deploys), clamp Haversine acos argument to prevent
NaN at identical coordinates.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Backend — Input Validation (Priority Controllers)

Add Zod validation to the 5 highest-risk controllers. This is the largest task — the remaining 15 controllers can be done during beta.

**Files:**
- Modify: `backend/src/routes/checkinRoutes.ts`
- Modify: `backend/src/routes/eventRoutes.ts`
- Modify: `backend/src/routes/bandRoutes.ts`
- Modify: `backend/src/routes/venueRoutes.ts`
- Modify: `backend/src/routes/claimRoutes.ts`
- Modify: `backend/src/middleware/validate.ts` (if schema location changes needed)

- [ ] **Step 1: Read existing validation patterns**

Read `backend/src/middleware/validate.ts` to understand the validation middleware.
Read `backend/src/routes/reportRoutes.ts` and `backend/src/routes/moderationRoutes.ts` — these have inline Zod schemas that work correctly. Follow their pattern.

- [ ] **Step 2: Add Zod schemas to checkinRoutes (CFR-API-006, highest priority)**

Read `backend/src/routes/checkinRoutes.ts` and `backend/src/controllers/CheckinController.ts`.

Add Zod validation for the create check-in endpoint:
```typescript
import { z } from 'zod';
import { validate } from '../middleware/validate';

const createCheckinSchema = z.object({
  body: z.object({
    eventId: z.string().uuid(),
    venueRating: z.number().min(0).max(5).step(0.5).optional(),
    comment: z.string().max(2000).optional(),
    bandRatings: z.array(z.object({
      bandId: z.string().uuid(),
      rating: z.number().min(0).max(5).step(0.5),
    })).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
});

router.post('/', authenticateToken, checkinRateLimit, validate(createCheckinSchema), controller.createEventCheckin);
```

- [ ] **Step 3: Add Zod schemas to eventRoutes (CFR-API-007)**

Add validation for event creation and update endpoints. Key fields:
```typescript
const createEventSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(500),
    venueId: z.string().uuid(),
    date: z.string().datetime(),
    description: z.string().max(5000).optional(),
    bandIds: z.array(z.string().uuid()).optional(),
  }),
});
```

- [ ] **Step 4: Add Zod schemas to bandRoutes and venueRoutes (CFR-API-008, CFR-API-009)**

Add validation for create/update endpoints on bands and venues. Key fields to validate:
- Band: name (string, max 500), genres (array of strings), external links
- Venue: name, address, latitude/longitude (range validation), capacity (positive int)

- [ ] **Step 5: Add Zod schema to claimRoutes (CFR-040)**

Add validation for claim submission:
```typescript
const submitClaimSchema = z.object({
  body: z.object({
    entityType: z.enum(['venue', 'band']),
    entityId: z.string().uuid(),
    evidence: z.string().min(10).max(5000),
    contactEmail: z.string().email().optional(),
  }),
});
```

- [ ] **Step 6: Run tests and commit**

Run: `cd backend && npm test`

```bash
git add backend/src/routes/checkinRoutes.ts \
  backend/src/routes/eventRoutes.ts \
  backend/src/routes/bandRoutes.ts \
  backend/src/routes/venueRoutes.ts \
  backend/src/routes/claimRoutes.ts
git commit -m "fix: resolve CFR-API-006,007,008,009,040 — Zod validation on priority controllers

Add input validation schemas to checkin, event, band, venue, and
claim routes. Covers the 5 highest-risk controllers. Remaining 15
controllers to be validated during beta.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Backend — Error Response Consistency

Standardizes the 3 different error response shapes into one consistent format.

**Files:**
- Modify: `backend/src/middleware/validate.ts`
- Modify: `backend/src/index.ts` (global error handler)
- Modify: Multiple controllers (as needed)

- [ ] **Step 1: Define the canonical error response format (CFR-API-013)**

Read `backend/src/middleware/validate.ts` (validation errors), any controller that returns errors, and the global error handler in `backend/src/index.ts`.

The canonical format should be:
```typescript
{
  error: {
    code: string;      // e.g., 'VALIDATION_ERROR', 'NOT_FOUND', 'UNAUTHORIZED'
    message: string;   // Human-readable message
    details?: any;     // Optional — validation field errors, etc.
  }
}
```

- [ ] **Step 2: Update validation middleware to use canonical format**

Ensure `validate.ts` returns errors in the canonical shape.

- [ ] **Step 3: Update global error handler to use canonical format**

Ensure the catch-all error handler in `index.ts` returns the same shape for unhandled errors.

- [ ] **Step 4: Audit controllers for direct error responses**

Search for `res.status(...).json({ message:` or `res.json({ error:` patterns in controllers. Update any that don't match the canonical format. Focus on the 5 priority controllers (Checkin, Event, Band, Venue, User).

- [ ] **Step 5: Run tests and commit**

Run: `cd backend && npm test`

```bash
git add backend/src/middleware/validate.ts backend/src/index.ts
git commit -m "fix: resolve CFR-API-013 — standardize error response format

Align validation middleware, global error handler, and priority
controllers to use consistent { error: { code, message, details? } }
response shape.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Backend — Polymorphic FK Cleanup

Add application-level cleanup for polymorphic foreign keys that lack database constraints.

**Files:**
- Modify: `backend/src/services/VenueService.ts`
- Modify: `backend/src/services/BandService.ts`
- Modify: `backend/src/services/ClaimService.ts`
- Modify: `backend/src/services/ModerationService.ts`

- [ ] **Step 1: Add claim cleanup on venue/band deletion (CFR-DI-007)**

Read `backend/src/services/VenueService.ts` and `backend/src/services/BandService.ts`. Find the delete methods.

After the soft-delete (or hard-delete), add cleanup of orphaned verification_claims:
```typescript
// In deleteVenue / softDeleteVenue:
await this.db.query(
  `UPDATE verification_claims SET status = 'invalidated'
   WHERE entity_type = 'venue' AND entity_id = $1`,
  [venueId]
);
```

Same pattern for bands.

- [ ] **Step 2: Add report/moderation cleanup on content deletion (CFR-DI-008)**

Read `backend/src/services/ModerationService.ts` or wherever content deletion happens.

When a checkin, user, venue, or band is deleted, mark associated reports as resolved:
```typescript
await this.db.query(
  `UPDATE reports SET status = 'resolved', resolved_reason = 'content_deleted'
   WHERE content_type = $1 AND content_id = $2 AND status = 'pending'`,
  [contentType, contentId]
);
```

- [ ] **Step 3: Run tests and commit**

Run: `cd backend && npm test`

```bash
git add backend/src/services/VenueService.ts \
  backend/src/services/BandService.ts \
  backend/src/services/ClaimService.ts \
  backend/src/services/ModerationService.ts
git commit -m "fix: resolve CFR-DI-007, CFR-DI-008 — polymorphic FK cleanup

Add application-level cleanup for verification_claims and reports
when parent entities are deleted. Prevents orphaned records from
polymorphic foreign keys.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Execution Notes

### Parallelism

All 14 tasks are independent. Maximum parallelism:

```
Backend group (Tasks 4-12):     Can all run in parallel if using worktrees
Mobile group (Tasks 1-3):       Can all run in parallel
Cross-group:                    Backend and mobile are independent
```

Recommended execution waves:

**Wave 1** (highest user impact — run in parallel):
- Task 1: Mobile UX fixes
- Task 2: const/Theme pattern
- Task 4: Block filters
- Task 5: Security hardening

**Wave 2** (data integrity + API — run in parallel):
- Task 3: Mobile security
- Task 6: Data integrity
- Task 7: API safety
- Task 8: Infrastructure

**Wave 3** (performance + remaining — run in parallel):
- Task 9: Performance indexes/caching
- Task 10: Performance queries
- Task 11: Misc fixes
- Task 12: Input validation

### Testing

After each task:
- Backend: `cd backend && npm test` (must pass)
- Mobile: `cd mobile && dart analyze` (no new errors)

After all tasks:
- Full backend suite: `cd backend && npm test`
- Full mobile analysis: `cd mobile && dart analyze`

### Finding ID Reference

| Task | Findings Resolved |
|------|-------------------|
| 1 | CFR-MOB-056, CFR-MOB-064, CFR-MOB-002, CFR-027, CFR-MOB-005 |
| 2 | CFR-MOB-050 through CFR-MOB-055 |
| 3 | CFR-SEC-051, CFR-SEC-053, CFR-SEC-054, CFR-SEC-055, CFR-028 |
| 4 | CFR-038, CFR-E2E-055, CFR-E2E-066 |
| 5 | CFR-032, CFR-SEC-003, CFR-SEC-018, CFR-013 |
| 6 | CFR-BE-001, CFR-BE-002, CFR-DI-002, CFR-DI-006, CFR-025, CFR-E2E-016 |
| 7 | CFR-017, CFR-API-052, CFR-API-053, CFR-API-054 |
| 8 | CFR-INF-003, CFR-INF-004, CFR-INF-005, CFR-037 |
| 9 | CFR-DB-007, CFR-DB-008, CFR-PERF-003, CFR-PERF-004, CFR-PERF-007 |
| 10 | CFR-PERF-005, CFR-PERF-006 |
| 11 | CFR-BE-006, CFR-BE-007, CFR-BE-008 |
| 12 | CFR-API-006, CFR-API-007, CFR-API-008, CFR-API-009, CFR-040 |
| 13 | CFR-API-013 |
| 14 | CFR-DI-007, CFR-DI-008 |
| *Deferred* | CFR-API-002-004 (AdminController tombstoned — no routes to validate) |
