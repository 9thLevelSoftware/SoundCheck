# Phase 1 API Review: Auth Middleware Coverage & Infrastructure Endpoints

**Reviewer:** API Tester Agent
**Date:** 2026-03-18
**Scope:** Auth middleware coverage on all 28 route files, rate limiting audit, WebSocket security, file upload flow, health check endpoint
**Target environment:** Public beta (500-2,000 users)

---

## Executive Summary

Reviewed 28 route files containing 107 endpoints. Auth middleware coverage is generally strong -- all sensitive endpoints require `authenticateToken`, and admin endpoints correctly layer `requireAdmin()`. However, the audit uncovered **2 Blockers**, **4 High-severity**, and **6 Medium-severity** issues. The most critical findings are missing authorization checks on destructive operations (band/venue/event delete), missing rate limiting on 8 route files (45+ endpoints), and the WebSocket server accepting unauthenticated connections without any handshake-level JWT check.

### Severity Distribution

| Severity | Count |
|----------|-------|
| Blocker  | 2     |
| High     | 4     |
| Medium   | 6     |
| Low      | 3     |
| **Total**| **15**|

---

## Part 1: Complete Auth Coverage Matrix

Legend:
- `AUTH` = `authenticateToken` required
- `AUTH*` = `router.use(authenticateToken)` applied to all routes in file
- `OPT` = `optionalAuth` applied
- `ADMIN` = `authenticateToken` + `requireAdmin()`
- `PREMIUM` = `authenticateToken` + `requirePremium()`
- `NONE` = No auth middleware
- `RL` = Rate limiting middleware applied
- `WEBHOOK` = Internal auth validation (not JWT middleware)

### badgeRoutes.ts (7 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/` | NONE | RL(100/15m) | Public: list all badges |
| GET | `/leaderboard` | NONE | RL(100/15m) | Public: leaderboard |
| GET | `/rarity` | NONE | RL(100/15m) | Public: rarity info |
| GET | `/my-badges` | AUTH | RL(100/15m) | User's earned badges |
| GET | `/my-progress` | AUTH | RL(100/15m) | Badge progress |
| POST | `/check-awards` | AUTH | RL(10/15m) | Trigger badge check |
| GET | `/user/:userId` | NONE | RL(100/15m) | Public: user badges |
| GET | `/:id` | NONE | RL(100/15m) | Public: badge detail |

**Status:** OK -- public read endpoints are appropriately unauthenticated.

### bandRoutes.ts (10 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/popular` | NONE | RL(100/15m) | Public |
| GET | `/trending` | NONE | RL(100/15m) | Public |
| GET | `/genres` | NONE | RL(100/15m) | Public |
| GET | `/genre/:genre` | NONE | RL(100/15m) | Public |
| GET | `/` | OPT | RL(100/15m) | Public with optional personalization |
| GET | `/:id` | OPT | RL(100/15m) | Public with optional personalization |
| POST | `/` | AUTH | RL(10/15m) | Create band |
| POST | `/import` | AUTH | RL(10/15m) | Import band |
| PUT | `/:id` | AUTH | RL(100/15m) | Update band -- controller checks admin/owner |
| DELETE | `/:id` | AUTH | RL(100/15m) | **FINDING: No authorization check** |
| GET | `/:id/events` | NONE | RL(100/15m) | Public |

**Status:** ISSUE FOUND -- see API-050.

### blockRoutes.ts (4 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/` | AUTH | RL(100/15m) | List blocked users |
| GET | `/:userId/status` | AUTH | RL(100/15m) | Check block status |
| POST | `/:userId/block` | AUTH | RL(30/15m) | Block user |
| DELETE | `/:userId/block` | AUTH | RL(30/15m) | Unblock user |

**Status:** OK.

### checkinRoutes.ts (13 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/feed` | AUTH* | NONE | Activity feed |
| GET | `/vibe-tags` | AUTH* | NONE | Vibe tags list |
| GET | `/` | AUTH* | NONE | Get checkins |
| POST | `/` | AUTH* | daily(10/day) | Create checkin |
| PATCH | `/:id/ratings` | AUTH* | NONE | Update ratings |
| POST | `/:id/photos` | AUTH* | NONE | Request photo upload |
| PATCH | `/:id/photos` | AUTH* | NONE | Confirm photo upload |
| GET | `/:id` | AUTH* | NONE | Get by ID |
| DELETE | `/:id` | AUTH* | NONE | Delete checkin |
| POST | `/:id/toast` | AUTH* | NONE | Toast |
| DELETE | `/:id/toast` | AUTH* | NONE | Untoast |
| GET | `/:id/toasts` | AUTH* | NONE | Get toasts |
| GET | `/:id/comments` | AUTH* | NONE | Get comments |
| POST | `/:id/comments` | AUTH* | NONE | Add comment |
| DELETE | `/:id/comments/:commentId` | AUTH* | NONE | Delete comment |

