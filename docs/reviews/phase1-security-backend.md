# Phase 1 Backend Security Audit -- SoundCheck

**Audit Date:** 2026-03-18
**Auditor:** Security Engineer (automated code review)
**Scope:** Backend (Node.js / Express / TypeScript / PostgreSQL)
**Target:** Pre-beta hardening for invite-only launch (~500-2,000 users)
**Branch:** `master` at commit `148788e`

---

## Summary

| Severity | Count |
|----------|-------|
| Blocker  | 2     |
| High     | 5     |
| Medium   | 6     |
| Low      | 5     |
| **Total**| **18**|

**Overall Assessment:** The codebase demonstrates strong security foundations -- parameterized queries are used consistently, JWT implementation includes issuer/audience validation, rate limiting fails closed, and Helmet/CSP/CORS are properly configured. The two Blocker findings (admin-flag exposure and missing authorization on destructive endpoints) must be resolved before beta launch. The High findings should be addressed within the first sprint.

---

## Category 1: Authentication and Authorization

### SEC-001: User `isAdmin` and `isPremium` flags exposed in all auth responses
**Severity:** Blocker
**File(s):** `backend/src/utils/dbMappers.ts:23-24`, `backend/src/services/UserService.ts:50-54`, `backend/src/controllers/UserController.ts:30-48`
**Description:** The `mapDbUserToUser()` mapper includes `isAdmin` and `isPremium` in every User object. When `createUser()` or `authenticateUser()` returns an `AuthResponse`, the full User object (including `isAdmin`) is serialized to the client. This leaks the admin privilege flag to every user at registration and login, enabling attackers to identify admin accounts and target them. The `isPremium` field also lets competitors or scrapers enumerate premium subscriber status.

The `getUserByUsername` endpoint at line 200-210 of `UserController.ts` correctly strips these fields for public profiles, proving the team is aware of the concern -- but the auth responses do not apply the same filtering.

**Evidence:**
```typescript
// backend/src/utils/dbMappers.ts:22-24
isAdmin: row.is_admin ?? false,
isPremium: row.is_premium ?? false,

// backend/src/controllers/UserController.ts:30-31 (register endpoint)
const authResponse = await this.userService.createUser(userData);
// authResponse.user includes isAdmin, isPremium -- sent directly to client

// backend/src/controllers/UserController.ts:59 (login endpoint)
const authResponse = await this.userService.authenticateUser(loginData);
// Same issue -- full user object returned
```

**Recommended Fix:** Create a `sanitizeUserForClient()` function that strips `isAdmin`, `isPremium`, `email` (for public views), and `isActive` before serializing to API responses. Apply it in `UserController.register`, `UserController.login`, `SocialAuthService.generateAuthResult`, and the `/api/users/me` endpoint. Keep the internal `User` type complete for middleware checks.

---

### SEC-002: Venue and band DELETE endpoints lack ownership/admin authorization
**Severity:** Blocker
**File(s):** `backend/src/controllers/VenueController.ts:183-205`, `backend/src/controllers/BandController.ts:182-204`, `backend/src/routes/venueRoutes.ts:24`, `backend/src/routes/bandRoutes.ts:26`
**Description:** The `DELETE /api/venues/:id` and `DELETE /api/bands/:id` endpoints require authentication but do not verify the requesting user is an admin or the claimed owner. Any authenticated user can soft-delete any venue or band in the system. This is a data integrity attack vector -- a malicious user could delete all venues and bands before the system notices.

Contrast this with the `PUT /api/venues/:id` (update) handler at `VenueController.ts:139-155`, which correctly checks `isAdmin || isOwner`. The DELETE handler skips this check entirely.

**Evidence:**
```typescript
// backend/src/controllers/VenueController.ts:183-190
deleteVenue = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      // NO authorization check -- any authenticated user can delete
      await this.venueService.deleteVenue(id);
```

