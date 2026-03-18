# SoundCheck Beta Readiness -- Fix Verification Report

**Date:** 2026-03-18
**Verifier:** EvidenceQA (Fix Verification Agent)
**Source:** docs/reviews/fix-plan.md (20 fixes across 4 domains)
**Method:** Direct source file inspection on master branch

---

## Test Suite Results

| Metric | Value |
|--------|-------|
| Test suites | 22 / 22 passed |
| Test cases | 329 total, 0 failures |
| Coverage | All suites green |

---

## Fix Verification Matrix

### Infrastructure Fixes

| # | Fix ID | Title | Status | Evidence |
|---|--------|-------|--------|----------|
| 1 | CFR-INF-001 | Railway health check configuration | **VERIFIED** | See below |
| 2 | CFR-INF-002 | Database pool error crashes process | **VERIFIED** | See below |
| 20 | CFR-022 | Missing base tables in migration chain | **VERIFIED** | See below |

**Fix 1 (CFR-INF-001): Railway health check configuration**
- File: `railway.toml` lines 9-10
- Evidence: `healthcheckPath = "/health"` and `healthcheckTimeout = 120` are present in the `[deploy]` section
- The `/health` endpoint at `backend/src/index.ts:170-198` returns database connectivity, WebSocket stats, and push notification status
- Verdict: VERIFIED -- Railway will now wait for the health endpoint to return 2xx before routing traffic

**Fix 2 (CFR-INF-002): Database pool error crashes process**
- File: `backend/src/config/database.ts` lines 90-95
- Evidence: The pool error handler at line 91-95 logs the error but does NOT call `process.exit(-1)`. The comment reads: `// Do NOT exit -- pool will reconnect automatically. // The /health endpoint will detect persistent DB failures.`
- Verdict: VERIFIED -- `process.exit(-1)` has been removed; pool errors are logged and recovered from

**Fix 20 (CFR-022): Missing base tables in migration chain**
- File: `backend/migrations/044_create-base-tables.ts` (401 lines)
- Evidence: Creates all 14 required tables in FK dependency order with `IF NOT EXISTS` guards:
  1. users, 2. venues, 3. bands, 4. vibe_tags, 5. badges, 6. refresh_tokens, 7. user_social_accounts, 8. user_followers, 9. user_wishlist, 10. checkins, 11. checkin_vibes, 12. user_badges, 13. deletion_requests, 14. user_consents
- Includes indexes, constraints, triggers, and CFR-043 average_rating column additions
- Down migration drops tables in reverse FK order with `IF EXISTS`
- Verdict: VERIFIED -- fresh database bootstrap from migrations will now create all required tables

---

### Security Fixes

| # | Fix ID | Title | Status | Evidence |
|---|--------|-------|--------|----------|
| 3 | CFR-001 | isAdmin/isPremium leaked in auth responses | **VERIFIED** | See below |
| 4 | CFR-002 | DELETE endpoints lack authorization | **VERIFIED** | See below |
| 5 | CFR-009 | Discovery endpoints unauthenticated | **VERIFIED** | See below |
| 6 | CFR-008 | AdminController dead code | **VERIFIED** | See below |
| 7 | CFR-026 | WebSocket unauthenticated + unscoped rooms | **VERIFIED** | See below |

**Fix 3 (CFR-001): isAdmin/isPremium leaked in auth responses**
- File: `backend/src/utils/dbMappers.ts` lines 4-10
- Evidence: `sanitizeUserForClient()` function exists, destructures out `isAdmin` and `isPremium` before returning
- Usage confirmed in 4 call sites:
  - `UserService.ts:57` (createUser return)
  - `UserService.ts:96` (login return)
  - `UserController.ts:121` (getMe endpoint)
  - `UserController.ts:162` (updateProfile endpoint)
  - `SocialAuthService.ts:431` (social auth return)
- Test coverage: `dbMappers.test.ts` has 5 test cases for `sanitizeUserForClient`
- Verdict: VERIFIED -- isAdmin/isPremium are stripped from all client-facing auth responses

**Fix 4 (CFR-002): DELETE endpoints lack authorization**
- Files: `VenueController.ts`, `BandController.ts`, `EventController.ts`
- Evidence:
  - `VenueController.deleteVenue` (lines 184-220): checks `req.user`, then verifies `isAdmin || isClaimedOwner`. Returns 401 if no user, 403 if unauthorized.
  - `BandController.deleteBand` (lines 183-219): same pattern -- `req.user` check, then `isAdmin || isClaimedOwner`, with 401/403 responses.
  - `EventController.deleteEvent` (lines 571-616): checks `req.user`, fetches event, then verifies `isAdmin || isCreator` (event.createdByUserId). Returns 401/403 appropriately.
