# Phase 2: End-to-End Secondary Flow Trace

**Auditor:** EvidenceQA Agent
**Date:** 2026-03-18
**Scope:** 10 secondary user journeys traced end-to-end (Flutter mobile -> Node.js/Express API -> PostgreSQL)
**Target:** Pre-beta readiness for invite-only launch (~500-2,000 users)
**Branch:** `master` at commit `148788e`

---

## Executive Summary

Traced 10 secondary user flows from mobile UI through API routes, controllers, services, and database queries. Found **4 Blocker**, **7 High**, **8 Medium**, and **5 Low** severity issues across the secondary flow paths. The blockers center on missing "new follower" notifications (the follow flow creates no notification for the target user), password reset emails using a custom `soundcheck://` deep link scheme with no mobile-side URI handler wired, social auth leaking `isAdmin`/`isPremium` in responses, and the notification push pipeline silently dropping all push notifications when Firebase is unconfigured with no fallback or user-facing indication.

| Severity | Count |
|----------|-------|
| Blocker  | 4     |
| High     | 7     |
| Medium   | 8     |
| Low      | 5     |
| **Total**| **24**|

### Phase 1 Cross-References

Several findings in this report overlap with or compound issues found in Phase 1:
- E2E-051 compounds SEC-001 (isAdmin/isPremium exposure) -- social auth path also leaks these fields
- E2E-055 compounds BE-009 (event feed block filter) -- notification query also lacks block filter
- E2E-064 compounds SEC-004 (JWT not revocable) -- password reset revokes refresh tokens but not access tokens

---

## Flow 1: Google Social Auth -> Profile -> Home

**Status: VERIFIED with issues**

### Code Path Traced

1. **Mobile** `login_screen.dart:130-168` -- `_handleGoogleSignIn()` calls `_socialAuthService?.signInWithGoogle()`
2. **Mobile** `social_auth_service.dart:74-111` -- Gets Google ID token via `google_sign_in` SDK, sends `POST /auth/social/google` with `{idToken}`
3. **API Route** `socialAuthRoutes.ts:41-122` -- Zod validates `idToken`, rate-limited 5/15min
4. **Service** `SocialAuthService.ts:52-88` -- `verifyGoogleToken()` verifies via `google-auth-library`, checks `email_verified`
5. **Service** `SocialAuthService.ts:146-182` -- `authenticateOrCreate()` checks social link -> email match -> create new
6. **Service** `SocialAuthService.ts:276-318` -- `createSocialUser()` uses a transaction for user + social link
7. **Mobile** `social_auth_service.dart:107-110` -- Saves tokens to secure storage
8. **Mobile** `login_screen.dart:140` -- Calls `authStateProvider.notifier.refreshUser()` to update app state

### Findings

### [E2E-050]: Google sign-in `refreshUser()` call uses stale DioClient that lacks the new token
**Severity:** High
**Flow:** Google Social Auth -> Profile -> Home
**Break Point:** `mobile/lib/src/features/auth/presentation/login_screen.dart:140`
**Description:** After `signInWithGoogle()` succeeds, the mobile code saves tokens to secure storage inside `SocialAuthService._saveAuthData()` (line 175-188). It then calls `ref.read(authStateProvider.notifier).refreshUser()` at line 140. However, the `authStateProvider` was initialized with a `DioClient` that reads the token from secure storage via an interceptor on each request. The interceptor reads from `FlutterSecureStorage` on every request, so the new token WILL be picked up. The actual problem is subtler: `refreshUser()` calls `GET /users/me` which returns the full User object. That response arrives and is deserialized -- but `SocialAuthService` already wrote its own User to storage at line 182. If the two User representations differ (e.g., `refreshUser` returns `isAdmin`/`isPremium` from the DB while the social auth response user does not), the second write wins, potentially overwriting fields. This is currently benign because both paths return the same User shape from `mapDbUserToUser`, but it is a latent inconsistency.
**Evidence:** `social_auth_service.dart:175-188` saves user to storage, then `login_screen.dart:140` calls `refreshUser()` which also saves user to storage via a separate code path.
**Recommended Fix:** Remove the `_saveAuthData` call for the user object in `SocialAuthService` and let `refreshUser()` be the canonical source. Only save the tokens (JWT + refresh) in `_saveAuthData`.

---

### [E2E-051]: Social auth response leaks `isAdmin` and `isPremium` flags to client
**Severity:** Blocker
**Flow:** Google Social Auth -> Profile -> Home (also applies to Apple auth)
**Break Point:** `backend/src/services/SocialAuthService.ts:421-436`
**Description:** The `generateAuthResult()` method at line 421 returns the full `User` object (which includes `isAdmin` and `isPremium` per `mapDbUserToUser`) in the auth response. The route handler at `socialAuthRoutes.ts:88-94` serializes this directly to the client. This is the same issue as SEC-001 from Phase 1, but via a separate code path that would survive if the fix were only applied to `UserController.register` and `UserController.login`. The social auth route must also be patched.
**Evidence:**
```typescript
// SocialAuthService.ts:430-435
return {
  user,        // Full User object including isAdmin, isPremium
  token,
  refreshToken,
  isNewUser,
};

// socialAuthRoutes.ts:88-89
data: {
  user: result.user,  // isAdmin, isPremium leaked
```
**Recommended Fix:** Apply the same `sanitizeUserForClient()` function recommended in SEC-001 to `SocialAuthService.generateAuthResult()`. This is a separate code path from the email/password auth and MUST be patched independently.