```typescript
// backend/src/routes/venueRoutes.ts:24
router.delete('/:id', authenticateToken, generalRateLimit, venueController.deleteVenue);
// Only authenticateToken -- no requireAdmin() or ownership check
```

**Recommended Fix:** Add the same `isAdmin || isOwner` authorization check used in the update handlers. At minimum, add `requireAdmin()` middleware to the DELETE routes until an ownership-based policy is defined.

---

### SEC-003: Social auth account linking does not require email ownership verification
**Severity:** High
**File(s):** `backend/src/services/SocialAuthService.ts:170-176`
**Description:** When a social login provides an email that matches an existing account, `authenticateOrCreate()` automatically links the social provider to that existing account without requiring the user to prove they own the existing account (e.g., by entering their password). An attacker who controls a Google/Apple account with a victim's email address can hijack the victim's SoundCheck account by triggering the auto-link flow.

Google's `email_verified` check at line 71 mitigates this for Google (the attacker would need a verified Google account with the victim's email, which is extremely difficult). Apple's flow is similarly protected. However, the service-level logic lacks defense in depth -- if a new social provider is added without equivalent verification, the vulnerability opens up.

**Evidence:**
```typescript
// backend/src/services/SocialAuthService.ts:170-176
const existingUser = await this.findUserByEmail(profile.email);
if (existingUser) {
  // User exists - link this social account to their profile
  // NO password confirmation or email verification required
  await this.linkSocialAccount(existingUser.id, profile.provider, profile.providerId);
  return this.generateAuthResult(existingUser, false);
}
```

**Recommended Fix:** For account linking (where a social email matches an existing password-based account), require the user to confirm ownership through one of: (a) entering their existing password, (b) confirming a one-time code sent to the email, or (c) performing the link from within an authenticated session. Return a response indicating the link requires confirmation rather than auto-linking.

---

### SEC-004: JWT access tokens not revocable on logout or password change
**Severity:** High
**File(s):** `backend/src/utils/auth.ts:24`, `backend/src/routes/tokenRoutes.ts:133-167`
**Description:** Access tokens (JWTs) have a 7-day default expiry and no revocation mechanism. The token revocation endpoint (`POST /api/tokens/revoke`) only revokes refresh tokens, not access tokens. After a password reset (which correctly calls `revokeAllUserTokens()`), existing access tokens remain valid for up to 7 days. This means:
- A compromised access token cannot be invalidated
- After password change, old sessions persist for up to 7 days
- Account deactivation does not immediately terminate access (the middleware does check `isActive`, which mitigates this partially)

The middleware does re-verify the user's active status on every request (auth.ts:46-48), which is good. But a stolen token for an active account remains valid until expiry.

**Evidence:**
```typescript
// backend/src/utils/auth.ts:24
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

// backend/src/services/PasswordResetService.ts:141
await revokeAllUserTokens(userId);
// Only revokes refresh tokens, not access tokens
```

**Recommended Fix:** Reduce `JWT_EXPIRES_IN` to 15-30 minutes for beta. The refresh token rotation system already in place will handle seamless re-authentication. For higher security, implement a token version counter on the user record and include it in the JWT payload -- increment on password change or security events, reject tokens with stale versions in the middleware.

---

### SEC-005: AdminController methods exist but no admin routes are registered
**Severity:** High
**File(s):** `backend/src/controllers/AdminController.ts`, `backend/src/index.ts`
**Description:** `AdminController` defines methods like `getStats`, `getTopVenues`, `getUserActivity`, `clearCache`, and `moderateContent` with a comment stating "All routes should be protected with admin middleware." However, no admin routes file imports or registers these endpoints. This means either: (a) the admin functionality is dead code (benign), or (b) it was previously wired up and the routes were accidentally removed, leaving the controller orphaned.

The risk is that someone re-wires these routes without proper auth. The `moderateContent` method (line 267) accepts raw `action`, `targetType`, and `targetId` from `req.body` with minimal validation -- if exposed, it enables arbitrary user banning and venue deletion.