**Status:** Auth OK (router-level). ISSUE FOUND -- see API-055 (no IP/user rate limit on 12 of 13 endpoints).

### claimRoutes.ts (7 endpoints, dual router)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| POST | `/` (public) | AUTH | NONE | Submit claim |
| GET | `/me` (public) | AUTH | NONE | My claims |
| GET | `/stats/:entityType/:entityId` (public) | AUTH | NONE | Entity stats |
| GET | `/:id` (public) | AUTH | NONE | Claim by ID |
| GET | `/` (admin) | ADMIN | NONE | All claims |
| GET | `/pending` (admin) | ADMIN | NONE | Pending claims |
| PUT | `/:id/review` (admin) | ADMIN | NONE | Review claim |

**Status:** Auth OK. ISSUE FOUND -- see API-055 (no rate limiting).

### consentRoutes.ts (3 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/` | AUTH* | NONE | Get consents |
| POST | `/` | AUTH* | RL(30/15m) | Update consent |
| GET | `/:purpose/history` | AUTH* | NONE | Consent history |

**Status:** OK.

### dataExportRoutes.ts (1 endpoint)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/export` | AUTH | RL(1/5m) | GDPR data export |

**Status:** OK -- strong rate limiting on expensive operation.

### discoveryRoutes.ts (5 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/venues` | NONE | NONE | **FINDING: No rate limit** |
| GET | `/setlists` | NONE | NONE | **FINDING: No rate limit** |
| GET | `/bands` | NONE | NONE | **FINDING: No rate limit** |
| GET | `/bands/genre` | NONE | NONE | **FINDING: No rate limit** |
| GET | `/users/suggestions` | AUTH | PerUser(100/1m) | Follow suggestions |

**Status:** ISSUE FOUND -- see API-056. First 4 endpoints proxy to external APIs (setlist.fm, MusicBrainz) with no rate limiting, risking API key exhaustion.

### eventRoutes.ts (11 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/upcoming` | NONE | NONE | **FINDING: No rate limit** |
| GET | `/trending` | NONE | NONE | No rate limit |
| GET | `/discover` | AUTH | NONE | Nearby upcoming |
| GET | `/genre/:genre` | NONE | NONE | By genre |
| GET | `/search` | NONE | NONE | Search events |
| GET | `/recommended` | AUTH | NONE | Recommendations |
| GET | `/nearby` | AUTH | NONE | Nearby events |
| GET | `/lookup/:ticketmasterId` | AUTH | NONE | Ticketmaster lookup |
| POST | `/` | AUTH | NONE | Create event |
| GET | `/:id` | NONE | NONE | Get by ID |
| DELETE | `/:id` | AUTH | NONE | **FINDING: No authorization check** |

**Status:** ISSUES FOUND -- see API-050, API-055.

### feedRoutes.ts (7 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/friends` | AUTH* | NONE | Friends feed |
| GET | `/global` | AUTH* | NONE | Global feed |
| GET | `/events/:eventId` | AUTH* | NONE | Event feed |
| GET | `/happening-now` | AUTH* | NONE | Live events |
| GET | `/unseen` | AUTH* | NONE | Unseen counts |
| POST | `/mark-read` | AUTH* | NONE | Mark read |
| GET | `/` | AUTH* | NONE | Default (friends) |

**Status:** Auth OK. ISSUE FOUND -- see API-055 (no rate limiting on any endpoint).

### followRoutes.ts (3 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| POST | `/:userId` | AUTH* | RL(30/15m) | Follow |
| DELETE | `/:userId` | AUTH* | RL(30/15m) | Unfollow |
| GET | `/:userId/status` | AUTH* | NONE | Follow status |

**Status:** OK.

### moderationRoutes.ts (2 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/` | ADMIN* | NONE | Moderation queue |
| PATCH | `/:itemId` | ADMIN* | NONE | Review item |

**Status:** Auth OK. No rate limit, but admin-only so lower risk.

### notificationRoutes.ts (5 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/unread-count` | AUTH* | NONE | Unread count |
| POST | `/read-all` | AUTH* | NONE | Mark all read |
| GET | `/` | AUTH* | NONE | List notifications |
| POST | `/:id/read` | AUTH* | NONE | Mark one read |
| DELETE | `/:id` | AUTH* | NONE | Delete notification |

**Status:** Auth OK. ISSUE FOUND -- see API-055 (no rate limiting).