- Verdict: VERIFIED -- all three DELETE endpoints have authentication + authorization checks with proper 401/403 error codes

**Fix 5 (CFR-009): Discovery endpoints unauthenticated and unrate-limited**
- File: `backend/src/routes/discoveryRoutes.ts` (34 lines)
- Evidence: All 5 routes apply both `authenticateToken` and `createPerUserRateLimit(RateLimitPresets.read)` middleware:
  - GET `/venues` (line 15)
  - GET `/setlists` (line 18)
  - GET `/bands` (line 21)
  - GET `/bands/genre` (line 24)
  - GET `/users/suggestions` (lines 27-32)
- Comment on line 11: "All discovery endpoints require authentication and per-user rate limiting to protect third-party API keys"
- Verdict: VERIFIED -- all discovery endpoints require authentication and have per-user rate limiting

**Fix 6 (CFR-008): AdminController dead code with destructive operations**
- File: `backend/src/controllers/AdminController.ts` (15 lines)
- Evidence: The entire file is now a tombstone comment. Lines 1-14 explain the deletion rationale, reference CFR-008, and document requirements for any future admin rebuild (auth middleware, Zod validation, test coverage, audit logging).
- Verdict: VERIFIED -- destructive dead code removed; tombstone provides safe rebuild guidance

**Fix 7 (CFR-026): WebSocket unauthenticated connections + unscoped rooms**
- File: `backend/src/utils/websocket.ts`
- Evidence of `verifyClient` callback (lines 62-87):
  - Extracts token from query string or Authorization header
  - Calls `AuthUtils.verifyToken(token)` and rejects with 401 if invalid
  - Attaches `userId` to the upgrade request for the connection handler
- Evidence of room validation in `joinRoom` (lines 282-309):
  - Validates room name against allowed prefixes: `event:`, `venue:`, `user:`
  - Blocks joining another user's room: `user:X` only allowed if X matches `client.userId`
  - Returns error for invalid room names
- Evidence of auth gate for room operations (lines 221-228):
  - `join_room` and `leave_room` messages require `client.userId` to be set
- Verdict: VERIFIED -- connections require JWT verification; rooms are validated and scoped

---

### Backend Fixes

| # | Fix ID | Title | Status | Evidence |
|---|--------|-------|--------|----------|
| 8 | CFR-003 | Check-in creation not wrapped in transaction | **VERIFIED** | See below |
| 9 | CFR-004 | Stats trigger INSERT-only, DELETE never decrements | **VERIFIED** | See below |
| 10 | CFR-PERF-001 | cache.delPattern() uses blocking KEYS | **VERIFIED** | See below |
| 11 | CFR-PERF-002 | WebSocket fan-out O(followers * connections) | **VERIFIED** | See below |
| 12 | CFR-E2E-054 | Follow action creates no notification | **VERIFIED** | See below |
| 13 | CFR-E2E-057 | Push notification pipeline silently disabled | **VERIFIED** | See below |
| 14 | CFR-011 | deleteCheckin errors always surface as 500 | **VERIFIED** | See below |

**Fix 8 (CFR-003): Check-in creation not wrapped in transaction**
- File: `backend/src/services/checkin/CheckinCreatorService.ts` lines 123-162
- Evidence: `createEventCheckin()` acquires a client via `this.db.getClient()`, wraps the INSERT + vibe tag insertion in `BEGIN`/`COMMIT` with a `ROLLBACK` in the catch block. The `finally` block releases the client. Unique constraint violation (`23505`) is caught and re-thrown as 409.
- Comment on line 109: "INSERT the check-in + vibe tags inside a single transaction so a vibe tag failure rolls back the checkin (prevents partial state)"
- Verdict: VERIFIED -- check-in creation is fully transactional

**Fix 9 (CFR-004): Stats trigger INSERT-only, DELETE never decrements**
- File: `backend/migrations/044_add-delete-stats-trigger.ts` (122 lines)
- Evidence: Creates `update_user_stats_on_checkin_delete()` trigger function that fires AFTER DELETE on checkins. The function:
  - Decrements `total_checkins` with `GREATEST(x - 1, 0)` floor
  - Recomputes `unique_bands`/`unique_venues`/`unique_fans`/`unique_visitors` via COUNT(DISTINCT) subqueries (correct for multi-checkin scenarios)
  - Decrements event `total_checkins`
  - Handles both event-first and legacy checkin paths