**Evidence:**
```bash
# No route file imports AdminController
$ grep -r "AdminController" backend/src/routes/
# (no matches)
```

```typescript
// backend/src/controllers/AdminController.ts:267-284
async moderateContent(req: Request, res: Response): Promise<void> {
    const { action, targetType, targetId, reason } = req.body;
    // Only validates presence, not format
    // action=ban_user with any targetId deactivates that user
```

**Recommended Fix:** Either delete `AdminController.ts` if it is fully superseded by the moderation routes, or create an explicit `adminRoutes.ts` that wires all methods behind `authenticateToken` + `requireAdmin()`. Do not leave controller code with destructive operations unrouted -- it will eventually be re-connected without proper review.

---

### SEC-006: Password reset leaks social auth status (email enumeration variant)
**Severity:** Medium
**File(s):** `backend/src/services/PasswordResetService.ts:55-61`
**Description:** The `requestReset` method returns a distinct message for social auth users: "This account uses Google/Apple Sign-In." While the generic message is used for non-existent emails (good), the social auth message reveals that an account exists AND uses social authentication. This is an information disclosure that helps attackers enumerate accounts and understand their auth mechanisms.

**Evidence:**
```typescript
// backend/src/services/PasswordResetService.ts:57-60
return {
  sent: false,
  message: 'This account uses Google/Apple Sign-In. Please use that method to log in.',
};
```

**Recommended Fix:** Return the same generic message for all cases: "If an account exists for that email, we've sent a password reset link." Optionally send an email to social auth users informing them they should use Google/Apple Sign-In, rather than disclosing this via API response.

---

### SEC-007: Email and username availability endpoints enable user enumeration
**Severity:** Medium
**File(s):** `backend/src/routes/userRoutes.ts:168-169`, `backend/src/controllers/UserController.ts:271-329`
**Description:** `GET /api/users/check-email?email=...` and `GET /api/users/check-username/:username` are public endpoints (no auth required) that explicitly return whether an email or username is registered. While necessary for registration UX, they enable attackers to enumerate registered users at scale. The general rate limit (30 per 15 minutes per IP) provides some protection, but is insufficient against distributed enumeration.

**Evidence:**
```typescript
// backend/src/controllers/UserController.ts:309-313
const existingUser = await this.userService.findByEmail(email as string);
const isAvailable = !existingUser;
res.status(200).json({
  success: true,
  data: { email, available: isAvailable },
});
```

**Recommended Fix:** For beta, the current rate limiting is acceptable. For production, consider: (a) requiring a CAPTCHA or proof-of-work token for these endpoints, (b) adding per-IP daily limits specifically for enumeration endpoints (e.g., 20 checks per day), or (c) requiring the full registration payload before revealing availability (so enumeration requires submitting plausible registration data).

---

## Category 2: Injection and Input Validation

### SEC-008: ClaimService uses string-interpolated table names in SQL queries
**Severity:** Medium
**File(s):** `backend/src/services/ClaimService.ts:27-29`, `backend/src/services/ClaimService.ts:193-195`
**Description:** The `ClaimService` constructs SQL queries using template literals for table names:
```typescript
const table = entityType === 'venue' ? 'venues' : 'bands';
await this.db.query(`SELECT id FROM ${table} WHERE id = $1`, [entityId]);
```
The `entityType` is validated at line 22-24 to only accept `'venue'` or `'band'`, which means the table name is constrained to exactly `'venues'` or `'bands'`. This is NOT a SQL injection vulnerability in practice because the value is derived from a strict equality check, not from user input directly.

However, this pattern is fragile. If the validation is ever loosened, removed, or bypassed (e.g., by calling `submitClaim` from another service without the guard), SQL injection becomes possible. The same pattern appears at line 193.