### onboardingRoutes.ts (4 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| POST | `/genres` | AUTH* | RL(30/15m) | Save genres |
| GET | `/genres` | AUTH* | RL(100/15m) | Get genres |
| POST | `/complete` | AUTH* | RL(30/15m) | Complete onboarding |
| GET | `/status` | AUTH* | RL(100/15m) | Get status |

**Status:** OK.

### passwordResetRoutes.ts (2 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| POST | `/forgot-password` | NONE | PerUser(5/1h) | Request reset |
| POST | `/reset-password` | NONE | PerUser(5/1h) | Execute reset |

**Status:** OK -- correctly unauthenticated with tight rate limiting.

### reportRoutes.ts (1 endpoint)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| POST | `/` | AUTH* | NONE | Submit report |

**Status:** Auth OK. ISSUE FOUND -- see API-055 (no rate limit, abuse vector for report spam).

### rsvpRoutes.ts (3 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/me` | AUTH* | RL(100/15m) | User RSVPs |
| POST | `/:eventId` | AUTH* | RL(60/15m) | Toggle RSVP |
| GET | `/:eventId/friends` | AUTH* | RL(100/15m) | Friends going |

**Status:** OK.

### searchRoutes.ts (3 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/` | AUTH | RL(60/15m) | Unified search |
| GET | `/users` | AUTH | RL(60/15m) | User search |
| GET | `/events` | NONE | RL(60/15m) | Event search (public) |

**Status:** OK.

### shareRoutes.ts (4 endpoints, dual router)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| POST | `/checkin/:checkinId` (api) | AUTH | NONE | Generate checkin card |
| POST | `/badge/:badgeAwardId` (api) | AUTH | NONE | Generate badge card |
| GET | `/c/:checkinId` (public) | NONE | NONE | Public landing page |
| GET | `/b/:badgeAwardId` (public) | NONE | NONE | Public landing page |

**Status:** Auth pattern OK. ISSUE FOUND -- see API-055, API-058 (no rate limit on card generation, which is CPU-intensive).

### socialAuthRoutes.ts (2 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| POST | `/google` | NONE | RL(5/15m) | Google sign-in |
| POST | `/apple` | NONE | RL(5/15m) | Apple sign-in |

**Status:** OK -- correctly public with tight auth rate limiting.

### subscriptionRoutes.ts (2 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| POST | `/webhook` | WEBHOOK | NONE | RevenueCat webhook |
| GET | `/status` | AUTH | NONE | Subscription status |

**Status:** Webhook validates `Authorization` header against `REVENUECAT_WEBHOOK_AUTH` env var internally. ISSUE FOUND -- see API-057 (no rate limit on webhook or status).

### tokenRoutes.ts (2 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| POST | `/refresh` | NONE | RL(10/15m) | Refresh token |
| POST | `/revoke` | NONE | RL(10/15m) | Revoke (logout) |

**Status:** OK -- correctly public with rate limiting. Token rotation is transactional.

### trendingRoutes.ts (1 endpoint)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/` | AUTH | RL(60/15m) | Trending data |

**Status:** OK.

### uploadsRoutes.ts (1 endpoint)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/profiles/:filename` | AUTH | NONE | Serve profile image |

**Status:** Auth OK. No rate limit but low risk since it serves static files.

### userRoutes.ts (16 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| POST | `/register` | NONE | RL(5/15m) | Register |
| POST | `/login` | NONE | RL(5/15m) | Login |
| GET | `/me` | AUTH | NONE | Get profile |
| PUT | `/me` | AUTH | NONE | Update profile |
| POST | `/me/profile-image` | AUTH | NONE | Upload image |
| DELETE | `/me` | AUTH | NONE | Deactivate |
| POST | `/me/delete-account` | AUTH | NONE | Request deletion |
| POST | `/me/cancel-deletion` | AUTH | NONE | Cancel deletion |
| GET | `/me/deletion-status` | AUTH | NONE | Deletion status |
| POST | `/device-token` | AUTH | NONE | Register push token |
| DELETE | `/device-token` | AUTH | NONE | Remove push token |
| GET | `/check-username/:username` | NONE | RL(30/15m) | Username availability |
| GET | `/check-email` | NONE | RL(30/15m) | Email availability |
| GET | `/:userId/followers` | NONE | RL(30/15m) | Public followers list |
| GET | `/:userId/following` | NONE | RL(30/15m) | Public following list |
| GET | `/:userId/stats` | AUTH | NONE | User stats |
| GET | `/:userId/concert-cred` | AUTH | NONE | Concert cred |
| GET | `/:username` | NONE | RL(30/15m) | Public profile |

**Status:** Auth pattern OK. ISSUE FOUND -- see API-055 (many authenticated endpoints lack rate limiting).