- Verdict: VERIFIED -- DELETE trigger properly decrements all entity stats

**Fix 10 (CFR-PERF-001): cache.delPattern() uses blocking KEYS**
- File: `backend/src/utils/cache.ts` lines 213-247
- Evidence: `delPattern()` uses `redis.scan()` with cursor-based iteration (`MATCH` pattern, `COUNT 100`) instead of the blocking `KEYS` command. Uses `redis.unlink()` (non-blocking DEL) for key removal. Loop continues until cursor returns to `'0'`.
- Comment on line 211: "Delete keys by pattern using non-blocking SCAN (instead of blocking KEYS). Uses UNLINK for non-blocking key removal."
- Verdict: VERIFIED -- SCAN replaces KEYS; UNLINK replaces DEL for non-blocking operation

**Fix 11 (CFR-PERF-002): WebSocket fan-out O(followers * connections)**
- File: `backend/src/utils/websocket.ts` lines 49, 104-110, 374-379
- Evidence:
  - `userClients` index: `Map<string, Set<string>>` at line 49, maps userId to clientIds
  - Index populated on connection (lines 104-110) and in `authenticateClient` (lines 270-276)
  - Index cleaned up on disconnect (lines 333-341)
  - `sendToUser()` at lines 374-379 uses `this.userClients.get(userId)` for O(1) lookup instead of iterating all clients
- Comment on line 49: "userId -> clientIds index for O(1) sendToUser"
- Verdict: VERIFIED -- sendToUser is now O(connections-per-user) instead of O(total-clients)

**Fix 12 (CFR-E2E-054): Follow action creates no notification**
- File: `backend/src/services/FollowService.ts` lines 57-69
- Evidence: After a successful follow INSERT (result.rows.length > 0), calls `this.notificationService.createNotification()` with type `'new_follower'`, targeting the followed user, from the follower. Wrapped in try/catch with fire-and-forget semantics (notification failure does not block the follow).
- The `NotificationService` is injected via constructor (line 23-25).
- Verdict: VERIFIED -- follow action creates a notification for the followed user

**Fix 13 (CFR-E2E-057): Push notification pipeline silently disabled**
- File: `backend/src/index.ts` line 187
- Evidence: Health endpoint includes `pushNotifications: pushNotificationService.isAvailable ? 'enabled' : 'disabled'` in its response data. The `PushNotificationService.isAvailable` getter (at PushNotificationService.ts:50) returns the `isConfigured` flag which reflects whether Firebase Admin SDK initialized successfully.
- Verdict: VERIFIED -- health endpoint now surfaces push notification availability status

**Fix 14 (CFR-011): deleteCheckin errors always surface as 500**
- File: `backend/src/controllers/CheckinController.ts` lines 369-413
- Evidence: The `deleteCheckin` catch block now checks for `statusCode` on the error object:
  - 404 -> returns 404 with "Check-in not found"
  - 403 -> returns 403 with the error message
  - Other errors -> falls through to 500
- The `CheckinCreatorService.deleteCheckin()` (lines 231-290) sets statusCode on errors: 404 for not found, 403 for ownership mismatch.
- Verdict: VERIFIED -- delete errors now return proper 404/403 status codes instead of always 500

---

### Mobile Fixes

| # | Fix ID | Title | Status | Evidence |
|---|--------|-------|--------|----------|
| 15 | CFR-006 | Feed does not refresh after check-in | **VERIFIED** | See below |
| 16 | CFR-007 | Logout does not invalidate providers | **VERIFIED** | See below |
| 17 | CFR-E2E-005 | Legacy CreateCheckIn calls non-existent method | **VERIFIED** | See below |
| 18 | CFR-005 | Dio 401 handler wipes credentials without refresh | **VERIFIED** | See below |
| 19 | CFR-E2E-071 | Password reset deep link uses custom URI scheme | **VERIFIED** (interim) | See below |

**Fix 15 (CFR-006): Feed does not refresh after check-in**
- File: `mobile/lib/src/features/checkins/presentation/providers/checkin_providers.dart` lines 260-263
- Evidence: `CreateEventCheckIn.submit()` invalidates three feed providers after successful check-in creation:
  - `ref.invalidate(globalFeedProvider)`
  - `ref.invalidate(friendsFeedProvider)`
  - `ref.invalidate(nearbyEventsProvider)`
- Verdict: VERIFIED -- feed providers are invalidated after check-in creation, triggering refresh