**Evidence:**
```typescript
// backend/src/services/ClaimService.ts:22-29
if (entityType !== 'venue' && entityType !== 'band') {
  throw new BadRequestError('entityType must be "venue" or "band"');
}
const table = entityType === 'venue' ? 'venues' : 'bands';
// table is safely constrained here, but pattern is fragile
const entityResult = await this.db.query(
  `SELECT id FROM ${table} WHERE id = $1 AND is_active = true`,
  [entityId]
);
```

**Recommended Fix:** Use an explicit lookup map instead of string interpolation:
```typescript
const TABLE_MAP: Record<string, string> = { venue: 'venues', band: 'bands' };
const table = TABLE_MAP[entityType];
if (!table) throw new BadRequestError('Invalid entity type');
```
This makes the constraint self-documenting and immune to validation bypass.

---

### SEC-009: Comment text has no length validation or sanitization
**Severity:** Medium
**File(s):** `backend/src/controllers/CheckinController.ts:282-294`
**Description:** The `addComment` endpoint only checks that `commentText` is not empty. It does not enforce a maximum length, check for embedded HTML/script tags, or sanitize the content. While the API returns JSON (not HTML), excessively long comments can:
- Cause database storage bloat
- Degrade feed rendering performance on mobile
- Be used for stored XSS if any future web client renders comments as HTML

**Evidence:**
```typescript
// backend/src/controllers/CheckinController.ts:285-290
if (!commentText || commentText.trim() === '') {
  // Only checks emptiness -- no max length, no sanitization
  res.status(400).json({ success: false, error: 'Comment text is required' });
  return;
}
const comment = await this.checkinService.addComment(userId, id, commentText);
```

**Recommended Fix:** Add Zod validation to the comment endpoint: `z.string().min(1).max(2000).trim()`. Also apply the same to checkin `comment` field in `createCheckin`. Consider a basic profanity/link filter for the beta.

---

### SEC-010: Discovery endpoints are unauthenticated and proxy to external APIs
**Severity:** Medium
**File(s):** `backend/src/routes/discoveryRoutes.ts:12-20`
**Description:** Four discovery endpoints (`/api/discover/venues`, `/api/discover/setlists`, `/api/discover/bands`, `/api/discover/bands/genre`) are completely unauthenticated and have no rate limiting. They proxy requests to setlist.fm and MusicBrainz APIs using the server's API keys. An attacker can use these endpoints as free proxy to exhaust the project's API quotas on these third-party services, or to scrape data from those services using SoundCheck as an intermediary.

**Evidence:**
```typescript
// backend/src/routes/discoveryRoutes.ts:12-20
router.get('/venues', discoveryController.searchVenues);
router.get('/setlists', discoveryController.searchSetlists);
router.get('/bands', discoveryController.searchBands);
router.get('/bands/genre', discoveryController.searchBandsByGenre);
// No authenticateToken, no rateLimit
```

**Recommended Fix:** Add `authenticateToken` and a per-user rate limit (e.g., `createPerUserRateLimit(RateLimitPresets.read)`) to all discovery endpoints. At minimum, add IP-based rate limiting to prevent quota exhaustion.

---

## Category 3: Data Exposure

### SEC-011: Sentry `setUser` sends email in error tracking context
**Severity:** Medium
**File(s):** `backend/src/middleware/auth.ts:60`, `backend/src/utils/sentry.ts:107-110`
**Description:** The auth middleware sends the user's email to Sentry via `setUser({ id, email, username })`. While Sentry does scrub authorization headers (sentry.ts:37-41), the email is explicitly attached as user context and will appear in every error event for that session. This means PII (email addresses) is stored in a third-party system (Sentry), which may have compliance implications under GDPR/CCPA.

**Evidence:**
```typescript
// backend/src/middleware/auth.ts:60
sentrySetUser({ id: user.id, email: user.email, username: user.username });

// backend/src/utils/sentry.ts:107-110
export function setUser(user: { id: string; email?: string; username?: string }): void {
  if (!sentryInitialized) return;
  Sentry.setUser(user);
}
```