### venueRoutes.ts (9 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/popular` | NONE | RL(100/15m) | Public |
| GET | `/near` | NONE | RL(100/15m) | Public |
| GET | `/` | OPT | RL(100/15m) | Public with optional personalization |
| GET | `/:id` | OPT | RL(100/15m) | Public with optional personalization |
| POST | `/` | AUTH | RL(10/15m) | Create venue |
| POST | `/import` | AUTH | RL(10/15m) | Import venue |
| PUT | `/:id` | AUTH | RL(100/15m) | Update venue -- controller checks admin/owner |
| DELETE | `/:id` | AUTH | RL(100/15m) | **FINDING: No authorization check** |
| GET | `/:id/events` | NONE | RL(100/15m) | Public |

**Status:** ISSUE FOUND -- see API-050.

### wishlistRoutes.ts (6 endpoints)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/` | AUTH* | NONE | Get wishlist |
| GET | `/status` | AUTH* | NONE | Check status |
| POST | `/` | AUTH* | RL(30/15m) | Add to wishlist |
| DELETE | `/` | AUTH* | RL(30/15m) | Remove by band |
| DELETE | `/:wishlistId` | AUTH* | RL(30/15m) | Remove by ID |
| PATCH | `/:bandId/notify` | AUTH* | RL(30/15m) | Update preference |

**Status:** OK.

### wrappedRoutes.ts (5 endpoints, dual router)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/:year` (api) | AUTH | NONE | Wrapped stats (free) |
| GET | `/:year/detail` (api) | PREMIUM | NONE | Premium detail |
| POST | `/:year/card/summary` (api) | AUTH | NONE | Generate summary card |
| POST | `/:year/card/:statType` (api) | PREMIUM | NONE | Generate stat card |
| GET | `/:userId/:year` (public) | NONE | NONE | Public landing page |

**Status:** Auth OK. ISSUE FOUND -- see API-055, API-058 (no rate limit on card generation).

### Infrastructure Endpoints (index.ts)

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|------------|-------|
| GET | `/health` | NONE | NONE | Health check |
| GET | `/` | NONE | NONE | Root/version |
| GET | `/api/debug/sentry-test` | ADMIN | NONE | Debug route |

**Status:** OK -- health check and root correctly public.

---

## Part 2: Findings

### [API-050]: DELETE endpoints for bands, venues, and events lack authorization checks
**Severity:** Blocker
**File(s):**
- `backend/src/routes/bandRoutes.ts:26` (`DELETE /:id`)
- `backend/src/routes/venueRoutes.ts:24` (`DELETE /:id`)
- `backend/src/routes/eventRoutes.ts:41` (`DELETE /:id`)
- `backend/src/controllers/BandController.ts:182-196`
- `backend/src/controllers/VenueController.ts:183-196`
- `backend/src/controllers/EventController.ts:570-589`

**Description:** The `updateBand` and `updateVenue` controller methods correctly verify that the caller is either an admin or the claimed owner before allowing mutation. However, the `deleteBand`, `deleteVenue`, and `deleteEvent` controller methods perform NO authorization check -- any authenticated user can delete ANY band, venue, or event by ID. This is a privilege escalation vulnerability. At beta scale (500-2,000 users), a single malicious or compromised account could wipe the entire catalog.

**Evidence:**
```typescript
// BandController.ts:182 -- deleteBand has no ownership/admin check
deleteBand = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await this.bandService.deleteBand(id);  // No authorization -- any authed user can delete
    // ...
```

Contrast with `updateBand` which correctly checks:
```typescript
// BandController.ts:148-154
const isAdmin = !!req.user.isAdmin;
const isOwner = await this.bandService.isClaimedOwner(id, req.user.id);
if (!isAdmin && !isOwner) {
  res.status(403).json({ ... });
  return;
}
```

**Recommended Fix:** Add the same admin/owner authorization check to `deleteBand`, `deleteVenue`, and `deleteEvent` that already exists in their corresponding update methods. Consider adding `requireAdmin()` middleware at the route level as a defense-in-depth measure, since delete is more destructive than update.

---

### [API-051]: WebSocket server accepts unauthenticated connections with no handshake auth
**Severity:** Blocker
**File(s):** `backend/src/utils/websocket.ts:59-100`

**Description:** The WebSocket server (`new WebSocket.Server({ server })`) accepts all incoming WebSocket connections without validating any JWT during the HTTP upgrade handshake. Authentication only happens *after* the connection is established, via an `auth` message type. This means:

1. Any client can establish a WebSocket connection and consume server resources without proving identity.
2. Unauthenticated clients can receive the `connected` welcome message and send `ping` messages indefinitely.
3. Although room operations (`join_room`, `leave_room`) require prior `auth` message authentication (line 182-189), the broadcast method `broadcast()` sends to ALL clients regardless of auth status.
4. An attacker could open thousands of unauthenticated WebSocket connections to exhaust server memory and connection limits.