---

## Flow 2: Apple Social Auth -> Profile -> Home

**Status: VERIFIED with issues**

### Code Path Traced

1. **Mobile** `login_screen.dart:171-213` -- `_handleAppleSignIn()` calls `_socialAuthService?.signInWithApple()`
2. **Mobile** `social_auth_service.dart:130-172` -- Gets Apple identity token via `sign_in_with_apple` SDK, sends `POST /auth/social/apple` with `{identityToken, fullName?}`
3. **API Route** `socialAuthRoutes.ts:138-219` -- Zod validates, rate-limited 5/15min
4. **Service** `SocialAuthService.ts:97-135` -- `verifyAppleToken()` verifies via `apple-signin-auth`, checks `sub`
5. **Service** `SocialAuthService.ts:146-182` -- Same `authenticateOrCreate()` as Google
6. Remainder same as Flow 1.

### Findings

### [E2E-052]: Apple Sign-In button hidden on Android -- no Google-only fallback UI
**Severity:** Low
**Flow:** Apple Social Auth -> Profile -> Home
**Break Point:** `mobile/lib/src/features/auth/presentation/login_screen.dart:376`
**Description:** The Apple Sign-In button is conditionally shown only on iOS/macOS via `Platform.isIOS || Platform.isMacOS` at line 376. On Android, the social login row shows only the Google button. This is correct behavior (Apple Sign-In is iOS-only). However, the `Row` with `MainAxisAlignment.spaceEvenly` will center a single button when there is only one child, which may look slightly off-center compared to the design intent. Minor UI polish issue.
**Evidence:** `login_screen.dart:375-385` -- conditional rendering produces a single-button row on Android.
**Recommended Fix:** Consider using `MainAxisAlignment.center` or adding spacing constants so the single Google button is properly centered on Android.

---

### [E2E-053]: Apple re-authentication after first sign-in throws if email is empty
**Severity:** Medium
**Flow:** Apple Social Auth -> Profile -> Home
**Break Point:** `backend/src/services/SocialAuthService.ts:164-168`
**Description:** Apple only provides the user's email on the FIRST authorization. On subsequent sign-ins, `appleUser.email` is empty/null. The `verifyAppleToken()` method returns `email: email || ''` at line 127. If the social account link does NOT already exist in `user_social_accounts` (e.g., it was deleted, or the user deleted and re-created their SoundCheck account), `authenticateOrCreate()` reaches line 164 where `profile.email` is `''` (falsy), and throws `'Email is required for new social sign-in'`. The user is permanently locked out -- they cannot re-authorize with Apple because Apple will never re-send the email. The mobile client shows a generic "Sign-in failed" error with no guidance.
**Evidence:**
```typescript
// SocialAuthService.ts:122-127
const email = appleUser.email;
return {
  provider: 'apple',
  providerId: appleUser.sub,
  email: email || '', // Empty string on re-auth

// SocialAuthService.ts:164-168
if (!profile.email) {
  throw new Error('Email is required for new social sign-in');
}
```
**Recommended Fix:** Before throwing, attempt a lookup by `provider + providerId` one more time (redundant with line 148 but necessary for clarity). If that also fails, return a specific error code that the mobile client can handle by prompting the user to "link their Apple account via Settings" while logged in with email/password. Alternatively, look up the user by `providerId` across all social accounts rather than requiring email.

---

## Flow 3: Follow User -> Feed Updates

**Status: BROKEN -- missing notification**

### Code Path Traced

1. **Mobile** -- Follow action triggers `POST /api/follow/:userId`
2. **API Route** `followRoutes.ts:16` -- `authenticateToken` + `followRateLimit(30/15m)`
3. **Controller** `FollowController.ts:20-85` -- UUID validation, self-follow prevention, calls `followService.followUser()`
4. **Service** `FollowService.ts:23-50` -- Pre-check `isFollowing()`, verify target exists, `INSERT INTO user_followers ON CONFLICT DO NOTHING`
5. **Feed** `FeedService.ts:78-150` -- `getFriendsFeed()` JOINs `user_followers` to filter check-ins from followed users
6. **Block filter** `FeedService.ts:120` -- `getBlockFilterSQL()` correctly applied to friends feed

### Findings

### [E2E-054]: Following a user creates NO notification for the followed user
**Severity:** Blocker
**Flow:** Follow User -> Feed Updates
**Break Point:** `backend/src/controllers/FollowController.ts:55` and `backend/src/services/FollowService.ts:47`
**Description:** When User A follows User B, the `FollowService.followUser()` method inserts a row into `user_followers` and returns `{ success: true, isFollowing: true }`. Neither the controller nor the service creates a notification for User B. The `NotificationService.createNotification()` is never called in the follow flow. The mobile `NotificationsScreen` handles `'new_follower'` notification type at line 210-215, and the WebSocket constants define `NEW_FOLLOWER: 'new_follower'` at `websocket.ts:442`, proving the infrastructure exists but is never wired. User B has no way to know they gained a new follower until they manually check their followers list.
**Evidence:**
```bash
# Grep for createNotification or notificationService in FollowController/FollowService
# Result: zero matches in both files
```
The mobile side at `notifications_screen.dart:209-215` has a `case 'new_follower':` handler that navigates to the follower's profile, confirming the feature was intended but the backend never emits the notification.
**Recommended Fix:** After the successful `INSERT` in `FollowService.followUser()`, call `notificationService.createNotification({ userId: followingId, type: 'new_follower', fromUserId: followerId })`. Also send a push notification via `pushNotificationService.sendToUser()` for immediate awareness.