**Recommended Fix:** Remove `email` from the Sentry user context. Use only `id` and optionally `username` for error correlation. If email is needed for debugging, use Sentry's data scrubbing rules to hash it before storage, or look up the user by ID in your own database.

---

### SEC-012: Admin user activity endpoint exposes user email to admin API
**Severity:** Low
**File(s):** `backend/src/controllers/AdminController.ts:140`
**Description:** The `getUserActivity` admin endpoint returns `SELECT id, username, email, created_at FROM users`. While this is admin-only, exposing raw email addresses in API responses increases the blast radius if an admin account is compromised. The admin does not need email for activity monitoring.

**Evidence:**
```typescript
// backend/src/controllers/AdminController.ts:140
const usersResult = await db.query(
  'SELECT id, username, email, created_at FROM users WHERE id = $1', [userId]
);
```

**Recommended Fix:** Remove `email` from the admin activity query and return only `id`, `username`, and `created_at`. If admins need email for specific operations, provide a separate, more tightly audited endpoint.

---

## Category 4: Rate Limiting

### SEC-013: Event creation and deletion endpoints lack rate limiting
**Severity:** Low
**File(s):** `backend/src/routes/eventRoutes.ts:35`, `backend/src/routes/eventRoutes.ts:41`
**Description:** `POST /api/events` (create) and `DELETE /api/events/:id` (delete) have no rate limiting. An authenticated user could create thousands of spam events or rapidly delete events. Other write-heavy routes (follow, wishlist, check-in) correctly apply rate limits.

**Evidence:**
```typescript
// backend/src/routes/eventRoutes.ts:35
router.post('/', authenticateToken, eventController.createEvent);
// No rateLimit middleware

// backend/src/routes/eventRoutes.ts:41
router.delete('/:id', authenticateToken, eventController.deleteEvent);
// No rateLimit middleware
```

**Recommended Fix:** Add rate limiting consistent with other write endpoints: `rateLimit(15 * 60 * 1000, 10)` for creation and `rateLimit(15 * 60 * 1000, 20)` for deletion.

---

### SEC-014: Notification and feed endpoints lack rate limiting
**Severity:** Low
**File(s):** `backend/src/routes/notificationRoutes.ts`, `backend/src/routes/feedRoutes.ts`
**Description:** All notification endpoints (`GET /`, `POST /read-all`, `POST /:id/read`, `DELETE /:id`) and all feed endpoints (`GET /friends`, `GET /global`, etc.) have no rate limiting. While these are authenticated, a malicious user or a buggy client polling rapidly could create excessive database load.

**Evidence:**
```typescript
// backend/src/routes/notificationRoutes.ts -- no rateLimit on any route
router.get('/', notificationController.getNotifications);
router.post('/read-all', notificationController.markAllAsRead);

// backend/src/routes/feedRoutes.ts -- no rateLimit on any route
router.get('/friends', feedController.getFriendsFeed);
router.get('/global', feedController.getGlobalFeed);
```

**Recommended Fix:** Add `rateLimit(60 * 1000, 30)` (30 per minute) to read endpoints and `rateLimit(60 * 1000, 10)` to write endpoints on both routers.

---

## Category 5: Secrets and Configuration

### SEC-015: Hardcoded demo password in seed script
**Severity:** Low
**File(s):** `backend/src/scripts/seed-demo.ts:11`
**Description:** The demo seed script contains a hardcoded password: `const DEMO_PASSWORD = 'SoundCheck2026!';`. While this is a development script and not deployed, it establishes a pattern where someone might create real demo accounts with this known password in a staging or production environment.

**Evidence:**
```typescript
// backend/src/scripts/seed-demo.ts:11
const DEMO_PASSWORD = 'SoundCheck2026!';
```