**Evidence:**
```typescript
// websocket.ts:59-61 -- No verifyClient callback, accepts all upgrades
this.wss = new WebSocket.Server({ server });

this.wss.on('connection', (ws: WebSocket, req) => {
  // Client is connected before any auth check
  const clientId = this.generateClientId();
  // ...
  this.send(clientId, 'connected', { clientId }); // Sends data to unauthenticated client
```

**Recommended Fix:** Use the `verifyClient` option on `WebSocket.Server` to validate JWT from the `Authorization` header or `?token=` query parameter during the HTTP upgrade handshake, before the connection is established:
```typescript
this.wss = new WebSocket.Server({
  server,
  verifyClient: (info, callback) => {
    const token = new URL(info.req.url!, 'http://localhost').searchParams.get('token');
    const payload = AuthUtils.verifyToken(token);
    if (!payload) {
      callback(false, 401, 'Authentication required');
      return;
    }
    (info.req as any).userId = payload.userId;
    callback(true);
  }
});
```

---

### [API-052]: `requireOwnership` middleware is defined but never used in any route
**Severity:** High
**File(s):** `backend/src/middleware/auth.ts:109-134`

**Description:** The `requireOwnership` middleware was built to verify that the authenticated user owns the resource they are accessing. However, a codebase-wide search shows it is only imported in the auth test file -- it is not used in any route file. Authorization checks are instead done ad-hoc inside individual controllers (e.g., `BandController.updateBand` checks `isClaimedOwner`), and some controllers skip the check entirely (see API-050). This creates inconsistency and is the root cause of API-050.

**Evidence:** Grep for `requireOwnership` across all source files returns results only in:
- `backend/src/middleware/auth.ts` (definition)
- `backend/src/__tests__/middleware/auth.test.ts` (tests)

No route file imports or uses it.

**Recommended Fix:** Adopt a consistent authorization strategy. Either:
1. Use `requireOwnership` middleware at the route level for resource-specific endpoints, or
2. Create a dedicated `requireAdminOrOwner` middleware that encapsulates the pattern currently duplicated in band/venue controllers.

---

### [API-053]: Health check endpoint does not verify Redis connectivity
**Severity:** High
**File(s):** `backend/src/index.ts:169-197`

**Description:** The `/health` endpoint checks database connectivity (`db.healthCheck()`) and reports WebSocket stats, but does NOT check Redis connectivity. Redis is used for distributed rate limiting, BullMQ job queues, and WebSocket pub/sub fan-out. If Redis goes down silently, all rate limiting fails closed (denying all requests per the fail-closed design in `redisRateLimiter.ts:86-88`), effectively causing a service outage. The health check should detect this so load balancers and monitoring can act.

**Evidence:**
```typescript
// index.ts:169-197 -- No Redis health check
app.get('/health', async (req, res) => {
  const db = Database.getInstance();
  const isDbHealthy = await db.healthCheck();
  const wsStats = getWebSocketStats();
  // ... no Redis ping or connectivity check
  data: {
    status: 'healthy',
    database: isDbHealthy ? 'connected' : 'disconnected',
    websocket: { ... },
    // Redis status is missing
  },
});
```

**Recommended Fix:** Add a Redis health check:
```typescript
const redisInstance = getRedis();
let redisHealthy = false;
if (redisInstance) {
  try {
    await redisInstance.ping();
    redisHealthy = true;
  } catch { /* leave false */ }
}
// Include in response: redis: redisHealthy ? 'connected' : 'disconnected'
// If !isDbHealthy || (!redisHealthy && redisInstance), set overall status to 'degraded'
```

---

### [API-054]: Health check has no timeout and may hang indefinitely
**Severity:** High
**File(s):** `backend/src/index.ts:169-197`, `backend/src/config/database.ts:134-142`

**Description:** The health check calls `db.healthCheck()` which executes `SELECT 1` against the database pool. If the database is slow or the connection pool is exhausted, this query can hang for the full PostgreSQL `statement_timeout` (typically 30s-60s by default). Health check endpoints should respond within 5 seconds to be useful for load balancers and container orchestrators (Railway, k8s). A hanging health check can cause cascading failures as the orchestrator fails to get a response and kills the pod.

**Evidence:**
```typescript
// database.ts:134-142 -- No timeout on health check query
public async healthCheck(): Promise<boolean> {
  try {
    await this.query('SELECT 1');  // No timeout parameter
    return true;
  } catch (error) { ... }
}
```

**Recommended Fix:** Add a query timeout:
```typescript
public async healthCheck(): Promise<boolean> {
  try {
    await this.query('SELECT 1', [], 5000); // 5 second timeout
    return true;
  } catch (error) { ... }
}
```
Or use `Promise.race` with a timeout at the health endpoint level.