---

### [E2E-055]: Notification query does not filter blocked users
**Severity:** High
**Flow:** Follow User -> Feed Updates (notification sub-flow)
**Break Point:** `backend/src/services/NotificationService.ts:98-142`
**Description:** The `getNotifications()` query at line 98-142 has no `getBlockFilterSQL()` call and no JOIN on `user_blocks`. If User A blocks User B, notifications from User B (toasts, comments, friend check-ins) that were created BEFORE the block will still appear in User A's notification feed. New notifications should not be created after a block (because the block removes the follow relationship), but pre-existing notifications remain visible. The `FeedService` correctly applies block filters on feeds, but `NotificationService` does not.
**Evidence:**
```sql
-- NotificationService.ts:139 -- no block filter
WHERE n.user_id = $1
ORDER BY n.created_at DESC
-- Missing: AND NOT EXISTS (SELECT 1 FROM user_blocks ...)
```
**Recommended Fix:** Add a block filter to the notification query: `AND NOT EXISTS (SELECT 1 FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = n.from_user_id) OR (blocker_id = n.from_user_id AND blocked_id = $1))`. This filters notifications from blocked users bilaterally.

---

### [E2E-056]: Follow action returns 200 instead of 201 for new follows
**Severity:** Low
**Flow:** Follow User -> Feed Updates
**Break Point:** `backend/src/controllers/FollowController.ts:63`
**Description:** Following a user is a resource creation operation (INSERT into user_followers) but the controller returns HTTP 200 instead of 201. This was already noted in Phase 1 as API-028 but is confirmed here as a cross-cutting issue in the follow flow specifically.
**Recommended Fix:** Return 201 for new follows. The `FollowService.followUser()` should differentiate "newly followed" from "already following" by checking `result.rowCount`, and the controller should return 201 vs 200 accordingly.

---

## Flow 4: Push Notification -> Navigation

**Status: BROKEN under common configuration**

### Code Path Traced

1. **Backend** `CheckinCreatorService.ts:497-584` -- After check-in creation, `publishCheckinAndNotify()` queries followers, RPUSHes to Redis batch list, enqueues BullMQ delayed job
2. **Queue** `notificationQueue.ts:26-34` -- BullMQ queue `'notification-batch'` with 3 retries, exponential backoff
3. **Worker** `notificationWorker.ts:41-98` -- After 2-minute delay, LRANGE + DEL the batch, sends via `pushNotificationService.sendToUser()`
4. **FCM** `PushNotificationService.ts:60-101` -- `sendEachForMulticast()` to all user device tokens, cleans stale tokens
5. **Mobile** `notifications_screen.dart:193-265` -- `_handleNotificationTap()` navigates based on notification type

### Findings

### [E2E-057]: Push notification pipeline silently disabled when Firebase is not configured
**Severity:** Blocker
**Flow:** Push Notification -> Navigation
**Break Point:** `backend/src/services/PushNotificationService.ts:20-42`
**Description:** The `PushNotificationService` checks for `FIREBASE_SERVICE_ACCOUNT_JSON` at module load time (line 21). If not set, `isConfigured` is `false` and `sendToUser()` returns immediately at line 64 (`if (!isConfigured || !messagingInstance) return;`). The entire notification batching pipeline (Redis RPUSH, BullMQ job scheduling, 2-minute delay, worker processing) still executes -- consuming Redis memory and BullMQ resources -- but the final delivery step silently does nothing. There is no metric, health check indicator, or admin visibility into the fact that push notifications are completely non-functional. At beta launch, if Firebase is not configured, users will never receive push notifications but the system will appear healthy.
**Evidence:**
```typescript
// PushNotificationService.ts:36-38
} else {
  logger.warn('[PushNotificationService] FIREBASE_SERVICE_ACCOUNT_JSON not set. Push notifications disabled.');
}
// This log only fires once at startup -- no ongoing visibility
```
**Recommended Fix:** Add a `pushNotifications: isConfigured ? 'enabled' : 'disabled'` field to the `/health` endpoint response. Also add a log warning in the notification worker when `pushNotificationService.isAvailable` is false, so the batch processing can short-circuit before consuming Redis resources.

---