**Recommended Fix:** Generate a random password for each demo user at seed time, or read the demo password from an environment variable. Add a guard that prevents this script from running when `NODE_ENV=production`.

---

### SEC-016: Subscription webhook uses simple string comparison for auth
**Severity:** Low
**File(s):** `backend/src/controllers/SubscriptionController.ts:24`
**Description:** The RevenueCat webhook validates its authorization using direct string comparison (`token !== webhookAuth`). While this works, it is vulnerable to timing attacks where an attacker can determine the correct token value byte-by-byte by measuring response times. The risk is mitigated by the low value of the webhook endpoint (it can only toggle premium status) and the difficulty of timing attacks over the network.

**Evidence:**
```typescript
// backend/src/controllers/SubscriptionController.ts:24
if (token !== webhookAuth) {
  logger.warn('SubscriptionController: Invalid webhook authorization');
  res.status(401).json({ error: 'Unauthorized' });
  return;
}
```

**Recommended Fix:** Use `crypto.timingSafeEqual()` for the comparison:
```typescript
const isValid = token.length === webhookAuth.length &&
  crypto.timingSafeEqual(Buffer.from(token), Buffer.from(webhookAuth));
```

---

## Category 6: Security Hardening

### SEC-017: WebSocket room names are not validated or scoped
**Severity:** High
**File(s):** `backend/src/utils/websocket.ts:196-199`
**Description:** Authenticated WebSocket clients can join any room by sending `{ type: 'join_room', payload: { room: 'any-string' } }`. Room names are not validated against a whitelist or scoped to resources the user has access to. This means:
- A user can join `event:XXX` rooms for events they did not RSVP to, enabling surveillance of other users' real-time check-in activity
- A user can join `checkin:XXX` rooms for check-ins they don't own, receiving real-time toast/comment notifications
- A user could potentially discover active rooms by iterating IDs

The auth gate at line 182-189 correctly requires authentication before room operations, but does not verify authorization for specific rooms.

**Evidence:**
```typescript
// backend/src/utils/websocket.ts:196-199
case 'join_room':
  this.joinRoom(clientId, payload.room);
  // No validation that the user should have access to this room
  break;
```

**Recommended Fix:** Implement room name validation:
- `checkin:UUID` rooms: verify the user owns the checkin or is a follower of the owner
- `event:UUID` rooms: verify the user has RSVP'd or checked in to the event
- Reject room names that don't match expected patterns

For beta, at minimum validate the room name format (e.g., must match `/^(checkin|event|venue):[0-9a-f-]+$/`) and log suspicious join attempts.

---

### SEC-018: CORS allows all origins when `CORS_ORIGIN` is not set in production
**Severity:** High
**File(s):** `backend/src/index.ts:116-118`, `backend/src/index.ts:336-338`
**Description:** The CORS configuration allows requests with no `Origin` header (mobile apps, Postman). More critically, the startup warning at line 336-338 reveals that if `CORS_ORIGIN` is not set in production, CORS will effectively allow all origins because requests without an `Origin` header (which includes all mobile app requests) are always allowed at line 118.

While the app is mobile-first and the API returns JSON (limiting direct browser exploitation), an unset `CORS_ORIGIN` means any web page can make authenticated requests to the API if the user's JWT is somehow available in a browser context (e.g., via a future web client or a debug tool).

The warning message at line 337 is misleading: it says "CORS will allow all origins" but the actual behavior at line 127-129 rejects requests that DO have an origin header. The risk is in the null-origin allowance.

**Evidence:**
```typescript
// backend/src/index.ts:116-118
// Allow requests with no origin (mobile apps, Postman, etc.)
if (!origin) return callback(null, true);

// backend/src/index.ts:126-129
const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin) {
  logError('CORS: CORS_ORIGIN not configured, rejecting request from:', { origin });
  return callback(new Error('CORS not configured'), false);
}
```