---

### [API-055]: 8 route files with 45+ endpoints have no rate limiting at all
**Severity:** High
**File(s):** Multiple (listed below)

**Description:** The following route files apply NO rate limiting middleware (neither IP-based `rateLimit()` nor per-user `createPerUserRateLimit()`) on any endpoint. At beta scale, this allows individual users or bots to flood these endpoints with unlimited requests. The feed, notification, and checkin routes are particularly concerning as they involve database queries on every request.

**Route files with zero rate limiting:**

| Route File | Endpoint Count | Risk Level |
|------------|---------------|------------|
| `checkinRoutes.ts` | 13 (12 without RL) | High -- DB-heavy queries, social features |
| `eventRoutes.ts` | 11 | High -- DB queries, external API calls |
| `feedRoutes.ts` | 7 | High -- complex DB joins per request |
| `notificationRoutes.ts` | 5 | Medium -- frequent polling target |
| `claimRoutes.ts` | 7 | Medium -- admin endpoints + submissions |
| `reportRoutes.ts` | 1 | Medium -- spam report abuse vector |
| `shareRoutes.ts` | 4 (2 API + 2 public) | Medium -- card gen is CPU-intensive |
| `wrappedRoutes.ts` | 5 | Medium -- card gen is CPU-intensive |

Additionally, individual endpoints in otherwise rate-limited files lack coverage:
- `userRoutes.ts`: 10 authenticated endpoints (GET/PUT/POST/DELETE on `/me/*`, `/device-token`, `/:userId/stats`, `/:userId/concert-cred`) have no rate limiting
- `subscriptionRoutes.ts`: 2 endpoints (webhook + status) have no rate limiting

**Recommended Fix:** Apply baseline rate limiting. Suggested approach:
1. Add a global middleware in `index.ts` with a generous baseline (e.g., 200 requests/15 min per IP) for all `/api/*` routes
2. Add per-user rate limiting (`createPerUserRateLimit(RateLimitPresets.read)`) to read-heavy authenticated endpoints
3. Add strict per-user rate limiting to write endpoints (reports, comments, toasts)
4. Add `RateLimitPresets.expensive` to card generation endpoints (share, wrapped)

---

### [API-056]: Discovery routes proxy to external APIs with no rate limiting
**Severity:** Medium
**File(s):** `backend/src/routes/discoveryRoutes.ts:12-21`

**Description:** Four discovery endpoints (`/venues`, `/setlists`, `/bands`, `/bands/genre`) are fully public (no auth, no rate limit) and proxy requests to external APIs (setlist.fm and MusicBrainz). A bot or scraper could send thousands of requests through these endpoints, exhausting the application's API keys with these third-party services and potentially getting the app's API access revoked.

**Evidence:**
```typescript
// discoveryRoutes.ts:12-21 -- No auth, no rate limit
router.get('/venues', discoveryController.searchVenues);
router.get('/setlists', discoveryController.searchSetlists);
router.get('/bands', discoveryController.searchBands);
router.get('/bands/genre', discoveryController.searchBandsByGenre);
```

**Recommended Fix:** Add rate limiting at minimum. Consider requiring authentication:
```typescript
const discoveryRateLimit = rateLimit(15 * 60 * 1000, 30); // 30 per 15 min
router.get('/venues', discoveryRateLimit, discoveryController.searchVenues);
// ... etc
```

---

### [API-057]: Subscription webhook endpoint has no rate limiting
**Severity:** Medium
**File(s):** `backend/src/routes/subscriptionRoutes.ts:9`

**Description:** The `/api/subscription/webhook` endpoint validates the `Authorization` header against a shared secret (`REVENUECAT_WEBHOOK_AUTH`), but has no rate limiting. If the shared secret is leaked, an attacker could flood the webhook endpoint. Although the controller returns 200 on all errors (to prevent RevenueCat retry storms), each request still hits the database.

**Evidence:**
```typescript
// subscriptionRoutes.ts:9 -- No rate limit
router.post('/webhook', subscriptionController.handleWebhook);
```

**Recommended Fix:** Add rate limiting appropriate for webhook traffic:
```typescript
const webhookRateLimit = rateLimit(60 * 1000, 30); // 30/min (RevenueCat sends bursts)
router.post('/webhook', webhookRateLimit, subscriptionController.handleWebhook);
```

---

### [API-058]: Share/Wrapped card generation endpoints lack rate limiting on CPU-intensive operations
**Severity:** Medium
**File(s):**
- `backend/src/routes/shareRoutes.ts:28-31`
- `backend/src/routes/wrappedRoutes.ts:17-20`