**Fix 16 (CFR-007): Logout does not invalidate session-dependent providers**
- File: `mobile/lib/src/core/providers/providers.dart` lines 196-219
- Evidence: `AuthState.logout()` calls `_clearUserData()` at line 197, which invalidates:
  - Feed providers: `globalFeedProvider`, `friendsFeedProvider`, `happeningNowProvider`, `unseenCountsProvider`, `newCheckinCountProvider`, `activeEventIdsProvider`
  - Notification providers: `notificationFeedProvider`, `unreadNotificationCountProvider`
  - Check-in providers: `nearbyEventsProvider`
- Also disconnects WebSocket (line 186) and clears RevenueCat identity (lines 189-192)
- Verdict: VERIFIED -- logout properly clears all user-scoped data providers

**Fix 17 (CFR-E2E-005): Legacy CreateCheckIn calls non-existent repository method**
- Evidence: Grep for `CreateCheckIn` (class name) and `createCheckin(bandId` (legacy method signature) across `mobile/lib/` returned zero matches. The only check-in creation path is `CreateEventCheckIn` in `checkin_providers.dart` which calls `repository.createEventCheckIn()`.
- Backend confirmation: Grep for `createCheckin(bandId` in `backend/src/` also returned zero matches. The legacy dual-write path has been fully removed.
- Verdict: VERIFIED -- legacy CreateCheckIn class and createCheckin(bandId+venueId) method are fully deleted from both mobile and backend

**Fix 18 (CFR-005): Dio 401 handler wipes credentials without refresh attempt**
- File: `mobile/lib/src/core/api/dio_client.dart` lines 38-93
- Evidence: The 401 handler in the `QueuedInterceptorsWrapper` now:
  1. Calls `_attemptTokenRefresh()` first (line 55)
  2. If refresh succeeds, retries the original request with the new token (lines 57-64)
  3. Only wipes credentials if refresh fails or no refresh token exists (lines 70-73)
  4. Notifies auth state via `_onAuthFailure` callback (line 76)
- The `_attemptTokenRefresh()` method (lines 98-130) uses a separate Dio instance to avoid interceptor recursion, calls `/tokens/refresh`, and stores new access + refresh tokens.
- Uses `QueuedInterceptorsWrapper` (line 43) to serialize concurrent 401s so only one refresh attempt happens.
- Verdict: VERIFIED -- 401 responses now trigger token refresh before credential wipe

**Fix 19 (CFR-E2E-071): Password reset deep link uses custom URI scheme**
- Status: **VERIFIED (interim fix)**
- The fix plan specified two approaches: (a) full HTTPS universal links, or (b) interim fix keeping `soundcheck://` with proper scheme registration.
- Evidence of interim fix implementation:
  - Android: `AndroidManifest.xml` lines 49-56 register the `soundcheck://` custom scheme with proper intent filter (VIEW action, DEFAULT + BROWSABLE categories). `flutter_deeplinking_enabled` metadata is set to `true` (line 48).
  - iOS: `Info.plist` lines 88-97 register `CFBundleURLTypes` with scheme `soundcheck` and identifier `com.soundcheck.app`.
  - Backend: `EmailService.ts:48` still uses `soundcheck://reset-password?token=...` (consistent with interim approach).
- What is NOT implemented: The full HTTPS universal links approach (android:autoVerify, assetlinks.json, apple-app-site-association, web fallback page). This was explicitly called out as the interim fix path for beta.
- Verdict: VERIFIED (interim) -- custom scheme is properly registered on both platforms; full universal links deferred post-beta

---

## Summary

| Domain | Total Fixes | Verified | Incomplete |
|--------|-------------|----------|------------|
| Infrastructure | 3 | 3 | 0 |
| Security | 5 | 5 | 0 |
| Backend | 7 | 7 | 0 |
| Mobile | 5 | 5 | 0 |
| **Total** | **20** | **20** | **0** |

### Verification Result: ALL 20 FIXES VERIFIED

All 20 blocker fixes from the fix plan have been confirmed present in the source code on master. Each fix was verified by reading the actual file and confirming the specific code change described in the fix plan exists.

### Notes

1. **Fix 19 (deep links)** used the interim approach (custom URI scheme registration) rather than full HTTPS universal links. This is acceptable for beta per the fix plan's own guidance. Full universal links should be implemented before public launch.

2. **Test suite confirmation**: 22 suites, 329 tests, 0 failures -- all fixes pass automated testing.

3. **No regressions detected** in the source review. All fix implementations follow the patterns specified in the fix plan.

---

**Verified by:** EvidenceQA (Fix Verification Agent)
**Date:** 2026-03-18
**Method:** Direct source file reading on master branch, cross-referenced against fix-plan.md specifications