**Recommended Fix:** Require `CORS_ORIGIN` as a mandatory environment variable in production (add to the `requiredEnvVars` check at line 70). For a mobile-only API, set it to the specific domain(s) used for the web admin panel. The null-origin allowance for mobile apps is acceptable since mobile apps don't use CORS.

---

## Positive Findings (Security Controls Working Well)

The following security controls are correctly implemented and deserve recognition:

1. **Parameterized queries everywhere**: All 50+ SQL queries reviewed use `$1, $2, ...` parameterized queries via `pg`. No string concatenation SQL injection vectors were found (SEC-008 is a table name pattern concern, not actual injection).

2. **JWT implementation is solid**: Issuer (`soundcheck-api`) and audience (`soundcheck-mobile`) claims are set and verified. Minimum 32-character secret enforced. Algorithm is explicitly set (no `alg:none` attack). Expiry is enforced.

3. **Password security is strong**: bcrypt with 12 salt rounds, password complexity validation (uppercase, lowercase, number, special character, 8+ characters), passwords never logged or returned in responses.

4. **Rate limiting fails closed**: Both Redis-based and in-memory rate limiters deny requests when the rate limiting system itself fails (auth.ts:267-274, redisRateLimiter.ts:86-88, checkinRateLimit.ts:51-56). This is the correct security posture.

5. **Refresh token rotation**: Token rotation is implemented in a transaction (tokenRoutes.ts:81-111) with SHA-256 hashing of stored tokens. Old tokens are revoked on refresh.

6. **Log sanitization**: The `logSanitizer.ts` utility redacts passwords, tokens, secrets, API keys, and authorization headers from log output. The `beforeSend` Sentry hook scrubs authorization headers.

7. **Path traversal protection**: The uploads route uses both `path.basename()` and resolved path validation to prevent directory traversal attacks (uploadsRoutes.ts:22-37).

8. **Helmet configuration**: CSP, HSTS, X-Frame-Options (deny), X-Content-Type-Options (nosniff), and referrer policy are all properly configured.

9. **Error message sanitization**: Production error handler at index.ts:292-297 returns "Internal server error" for 5xx errors, never exposing stack traces or internal messages. Stack traces are only included in development mode.

10. **Google token verification**: The `verifyGoogleToken` method checks `email_verified` (line 71) before accepting a Google identity, preventing unverified email attacks.

11. **Audit logging**: Security-relevant events (login, logout, profile changes, data exports, account deletions, social auth linking) are logged to an audit table with IP address and user agent.

---

## Remediation Priority

### Must fix before beta launch (Blockers)
1. **SEC-001**: Strip `isAdmin`/`isPremium` from client-facing API responses
2. **SEC-002**: Add admin/owner authorization to venue and band DELETE endpoints

### Fix in first sprint (High)
3. **SEC-004**: Reduce JWT expiry to 15-30 minutes
4. **SEC-005**: Delete or properly wire AdminController
5. **SEC-017**: Add room name validation to WebSocket
6. **SEC-018**: Make CORS_ORIGIN mandatory in production
7. **SEC-003**: Add account linking confirmation flow

### Fix before general availability (Medium)
8. **SEC-006**: Return generic message for social auth password resets
9. **SEC-008**: Use lookup map for ClaimService table names
10. **SEC-009**: Add comment length validation
11. **SEC-010**: Add auth and rate limiting to discovery endpoints
12. **SEC-011**: Remove email from Sentry user context
13. **SEC-007**: Add CAPTCHA or stricter rate limits to enumeration endpoints

### Backlog (Low)
14. **SEC-012**: Remove email from admin activity endpoint
15. **SEC-013**: Add rate limiting to event create/delete
16. **SEC-014**: Add rate limiting to notification/feed endpoints
17. **SEC-015**: Guard demo seed script against production use
18. **SEC-016**: Use timing-safe comparison for webhook auth