**Description:** The card generation endpoints (POST `/api/share/checkin/:id`, POST `/api/share/badge/:id`, POST `/api/wrapped/:year/card/*`) generate images and upload them to R2. These are CPU-intensive operations with no rate limiting. A user could trigger thousands of card generations, consuming server CPU and R2 storage.

**Recommended Fix:** Apply `RateLimitPresets.expensive` (3/minute) to all card generation endpoints.

---

### [API-059]: R2 presigned URLs have no server-side file size enforcement
**Severity:** Medium
**File(s):** `backend/src/services/R2Service.ts:70-106`

**Description:** The `getPresignedUploadUrl` method generates presigned PUT URLs for direct client-to-R2 uploads. While content type is validated, there is no `Content-Length` restriction on the presigned URL. The multer middleware (`upload.ts`) enforces a 5MB limit for profile images uploaded through the server, but checkin photos go directly to R2 via presigned URLs. A client could upload arbitrarily large files (100MB+) directly to R2 using the presigned URL.

**Evidence:**
```typescript
// R2Service.ts:91-98 -- No ContentLength condition in PutObjectCommand
const uploadUrl = await getSignedUrl(
  this.s3,
  new PutObjectCommand({
    Bucket: this.bucket,
    Key: objectKey,
    ContentType: contentType,
    // Missing: ContentLength or Conditions to limit file size
  }),
  { expiresIn: 600 }
);
```

**Recommended Fix:** Add a `ContentLength` header condition or use S3 POST policy with a `content-length-range` condition. The AWS SDK supports conditions on presigned URLs:
```typescript
new PutObjectCommand({
  Bucket: this.bucket,
  Key: objectKey,
  ContentType: contentType,
  ContentLength: maxFileSize,  // Rejects uploads exceeding this
})
```
Alternatively, validate file size in the `confirmPhotoUpload` step by checking the object metadata from R2.

---

### [API-060]: WebSocket message rate limit is very permissive (100 messages/10 seconds)
**Severity:** Medium
**File(s):** `backend/src/utils/websocket.ts:165-175`

**Description:** The WebSocket message rate limiter allows 100 messages per 10-second window (600/minute). For a chat-adjacent feature that only handles `auth`, `join_room`, `leave_room`, and `ping` message types, this is excessively permissive. Combined with API-051 (unauthenticated connections accepted), an attacker could send 600 messages per minute across thousands of unauthenticated connections.

**Evidence:**
```typescript
// websocket.ts:165-172
// Rate limiting: max 100 messages per 10 seconds
if (now - client.lastMessageReset > 10000) {
  client.messageCount = 0;
  client.lastMessageReset = now;
}
client.messageCount++;
if (client.messageCount > 100) { ... }
```

**Recommended Fix:** Reduce to 20 messages per 10 seconds (reasonable for the 4 message types supported). Also close connections that repeatedly hit the rate limit rather than just sending an error message.

---

### [API-061]: `perUserRateLimit` middleware uses in-memory store in production
**Severity:** Medium
**File(s):** `backend/src/middleware/perUserRateLimit.ts:41-42`

**Description:** The `PerUserRateLimiter` class uses an in-memory `Map` for rate limit state. The file contains a comment "upgrade to Redis for production" (line 17). The IP-based `rateLimit()` in `auth.ts` correctly uses Redis when available with in-memory fallback. However, `perUserRateLimit` always uses in-memory, which means:

1. Rate limits are not shared across multiple Railway instances (if scaled horizontally)
2. Rate limits reset on every deploy/restart
3. Memory grows unbounded (though cleanup runs every 5 minutes)

This middleware is used on discovery user suggestions and password reset -- the password reset usage is particularly concerning since it means rate limits are per-instance, not global.

**Evidence:**
```typescript
// perUserRateLimit.ts:17 -- Acknowledged tech debt
// * In-memory storage (upgrade to Redis for production)

// perUserRateLimit.ts:41-42 -- Always in-memory
class PerUserRateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map();
```

**Recommended Fix:** For beta, either:
1. Migrate `PerUserRateLimiter` to use Redis (matching the pattern in `auth.ts`), or
2. Switch password reset routes to use the Redis-backed `rateLimit()` from `auth.ts` instead

---

### [API-062]: `check-email` endpoint exposes email enumeration
**Severity:** Low
**File(s):** `backend/src/routes/userRoutes.ts:169`

**Description:** The `GET /api/users/check-email?email=...` endpoint is public (no auth) with rate limiting of 30/15min. This allows an attacker to enumerate which email addresses are registered in the system. While rate limited, 30 requests per 15 minutes still allows checking 2,880 emails per day from a single IP. With rotating IPs, this is trivially bypassable.