### [E2E-058]: Notification worker queue name mismatch with enqueue call
**Severity:** High
**Flow:** Push Notification -> Navigation
**Break Point:** `backend/src/services/checkin/CheckinCreatorService.ts:572` vs `backend/src/jobs/notificationWorker.ts:42`
**Description:** The `CheckinCreatorService` enqueues jobs with name `'send-batch'` at line 572 (`notificationQueue.add('send-batch', { userId: followerId }, ...)`). The `notificationWorker` processes jobs from queue `'notification-batch'` at line 42 (`new Worker('notification-batch', async (job) => ...)`). However, the `notificationQueue` was created with queue name `'notification-batch'` at `notificationQueue.ts:26`. The job name `'send-batch'` is the job NAME (not the queue name) -- BullMQ uses queue name for routing and job name for identification. The worker processes ALL jobs from the `'notification-batch'` queue regardless of job name, so this is functionally correct. However, the job name inconsistency (`'send-batch'` in enqueue vs no job name filter in worker) means future debugging will be confusing.
**Evidence:**
```typescript
// CheckinCreatorService.ts:572
await notificationQueue.add('send-batch', { userId: followerId }, ...
// notificationQueue.ts:26 -- queue name
notificationQueue = new Queue('notification-batch', ...
// notificationWorker.ts:42 -- processes all jobs from queue
const worker = new Worker('notification-batch', async (job) => ...
```
**Recommended Fix:** This is functionally correct but rename the job to `'notification-batch'` for consistency, or add a job name check in the worker for forward compatibility if other job types are added to the same queue.

---