**Recommended Fix:** Consider one or more mitigations:
1. Require authentication for email availability checks
2. Return the same response regardless of whether the email exists (but this may break registration UX)
3. Reduce rate limit to 5/15min and add CAPTCHA after 3 failed checks

---

### [API-063]: Auth error handler returns HTTP 500 instead of 401 on middleware exceptions
**Severity:** Low
**File(s):** `backend/src/middleware/auth.ts:63-70`

**Description:** If an unexpected exception occurs in the `authenticateToken` middleware (e.g., database connection failure while looking up the user), the middleware returns HTTP 500 with `"Authentication failed"`. This leaks implementation details (the client learns the auth system is broken rather than simply that their token is invalid) and provides a signal to attackers about system health.

**Evidence:**
```typescript
// auth.ts:63-70
} catch (error) {
  logger.error('Authentication middleware error', { ... });
  const response: ApiResponse = {
    success: false,
    error: 'Authentication failed',
  };
  res.status(500).json(response); // Should be 401 or 503
}
```

**Recommended Fix:** Return 401 with a generic message like `"Unable to verify authentication"`, keeping the 500-level error internal. If the intent is to signal a service outage, use 503 instead.

---

### [API-064]: WebSocket subscriber does not handle Redis reconnection
**Severity:** Low
**File(s):** `backend/src/utils/websocket.ts:106-122`

**Description:** The Redis pub/sub subscriber is created once during WebSocket initialization. If the Redis connection drops and reconnects, the subscription to `checkin:new` is not re-established. IORedis handles reconnection automatically, but subscriptions may need to be re-issued depending on the failure mode. There is no `reconnecting` or `ready` handler to re-subscribe.

**Evidence:**
```typescript
// websocket.ts:106-122
this.subscriber = createPubSubConnection();
this.subscriber.subscribe('checkin:new');
// No reconnection handler to re-subscribe
```

**Recommended Fix:** Add a handler for the IORedis `ready` event after reconnection:
```typescript
this.subscriber.on('ready', () => {
  this.subscriber?.subscribe('checkin:new');
  winstonLogger.info('Re-subscribed to checkin:new after reconnection');
});
```

---

## Part 3: Rate Limiting Coverage Summary

| Route File | Has IP Rate Limit | Has Per-User Rate Limit | Status |
|------------|-------------------|------------------------|--------|
| badgeRoutes | Yes | No | OK |
| bandRoutes | Yes | No | OK |
| blockRoutes | Yes | No | OK |
| checkinRoutes | No (daily only) | No | **MISSING** |
| claimRoutes | No | No | **MISSING** |
| consentRoutes | Partial (POST only) | No | OK |
| dataExportRoutes | Yes | No | OK |
| discoveryRoutes | No (except suggestions) | Partial | **MISSING** |
| eventRoutes | No | No | **MISSING** |
| feedRoutes | No | No | **MISSING** |
| followRoutes | Partial | No | OK |
| moderationRoutes | No | No | Low risk (admin) |
| notificationRoutes | No | No | **MISSING** |
| onboardingRoutes | Yes | No | OK |
| passwordResetRoutes | No | Yes | OK |
| reportRoutes | No | No | **MISSING** |
| rsvpRoutes | Yes | No | OK |
| searchRoutes | Yes | No | OK |
| shareRoutes | No | No | **MISSING** |
| socialAuthRoutes | Yes | No | OK |
| subscriptionRoutes | No | No | **MISSING** |
| tokenRoutes | Yes | No | OK |
| trendingRoutes | Yes | No | OK |
| uploadsRoutes | No | No | Low risk |
| userRoutes | Partial | No | **PARTIAL** |
| venueRoutes | Yes | No | OK |
| wishlistRoutes | Partial | No | OK |
| wrappedRoutes | No | No | **MISSING** |

**Missing rate limiting on 10 of 28 route files affecting 45+ endpoints.**

---

## Part 4: Recommended Priority Order for Fixes

### Before Beta Launch (Blockers)
1. **API-050**: Add admin/owner authorization to band/venue/event DELETE endpoints
2. **API-051**: Add WebSocket handshake-level JWT authentication

### Within First Beta Week (High)
3. **API-055**: Add baseline rate limiting to the 10 unprotected route files
4. **API-053**: Add Redis health check to `/health` endpoint
5. **API-054**: Add timeout to health check database query
6. **API-052**: Standardize authorization with reusable middleware

### Before Public Launch (Medium)
7. **API-056**: Add rate limiting to discovery proxy endpoints
8. **API-059**: Add file size enforcement on R2 presigned URLs
9. **API-058**: Add rate limiting to card generation endpoints
10. **API-057**: Add rate limiting to subscription webhook
11. **API-060**: Tighten WebSocket message rate limit
12. **API-061**: Migrate perUserRateLimit to Redis for multi-instance support