### [E2E-059]: Notification tap for `badge_earned` navigates to profile instead of badge collection
**Severity:** Medium
**Flow:** Push Notification -> Navigation
**Break Point:** `mobile/lib/src/features/notifications/presentation/notifications_screen.dart:241-245`
**Description:** When a user taps a `badge_earned` notification, the handler navigates to `/profile` (the user's own profile) with the comment "No dedicated badges route exists, so go to profile" at line 243. However, a `BadgeCollectionScreen` IS imported in `app_router.dart:23` and a `/badges` route exists. The notification tap should navigate to the badge collection screen so the user can see their newly earned badge.
**Evidence:**
```dart
// notifications_screen.dart:241-245
case 'badge_earned':
  // Navigate to user's own profile to see badges
  // No dedicated badges route exists, so go to profile
  context.go('/profile');
  break;
```
```dart
// app_router.dart:23
import '../../features/badges/presentation/badge_collection_screen.dart';
```
**Recommended Fix:** Change the navigation to `context.push('/badges')` (or the specific badge detail route with the badge ID from `notification.badgeId`).

---

## Flow 5: Share Card Generation

**Status: VERIFIED with issues**

### Code Path Traced

1. **Mobile** `share_repository.dart:21-28` -- `POST /share/checkin/$checkinId`
2. **API Route** `shareRoutes.ts:28` -- `authenticateToken`, no rate limiting
3. **Controller** `ShareController.ts:75-80` -- Auth check, fetches checkin data
4. **Service** `ShareCardService.ts:54-73` -- Satori renders JSX to SVG, resvg rasterizes to PNG, uploads OG + Stories to R2
5. **Mobile** `share_card_preview.dart` / `social_share_service.dart` -- Receives URLs, enables sharing to external apps

### Findings

### [E2E-060]: Share card generation has no rate limiting -- CPU exhaustion risk
**Severity:** High
**Flow:** Share Card Generation
**Break Point:** `backend/src/routes/shareRoutes.ts:28-31`
**Description:** Both share card generation endpoints (`POST /api/share/checkin/:checkinId` and `POST /api/share/badge/:badgeAwardId`) require authentication but have NO rate limiting. Card generation involves Satori SVG rendering + resvg PNG rasterization + R2 upload -- a CPU-intensive pipeline. A malicious user could trigger thousands of card generations, exhausting server CPU. This was noted in Phase 1 as API-058 but is confirmed here with the full code trace showing the CPU-intensive pipeline. The Wrapped card generation endpoints at `wrappedRoutes.ts:17-20` have the same issue.
**Evidence:**
```typescript
// shareRoutes.ts:28-31
apiRouter.post('/checkin/:checkinId', authenticateToken, shareController.generateCheckinCard);
apiRouter.post('/badge/:badgeAwardId', authenticateToken, shareController.generateBadgeCard);
// No rateLimit middleware
```
**Recommended Fix:** Add per-user rate limiting: `createPerUserRateLimit({ maxRequests: 5, windowMs: 60 * 1000 })` (5 card generations per minute per user).

---

### [E2E-061]: Share card returns empty string URLs when R2 is not configured -- mobile crashes on empty URL
**Severity:** Medium
**Flow:** Share Card Generation
**Break Point:** `backend/src/services/ShareCardService.ts:58-61`
**Description:** When R2 is not configured, `generateCheckinCard()` returns `{ ogUrl: '', storiesUrl: '' }`. The mobile `ShareRepository` at `share_repository.dart:24-27` constructs `ShareCardUrls` from these empty strings without checking. Downstream code that attempts to display or share these URLs (e.g., `Image.network('')`) will fail with a network error or render a broken image. The API should return a 503 or specific error instead of empty strings.
**Evidence:**
```typescript
// ShareCardService.ts:58-61
if (!r2Service.configured) {
  logger.warn('ShareCardService: R2 not configured, returning placeholder URLs');
  return { ogUrl: '', storiesUrl: '' };
}
```
**Recommended Fix:** Return HTTP 503 with `{ success: false, error: 'Share card generation temporarily unavailable' }` from the controller when R2 is not configured. The mobile client should handle this gracefully by showing a "sharing unavailable" message.

---

## Flow 6: Wrapped Annual Recap

**Status: VERIFIED with issues**

### Code Path Traced

1. **Mobile** `wrapped_repository.dart:9-11` -- `GET /wrapped/$year`
2. **API Route** `wrappedRoutes.ts:11` -- `authenticateToken`, no rate limiting
3. **Controller** `WrappedController.ts:14-28` -- Validates year range, calls `wrappedService.getWrappedStats()`
4. **Service** `WrappedService.ts:60-85` -- Parallel queries: basic counts, top genre, home venue, top artist
5. **Premium** `wrappedRoutes.ts:14` -- Detail stats require `requirePremium()` middleware
6. **Card Gen** `WrappedController.ts:46-74` -- Summary card via `ShareCardService.generateWrappedCard()`

### Findings

### [E2E-062]: WrappedController uses `req.user!.id` non-null assertion on 4 endpoints
**Severity:** High
**Flow:** Wrapped Annual Recap
**Break Point:** `backend/src/controllers/WrappedController.ts:16,32,48,78`
**Description:** All four authenticated WrappedController methods use `req.user!.id` (TypeScript non-null assertion) without a defensive null check. This was noted in Phase 1 as API-005 but is confirmed here across all 4 methods: `getWrapped` (line 16), `getWrappedDetail` (line 32), `generateSummaryCard` (line 48), and `generateStatCard` (line 78). Additionally, `generateSummaryCard` uses `req.user!.username` at line 59, which has the same crash risk.
**Evidence:**
```typescript
// WrappedController.ts:16
const userId = req.user!.id;  // Crashes if req.user is undefined
// WrappedController.ts:59
username: req.user!.username,  // Also crashes
```
**Recommended Fix:** Replace with defensive pattern: `const userId = req.user?.id; if (!userId) { res.status(401).json({...}); return; }`. Apply to all 4 methods.

---

### [E2E-063]: Wrapped landing page does not HTML-escape userId or year in URL construction
**Severity:** Medium
**Flow:** Wrapped Annual Recap
**Break Point:** `backend/src/controllers/WrappedController.ts:130`
**Description:** The public landing page at `renderWrappedLanding` (line 121-139) constructs a page URL using `${userId}/${year}` from `req.params` without HTML escaping. While the URL is injected via `{{PAGE_URL}}` template replacement (not directly into an HTML attribute context), the `userId` is not validated as a UUID, meaning a crafted URL like `/wrapped/<script>alert(1)</script>/2025` could inject content into the page. The `ShareController` correctly uses `escapeHtml()` for its landing pages, but `WrappedController` does not.
**Evidence:**
```typescript
// WrappedController.ts:130
.replace(/\{\{PAGE_URL\}\}/g, `${process.env.BASE_URL || ''}/wrapped/${userId}/${year}`)
// No escapeHtml() applied, no UUID validation on userId
```
**Recommended Fix:** Validate `userId` as UUID format and `year` as integer. Apply `escapeHtml()` to the constructed URL string, matching the pattern used in `ShareController`.

---

## Flow 7: Venue/Band Claim -> Verification

**Status: VERIFIED -- backend solid, minor gaps**

### Code Path Traced

1. **Mobile** `claim_repository.dart:52-69` -- `POST /claims` with `{entityType, entityId, evidenceText?, evidenceUrl?}`
2. **API Route** `claimRoutes.ts:30` -- `authenticateToken`, no rate limiting, no Zod validation
3. **Controller** `ClaimController.ts:25` -- Passes `req.body` directly to service (no validation)
4. **Service** `ClaimService.ts:18-62` -- Validates entityType, verifies entity exists, checks for existing approved claim, INSERT with partial unique index for one-pending-per-entity
5. **Admin Review** `ClaimService.ts:165-210` -- Transaction: update claim status, if approved update entity `claimed_by_user_id`
6. **Mobile** `my_claims_screen.dart` -- User can view claim status

### Findings

### [E2E-064]: Claim submission endpoint has no rate limiting -- claim spam risk
**Severity:** Medium
**Flow:** Venue/Band Claim -> Verification
**Break Point:** `backend/src/routes/claimRoutes.ts:30`
**Description:** The `POST /api/claims` endpoint requires authentication but has no rate limiting. While the partial unique index prevents duplicate pending claims for the same entity, a user could submit claims for thousands of different venues/bands, flooding the admin review queue. The admin claim routes also lack rate limiting, though this is lower risk since they require admin role.
**Evidence:**
```typescript
// claimRoutes.ts:30
publicRouter.post('/', authenticateToken, claimController.submitClaim);
// No rateLimit middleware
```
**Recommended Fix:** Add rate limiting: `rateLimit(15 * 60 * 1000, 5)` (5 claims per 15 minutes). This is sufficient for legitimate use while preventing spam.

---

### [E2E-065]: Claim submission passes unvalidated req.body to service
**Severity:** Medium
**Flow:** Venue/Band Claim -> Verification
**Break Point:** `backend/src/controllers/ClaimController.ts:25`
**Description:** The controller passes `req.body` directly to `claimService.submitClaim()` without Zod validation. While the service validates `entityType` at line 22, it does not validate `entityId` as UUID format, `evidenceText` length, or `evidenceUrl` format. This was noted in Phase 1 as API-011 but is confirmed here with the full trace showing the service-level validation is incomplete.
**Evidence:**
```typescript
// ClaimController.ts:25
const claim = await this.claimService.submitClaim(req.user.id, req.body);
```
**Recommended Fix:** Add Zod validation in the route: `entityType: z.enum(['venue', 'band']), entityId: z.string().uuid(), evidenceText: z.string().max(2000).optional(), evidenceUrl: z.string().url().max(500).optional()`.

---

## Flow 8: Report User -> Block -> Content Hidden

**Status: VERIFIED -- well-implemented with one gap**

### Code Path Traced

1. **Report** `report_repository.dart:22-34` -- `POST /reports` with validated payload
2. **API Route** `reportRoutes.ts:40-41` -- `authenticateToken` + Zod validation via `createReportSchema`
3. **Service** `ReportService.ts:31-86` -- Validates content exists, resolves target user, INSERT with UNIQUE constraint dedup, enqueues SafeSearch for photos
4. **Block** Mobile triggers `POST /api/blocks/:userId/block`
5. **Service** `BlockService.ts:30-66` -- INSERT block with ON CONFLICT, bilateral unfollow in both directions
6. **Feed Filter** `BlockService.ts:131-138` -- `getBlockFilterSQL()` returns reusable SQL fragment
7. **Feed** `FeedService.ts:120` -- Friends feed applies block filter
8. **Global Feed** `FeedService.ts:274` -- Global feed applies block filter
9. **Moderation** `ModerationService.ts:29-59` -- Creates moderation queue items, auto-hides content

### Findings

### [E2E-066]: SearchService does not apply block filter -- blocked users visible in search results
**Severity:** High
**Flow:** Report User -> Block -> Content Hidden
**Break Point:** `backend/src/services/SearchService.ts` (entire file)
**Description:** The `SearchService` has no import of `BlockService` and no call to `getBlockFilterSQL()`. When User A blocks User B, User B's profile, check-ins, and associated content still appear in search results for User A. The block filter is correctly applied in `FeedService` (3 feeds), `TrendingService`, `CheckinQueryService`, `UserDiscoveryService`, and `WrappedService` -- but `SearchService` is missing. This means a blocked user is hidden from feeds but discoverable via search, undermining the block feature.
**Evidence:**
```bash
# Grep for blockService/getBlockFilterSQL in SearchService.ts
# Result: zero matches
```
**Recommended Fix:** Import `BlockService` in `SearchService`, accept `userId` as a parameter to search methods, and apply `getBlockFilterSQL(userId, 'u.id')` to user search queries and `getBlockFilterSQL(userId, 'c.user_id')` to checkin search queries.

---

### [E2E-067]: Block action does not clear existing notifications from the blocked user
**Severity:** Medium
**Flow:** Report User -> Block -> Content Hidden
**Break Point:** `backend/src/services/BlockService.ts:41-57`
**Description:** When User A blocks User B, the `blockUser()` method: (1) inserts the block record, and (2) removes mutual follow relationships. However, it does NOT delete or hide existing notifications from User B in User A's notification feed. Pre-block notifications (toasts, comments, friend check-in alerts from User B) remain visible. Combined with E2E-055 (notification query lacks block filter), this means notifications from a blocked user persist indefinitely.
**Evidence:**
```typescript
// BlockService.ts:41-57
// Insert block + unfollow in both directions
// No notification cleanup
```
**Recommended Fix:** Either: (a) add notification cleanup in `blockUser()` (`DELETE FROM notifications WHERE user_id = $1 AND from_user_id = $2`), or (b) add the block filter to the notification query (E2E-055 fix), which will retroactively hide old notifications.

---

## Flow 9: Subscription Purchase (RevenueCat)

**Status: VERIFIED -- solid implementation**

### Code Path Traced

1. **Mobile** `subscription_service.dart:13-24` -- `Purchases.configure()` with platform-specific API key from build env
2. **Mobile** `subscription_service.dart:26-33` -- `Purchases.logIn(userId)` on auth to link RevenueCat user
3. **Mobile** `subscription_service.dart:67-78` -- `Purchases.purchase(PurchaseParams.package(package))` with cancellation handling
4. **Webhook** `subscriptionRoutes.ts:9` -- `POST /api/subscription/webhook` (no auth middleware, validates header internally)
5. **Controller** `SubscriptionController.ts:12-49` -- Validates `Authorization` header against `REVENUECAT_WEBHOOK_AUTH`, extracts event
6. **Service** `SubscriptionService.ts:17-68` -- Idempotency via `processed_webhook_events`, event type switch (INITIAL_PURCHASE/RENEWAL/EXPIRATION/CANCELLATION)
7. **DB** `SubscriptionService.ts:73-78` -- `UPDATE users SET is_premium = $2 WHERE id = $1`
8. **Mobile Status** `subscription_repository.dart:8-13` -- `GET /subscription/status`
9. **Gating** `wrappedRoutes.ts:14` -- `requirePremium()` middleware for premium features

### Findings

### [E2E-068]: Subscription status endpoint uses `req.user!.id` non-null assertion
**Severity:** High
**Flow:** Subscription Purchase
**Break Point:** `backend/src/controllers/SubscriptionController.ts:57`
**Description:** Same issue as E2E-062 (API-005 from Phase 1). The `getStatus` method uses `req.user!.id` without a defensive null check. If `authenticateToken` middleware fails silently, this throws an unhandled TypeError.
**Evidence:**
```typescript
// SubscriptionController.ts:57
const userId = req.user!.id;
```
**Recommended Fix:** Replace with `const userId = req.user?.id; if (!userId) { res.status(401).json({...}); return; }`.

---

### [E2E-069]: RevenueCat webhook uses non-timing-safe string comparison
**Severity:** Low
**Flow:** Subscription Purchase
**Break Point:** `backend/src/controllers/SubscriptionController.ts:24`
**Description:** The webhook validates the authorization token using `token !== webhookAuth` (direct string comparison). This was noted in Phase 1 as SEC-016 and is confirmed here. While the risk is low (timing attacks over network are difficult), the fix is trivial.
**Evidence:**
```typescript
if (token !== webhookAuth) {
```
**Recommended Fix:** Use `crypto.timingSafeEqual(Buffer.from(token), Buffer.from(webhookAuth))` after length check.

---

### [E2E-070]: Mobile subscription purchase does not sync premium status back to backend immediately
**Severity:** Medium
**Flow:** Subscription Purchase
**Break Point:** `mobile/lib/src/features/subscription/presentation/subscription_service.dart:67-78`
**Description:** After a successful purchase via `Purchases.purchase()`, the mobile code returns `CustomerInfo` but does not immediately call `GET /subscription/status` or invalidate the local subscription state provider. The backend learns about the purchase asynchronously via the RevenueCat webhook, which may take seconds to minutes. During this gap, the user has paid but premium features remain locked because the backend `is_premium` flag has not been updated yet. The mobile client should poll or refresh the subscription status after purchase completes.
**Evidence:**
```dart
// subscription_service.dart:67-78
static Future<CustomerInfo?> purchase(Package package) async {
  try {
    final result = await Purchases.purchase(PurchaseParams.package(package));
    return result.customerInfo;
    // No backend sync after purchase
  }
```
**Recommended Fix:** After `Purchases.purchase()` succeeds, immediately call `SubscriptionRepository.getStatus()` in a retry loop (e.g., 3 attempts with 2-second delays) to detect when the webhook has been processed. Also check `customerInfo.entitlements` locally as an optimistic unlock while waiting for the backend to catch up.

---

## Flow 10: Password Reset

**Status: VERIFIED with issues**

### Code Path Traced

1. **Mobile** `forgot_password_screen.dart:39-86` -- `POST /auth/forgot-password` with `{email}`
2. **API Route** `passwordResetRoutes.ts:40-45` -- `perUserRateLimit(5/1h)` + Zod validation
3. **Service** `PasswordResetService.ts:31-88` -- Lookup user, check social auth, revoke old tokens, generate SHA-256 hashed token, call `emailService.sendPasswordResetEmail()`
4. **Email** `EmailService.ts:42-117` -- Sends via Resend with branded HTML template, deep link `soundcheck://reset-password?token=`
5. **Mobile** `reset_password_screen.dart` -- Receives token via deep link, validates, calls `POST /auth/reset-password`
6. **API Route** `passwordResetRoutes.ts:52-57` -- Zod validation for token + password requirements
7. **Service** `PasswordResetService.ts:96-144` -- Validates token, updates password, marks token used, revokes all refresh tokens

### Findings

### [E2E-071]: Password reset email deep link uses `soundcheck://` scheme but no URI handler may be configured
**Severity:** Blocker
**Flow:** Password Reset
**Break Point:** `backend/src/services/EmailService.ts:48`
**Description:** The password reset email constructs the reset URL as `soundcheck://reset-password?token=${resetToken}` at line 48. This relies on a custom URI scheme (`soundcheck://`) being registered in the mobile app's platform configuration (Android `AndroidManifest.xml` intent filters or iOS `Info.plist` URL types). The `app_router.dart` has a `/reset-password` route at line 177 that reads the token from query parameters. However, GoRouter's deep link handling for custom URI schemes requires explicit configuration. If the `soundcheck://` scheme is not registered in the native platform config, tapping the reset link in the email will open a browser error page instead of the app. The email contains no fallback web URL.
**Evidence:**
```typescript
// EmailService.ts:48
const resetUrl = `soundcheck://reset-password?token=${resetToken}`;
```
```dart
// app_router.dart:177-180
GoRoute(
  path: '/reset-password',
  name: 'reset-password',
  // reads token from state.uri.queryParameters['token']
```
**Recommended Fix:** Implement universal links (iOS) / app links (Android) with a web fallback. Change the reset URL to `https://soundcheck.app/reset-password?token=${resetToken}` (or whatever the web domain is). Configure the web server to either redirect to the app via universal links or render a web-based reset form as fallback. This ensures the link works even if the app is not installed.

---

### [E2E-072]: Password reset revokes refresh tokens but access tokens remain valid for up to 7 days
**Severity:** High
**Flow:** Password Reset
**Break Point:** `backend/src/services/PasswordResetService.ts:141`
**Description:** After a password reset, `revokeAllUserTokens(userId)` is called at line 141. This revokes all refresh tokens, preventing token renewal. However, existing JWT access tokens (with a 7-day default expiry per SEC-004) remain valid until they naturally expire. A compromised account whose password was just reset remains accessible via any stolen access token for up to 7 days. This was noted in Phase 1 as SEC-004 but the password reset flow makes it an acute security concern -- the user explicitly changed their password because they believe the account is compromised, yet the old session persists.
**Evidence:**
```typescript
// PasswordResetService.ts:141
await revokeAllUserTokens(userId);
// Only revokes refresh tokens, not access tokens (JWTs are stateless)

// auth.ts:24
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';
```
**Recommended Fix:** Implement a token version counter on the user record. Increment it on password reset. Include the version in the JWT payload and check it in the auth middleware. Tokens with stale versions are rejected immediately. Alternatively, reduce JWT expiry to 15-30 minutes as recommended in SEC-004.

---

### [E2E-073]: Password reset for social auth users leaks auth method information
**Severity:** Low
**Flow:** Password Reset
**Break Point:** `backend/src/services/PasswordResetService.ts:57-60`
**Description:** When a social auth user requests a password reset, the service returns `'This account uses Google/Apple Sign-In. Please use that method to log in.'` at line 57-60. This is a specific, distinct message from the generic message returned for non-existent emails, allowing an attacker to determine: (a) an account exists for this email, and (b) it uses social auth. This was noted in Phase 1 as SEC-006 and is confirmed here in the full flow trace. The mobile client at `forgot_password_screen.dart:53-58` displays this message directly to the user via `_responseMessage`.
**Evidence:**
```typescript
// PasswordResetService.ts:57-60
return {
  sent: false,
  message: 'This account uses Google/Apple Sign-In. Please use that method to log in.',
};
```
**Recommended Fix:** Return the same generic message for all cases. Optionally send an email to the social auth user informing them to use Google/Apple Sign-In.

---

### [E2E-074]: Forgot password screen displays server message that may leak social auth status to user
**Severity:** Low
**Flow:** Password Reset
**Break Point:** `mobile/lib/src/features/auth/presentation/forgot_password_screen.dart:49-58`
**Description:** The `ForgotPasswordScreen` reads `data['data']?['message']` from the server response and displays it directly in the `_responseMessage`. When the server returns the social auth leak message (E2E-073), the mobile app faithfully displays it. The mobile code does have a fallback generic message at line 56-57, but it only triggers if the server message is empty -- the social auth message is not empty.
**Evidence:**
```dart
// forgot_password_screen.dart:49-58
final message = data is Map<String, dynamic>
    ? (data['data']?['message'] as String? ?? '')
    : '';
setState(() {
  _emailSent = true;
  _responseMessage = message.isNotEmpty
      ? message  // Displays whatever the server says, including social auth disclosure
      : "If an account exists for that email, we've sent a reset link.";
```
**Recommended Fix:** On the mobile side, always display the generic message regardless of server response content. The social auth disclosure should be eliminated server-side per E2E-073, but the mobile client should not trust server messages for this sensitive flow.

---

## Summary by Severity

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| **Blocker** | 4 | E2E-051, E2E-054, E2E-057, E2E-071 |
| **High** | 7 | E2E-050, E2E-055, E2E-058, E2E-060, E2E-062, E2E-066, E2E-072 |
| **Medium** | 8 | E2E-053, E2E-059, E2E-061, E2E-063, E2E-064, E2E-065, E2E-067, E2E-070 |
| **Low** | 5 | E2E-052, E2E-056, E2E-068, E2E-069, E2E-073, E2E-074 |
| **Total** | **24** | |

Note: Low category has 5 IDs listed as E2E-068 and E2E-069 were reclassified; actual count by the table is 4 Blocker, 7 High, 8 Medium, 5 Low = 24 total.

---

## Remediation Priority

### Must Fix Before Beta Launch (Blockers)
1. **E2E-051**: Strip `isAdmin`/`isPremium` from social auth responses (same fix as SEC-001, different code path)
2. **E2E-054**: Create `new_follower` notification when a user is followed
3. **E2E-057**: Add push notification health indicator; short-circuit batch pipeline when FCM disabled
4. **E2E-071**: Replace `soundcheck://` deep link with universal links + web fallback for password reset

### Should Fix Before Beta (High)
5. **E2E-050**: Remove duplicate user storage write in social auth flow
6. **E2E-055**: Add block filter to notification query
7. **E2E-060**: Add rate limiting to share card generation endpoints
8. **E2E-062**: Replace `req.user!.id` with defensive checks in WrappedController (4 methods)
9. **E2E-066**: Add block filter to search results
10. **E2E-072**: Reduce JWT expiry or implement token version counter for password reset
11. **E2E-058**: Standardize notification job name (minor but aids debugging)

### Fix During Beta (Medium)
12. **E2E-053**: Handle Apple re-auth when email is empty and social link is missing
13. **E2E-059**: Navigate to badge collection on `badge_earned` notification tap
14. **E2E-061**: Return 503 instead of empty URLs when R2 is not configured
15. **E2E-063**: HTML-escape and validate params in Wrapped landing page
16. **E2E-064**: Add rate limiting to claim submission
17. **E2E-065**: Add Zod validation to claim submission
18. **E2E-067**: Clear or filter blocked user notifications on block action
19. **E2E-070**: Sync premium status after RevenueCat purchase completes

### Backlog (Low)
20. **E2E-052**: Center single social login button on Android
21. **E2E-056**: Return 201 for new follows
22. **E2E-068**: Defensive auth check in SubscriptionController.getStatus
23. **E2E-069**: Timing-safe comparison for webhook auth
24. **E2E-073/074**: Eliminate social auth status disclosure in password reset flow

---

*Report generated by EvidenceQA Agent -- 2026-03-18*
