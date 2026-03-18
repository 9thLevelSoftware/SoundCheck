# SoundCheck Beta Readiness -- Fix Plan

**Date:** 2026-03-18
**Source:** docs/reviews/consolidated-findings.md
**Scope:** All Blocker-severity findings (19 findings)

---

## Fix Order Summary

| Order | Fix | Title | Domain | Effort | Dependencies |
|-------|-----|-------|--------|--------|-------------|
| 1 | Fix 1 | Railway health check configuration | Infrastructure | Trivial | None |
| 2 | Fix 2 | Database pool error crashes process | Infrastructure | Trivial | None |
| 3 | Fix 3 | isAdmin/isPremium leaked in auth responses | Security | Small | None |
| 4 | Fix 4 | DELETE endpoints lack authorization | Security | Small | None |
| 5 | Fix 5 | Discovery endpoints unauthenticated and unrate-limited | Security | Trivial | None |
| 6 | Fix 6 | AdminController dead code with destructive operations | Security | Small | None |
| 7 | Fix 7 | WebSocket unauthenticated connections + unscoped rooms | Security | Medium | None |
| 8 | Fix 8 | Check-in creation not wrapped in transaction | Backend | Small | None |
| 9 | Fix 9 | Stats trigger INSERT-only, DELETE never decrements | Backend | Medium | Fix 8 |
| 10 | Fix 10 | cache.delPattern() uses blocking Redis KEYS | Backend | Medium | None |
| 11 | Fix 11 | WebSocket fan-out O(followers * connections) | Backend | Medium | Fix 7 |
| 12 | Fix 12 | Follow action creates no notification | Backend | Small | None |
| 13 | Fix 13 | Push notification pipeline silently disabled | Backend | Small | None |
| 14 | Fix 14 | deleteCheckin errors always surface as 500 | Backend | Trivial | None |
| 15 | Fix 15 | Feed does not refresh after check-in | Mobile | Trivial | None |
| 16 | Fix 16 | Logout does not invalidate session-dependent providers | Mobile | Small | None |
| 17 | Fix 17 | Legacy CreateCheckIn calls non-existent repository method | Mobile | Small | None |
| 18 | Fix 18 | Dio 401 handler wipes credentials without refresh | Mobile | Medium | None |
| 19 | Fix 19 | Password reset deep link uses custom URI scheme | Mobile | Medium | None |
| 20 | Fix 20 | Missing base tables in migration chain | Infrastructure | Large | None |

---

## Fix Dependency Graph

```
Fix 1  (health check)        --> independent (deploy first)
Fix 2  (pool error)          --> independent (deploy with Fix 1)
Fix 3  (isAdmin leak)        --> independent
Fix 4  (DELETE auth)         --> independent
Fix 5  (discovery auth)      --> independent
Fix 6  (AdminController)     --> independent
Fix 7  (WebSocket auth)      --> independent
Fix 8  (checkin transaction) --> independent
Fix 9  (stats DELETE trigger) --depends-on--> Fix 8 (transaction must exist before trigger changes)
Fix 10 (KEYS -> SCAN)        --> independent
Fix 11 (WS fan-out)          --depends-on--> Fix 7 (client index structure changes in Fix 7)
Fix 12 (follow notification) --> independent
Fix 13 (push pipeline)       --> independent
Fix 14 (deleteCheckin 500)   --> independent
Fix 15 (feed refresh)        --> independent
Fix 16 (logout providers)    --> independent
Fix 17 (legacy CreateCheckIn)--> independent
Fix 18 (Dio 401 handler)     --> independent
Fix 19 (password reset URL)  --> independent
Fix 20 (missing migrations)  --> independent (can run in parallel but deploy last)
```

Parallel execution groups:
- **Group A (deploy immediately):** Fix 1, Fix 2
- **Group B (security, parallel):** Fix 3, Fix 4, Fix 5, Fix 6
- **Group C (backend, sequential pair):** Fix 8, then Fix 9
- **Group D (backend, parallel):** Fix 10, Fix 12, Fix 13, Fix 14
- **Group E (security, after Group B):** Fix 7, then Fix 11
- **Group F (mobile, parallel):** Fix 15, Fix 16, Fix 17
- **Group G (mobile, parallel):** Fix 18, Fix 19
- **Group H (infrastructure, last):** Fix 20

---

## Fixes by Domain

### Infrastructure Fixes

### Fix 1: Railway health check configuration
**Finding(s):** CFR-INF-001
**Domain:** Infrastructure
**Root Cause:** `railway.toml` has no `healthcheckPath` or `healthcheckTimeout` in the `[deploy]` section. The `/health` endpoint exists at `backend/src/index.ts:169-197` but Railway does not use it, so traffic is routed to the process immediately after start -- even if the database is not connected or migrations are still running.
**Files to Modify:**
- `railway.toml:5-8` -- add health check configuration to the `[deploy]` section
**Proposed Fix:**
Add the following two lines to the `[deploy]` section of `railway.toml`:
```toml
[deploy]
startCommand = "cd backend && npm run migrate:up && npm start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
healthcheckPath = "/health"
healthcheckTimeout = 120
```
The 120-second timeout is generous enough to cover migration execution on cold start. Railway will only route traffic after `/health` returns a 2xx status.
**Testing:** Deploy to Railway staging and verify that the service shows "healthy" in the Railway dashboard. Confirm that traffic is not routed during the migration phase by checking deploy logs for the health check probe timing.
**Risk of Regression:** None. This is additive configuration. If the health endpoint fails, Railway will not route traffic -- which is the desired behavior.
**Dependencies:** None
**Estimated Effort:** trivial (<5 min)

---

### Fix 2: Database pool error crashes entire process
**Finding(s):** CFR-INF-002
**Domain:** Infrastructure
**Root Cause:** `backend/src/config/database.ts:91-94` calls `process.exit(-1)` on any idle client error from the PostgreSQL connection pool. Combined with `restartPolicyMaxRetries = 10` in `railway.toml`, a flapping database connection can exhaust all retries and leave the service permanently down.
**Files to Modify:**
- `backend/src/config/database.ts:90-94` -- replace `process.exit(-1)` with error logging
**Proposed Fix:**
Replace the pool error handler:
```typescript
// Current (line 91-94):
this.pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
  process.exit(-1);
});

// Fixed:
this.pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
  // Do NOT exit -- pool will reconnect automatically.
  // The /health endpoint will detect persistent DB failures.
});
```
Remove only the `process.exit(-1)` line. Keep the error log.
**Testing:** Write a unit test that mocks a pool error event and verifies the process does not exit. In staging, confirm the health endpoint reports `database: 'disconnected'` during a simulated pool error, then recovers.
**Risk of Regression:** If the pool enters a permanently broken state without recovery, the service will stay up but serve errors. This is better than crashing -- the health check (Fix 1) will detect persistent failures and Railway will stop routing traffic.
**Dependencies:** None (but deploying with Fix 1 gives the best outcome)
**Estimated Effort:** trivial (<5 min)

---

### Fix 20: 10+ tables missing from migration chain (fresh DB is non-functional)
**Finding(s):** CFR-022
**Domain:** Infrastructure
**Root Cause:** The following core tables have no CREATE TABLE statement in any of the 43 migration files: `users`, `venues`, `bands`, `checkins`, `vibe_tags`, `checkin_vibes`, `user_followers`, `user_wishlist`, `user_badges`, `badges`, `refresh_tokens`, `deletion_requests`, `user_consents`, `user_social_accounts`. They exist only in `backend/database-schema.sql`, which is not executed by the migration runner. Any fresh environment (CI, disaster recovery, new developer) bootstrapped from migrations alone gets a broken database with missing tables.
**Files to Modify:**
- `backend/migrations/044_create-base-tables.ts` -- NEW FILE: create all missing base tables
- `backend/database-schema.sql` -- reference only; use as the source of truth for column definitions, constraints, and indexes
**Proposed Fix:**
Create migration `044_create-base-tables.ts` that uses `IF NOT EXISTS` guards on every CREATE TABLE statement so it is safe to run on both fresh and existing databases. The migration must create all 14 missing tables with their columns, constraints, indexes, and foreign keys exactly matching `database-schema.sql`. Tables must be created in FK dependency order:
1. `users` (no FK deps)
2. `venues` (no FK deps)
3. `bands` (no FK deps)
4. `vibe_tags` (no FK deps)
5. `badges` (no FK deps)
6. `refresh_tokens` (FK to users)
7. `user_social_accounts` (FK to users)
8. `user_followers` (FK to users x2)
9. `user_wishlist` (FK to users, bands, venues)
10. `checkins` (FK to users, events, venues, bands)
11. `checkin_vibes` (FK to checkins, vibe_tags)
12. `user_badges` (FK to users, badges)
13. `deletion_requests` (FK to users)
14. `user_consents` (FK to users)

Each CREATE TABLE must include:
- All columns with correct types, defaults, and NOT NULL constraints
- PRIMARY KEY
- UNIQUE constraints
- CHECK constraints
- FOREIGN KEY constraints with ON DELETE behavior
- Indexes for common query patterns

The `down()` function should drop tables in reverse FK order, each with `IF EXISTS`.

Also include the `average_rating` columns on `bands` and `venues` tables (CFR-043) if they are not created by an existing migration. Check the column exists with:
```sql
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bands' AND column_name = 'average_rating') THEN
    ALTER TABLE bands ADD COLUMN average_rating NUMERIC(3,2) DEFAULT NULL;
  END IF;
END $$;
```

**Testing:**
1. Create a fresh database and run all 44 migrations in order. Verify all tables exist with correct schemas using `\d+ <table>` in psql.
2. Run all 44 migrations against the existing dev/staging database. Verify `IF NOT EXISTS` guards prevent errors.
3. Run the backend test suite to confirm all queries succeed.
**Risk of Regression:** `IF NOT EXISTS` guards prevent double-creation. The main risk is column type mismatches between `database-schema.sql` and what the existing database has -- verify column types match before deploying to production.
**Dependencies:** None (but deploy last to avoid conflicts with other migration-touching fixes)
**Estimated Effort:** large (45+ min)

---

### Security Fixes

### Fix 3: isAdmin/isPremium flags leaked in all auth responses
**Finding(s):** CFR-001
**Domain:** Security
**Root Cause:** `mapDbUserToUser()` in `backend/src/utils/dbMappers.ts:23-24` includes `isAdmin` and `isPremium` in every User object. This object is returned directly from `UserController.register()`, `UserController.login()`, `SocialAuthService.generateAuthResult()`, and the `/api/users/me` endpoint. Any client can see which accounts are admin accounts, enabling targeted attacks.
**Files to Modify:**
- `backend/src/utils/dbMappers.ts:6-28` -- add `sanitizeUserForClient()` function
- `backend/src/services/UserService.ts:50-60` -- use sanitized user in `createUser()` return
- `backend/src/controllers/UserController.ts:30-48` -- use sanitized user in `register` and `login` responses
- `backend/src/services/SocialAuthService.ts:421-436` -- sanitize user in `generateAuthResult()`
- `backend/src/routes/socialAuthRoutes.ts:88-94` -- ensure social auth callback uses sanitized user
**Proposed Fix:**
Add a new function to `dbMappers.ts`:
```typescript
/**
 * Strip server-only fields before sending user data to clients.
 * isAdmin and isPremium must NEVER be exposed in API responses.
 */
export function sanitizeUserForClient(user: User): Omit<User, 'isAdmin' | 'isPremium'> {
  const { isAdmin, isPremium, ...clientUser } = user;
  return clientUser;
}
```

Then apply `sanitizeUserForClient()` at every response boundary:

1. In `UserService.createUser()` (line ~56): change `return { user, token }` to `return { user: sanitizeUserForClient(user), token }`.
2. In `UserService.login()` (same pattern): sanitize before returning.
3. In `SocialAuthService.generateAuthResult()` (line 430): change `user` to `sanitizeUserForClient(user)`.
4. In any `/api/users/me` handler: sanitize the user before responding.

Do NOT change `mapDbUserToUser()` itself -- server-side code needs `isAdmin` and `isPremium` for authorization checks (e.g., `requireAdmin()` middleware reads `req.user.isAdmin`).

**Testing:**
1. Run existing auth tests and verify they pass.
2. Write a new test: `POST /api/users/register` response body should NOT contain `isAdmin` or `isPremium` keys.
3. Write a new test: `POST /api/users/login` response body should NOT contain `isAdmin` or `isPremium` keys.
4. Write a new test: social auth callback response should NOT contain `isAdmin` or `isPremium` keys.
5. Verify that `requireAdmin()` middleware still works by testing an admin-only endpoint.
**Risk of Regression:** Mobile app may currently read `isAdmin` or `isPremium` from auth responses. Search the mobile codebase for references to these fields and update any affected UI logic. The mobile `isPremium` state should be sourced from RevenueCat, not from the auth response.
**Dependencies:** None
**Estimated Effort:** small (5-15 min)

---

### Fix 4: DELETE endpoints for bands, venues, and events lack authorization
**Finding(s):** CFR-002
**Domain:** Security
**Root Cause:** The `updateVenue` handler at `VenueController.ts:140-177` correctly checks `isAdmin || isOwner` before allowing updates. The `deleteVenue` handler at `VenueController.ts:183-205` skips this check entirely -- any authenticated user can delete any venue. The same pattern exists in `BandController.deleteBand` (line 182-204) and `EventController.deleteEvent` (line 570-592). This means a single malicious account could wipe the entire catalog.
**Files to Modify:**
- `backend/src/controllers/VenueController.ts:183-205` -- add admin/owner authorization check
- `backend/src/controllers/BandController.ts:182-204` -- add admin/owner authorization check
- `backend/src/controllers/EventController.ts:570-592` -- add admin/owner authorization check (events use `created_by_user_id` for ownership)
**Proposed Fix:**
For each delete handler, add the same authorization pattern used by the corresponding update handler. Example for `VenueController.deleteVenue`:
```typescript
deleteVenue = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
      return;
    }

    const { id } = req.params;

    // Authorization: admin or claimed owner
    const isAdmin = !!req.user.isAdmin;
    const isOwner = await this.venueService.isClaimedOwner(id, req.user.id);

    if (!isAdmin && !isOwner) {
      res.status(403).json({ success: false, error: 'Only admins or claimed owners can delete this venue' } as ApiResponse);
      return;
    }

    await this.venueService.deleteVenue(id);

    const response: ApiResponse = {
      success: true,
      message: 'Venue deleted successfully',
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('Delete venue error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    const response: ApiResponse = {
      success: false,
      error: 'Failed to delete venue',
    };
    res.status(500).json(response);
  }
};
```

Apply the same pattern to `BandController.deleteBand` (using `this.bandService.isClaimedOwner`) and `EventController.deleteEvent` (checking `event.created_by_user_id === req.user.id` for ownership, since events use `created_by_user_id` rather than a claims table).

As defense-in-depth, also consider adding `requireAdmin()` middleware at the route level in `venueRoutes.ts:24`, `bandRoutes.ts:26`, and `eventRoutes.ts:41`. However, this is stricter than needed if claimed owners should be allowed to delete -- so the controller-level check is the primary control.

**Testing:**
1. Write test: non-admin, non-owner user DELETE `/api/venues/:id` returns 403.
2. Write test: admin user DELETE `/api/venues/:id` returns 200.
3. Write test: claimed owner DELETE `/api/venues/:id` returns 200.
4. Repeat for bands and events.
5. Verify existing update authorization tests still pass.
**Risk of Regression:** If `isClaimedOwner()` has a bug or the claims table is empty, legitimate owners could be blocked from deleting. Verify the claims query works correctly in the existing update handlers before deploying.
**Dependencies:** None
**Estimated Effort:** small (5-15 min)

---

### Fix 5: Discovery endpoints unauthenticated and unrate-limited
**Finding(s):** CFR-009
**Domain:** Security
**Root Cause:** Four discovery endpoints in `backend/src/routes/discoveryRoutes.ts:12-20` proxy to external APIs (setlist.fm, MusicBrainz) using the server's API keys, but have no `authenticateToken` middleware and no rate limiting. An attacker can exhaust the server's third-party API quotas, causing API key suspension that breaks discovery for all users.
**Files to Modify:**
- `backend/src/routes/discoveryRoutes.ts:12-21` -- add `authenticateToken` and rate limit middleware to all four discovery routes
**Proposed Fix:**
```typescript
import { Router } from 'express';
import { DiscoveryController } from '../controllers/DiscoveryController';
import { UserDiscoveryController } from '../controllers/UserDiscoveryController';
import { authenticateToken } from '../middleware/auth';
import { createPerUserRateLimit, RateLimitPresets } from '../middleware/perUserRateLimit';

const router = Router();
const discoveryController = new DiscoveryController();
const userDiscoveryController = new UserDiscoveryController();

// All discovery endpoints require authentication and per-user rate limiting
// to protect third-party API keys (setlist.fm, MusicBrainz)
router.get('/venues', authenticateToken, createPerUserRateLimit(RateLimitPresets.read), discoveryController.searchVenues);
router.get('/setlists', authenticateToken, createPerUserRateLimit(RateLimitPresets.read), discoveryController.searchSetlists);
router.get('/bands', authenticateToken, createPerUserRateLimit(RateLimitPresets.read), discoveryController.searchBands);
router.get('/bands/genre', authenticateToken, createPerUserRateLimit(RateLimitPresets.read), discoveryController.searchBandsByGenre);

// User discovery: follow suggestions (Phase 17)
router.get(
  '/users/suggestions',
  authenticateToken,
  createPerUserRateLimit(RateLimitPresets.read),
  userDiscoveryController.getSuggestions
);

export default router;
```

The `RateLimitPresets.read` preset already exists and is used by the `/users/suggestions` endpoint in the same file. This provides consistent per-user rate limiting across all discovery endpoints.

**Testing:**
1. Write test: unauthenticated GET `/api/discover/venues?query=test` returns 401.
2. Write test: authenticated GET `/api/discover/venues?query=test` returns 200.
3. Write test: rapid-fire requests from same user hit 429 rate limit.
4. Verify existing discovery integration tests pass with auth headers added.
**Risk of Regression:** Mobile app discovery screens that currently call these endpoints without auth will break. Search the mobile codebase for discovery API calls and ensure they include the auth token. The Dio client already attaches the JWT to all requests (`dio_client.dart:35-38`), so this should work automatically if the user is logged in. But verify the discovery screens are only accessible when authenticated.
**Dependencies:** None
**Estimated Effort:** trivial (<5 min)

---

### Fix 6: AdminController dead code with destructive operations
**Finding(s):** CFR-008
**Domain:** Security
**Root Cause:** `AdminController.ts` contains a `moderateContent` endpoint that accepts arbitrary `action`, `targetType`, and `targetId` with minimal validation. It can ban users and delete venues. No route file exists (`grep -r "AdminController" backend/src/routes/` returns zero matches), making it dead code -- but the risk is accidental re-connection without proper auth.
**Files to Modify:**
- `backend/src/controllers/AdminController.ts` -- either delete entirely or create proper route file with auth
**Proposed Fix:**
**Option A (recommended for beta):** Delete `AdminController.ts` entirely. It is dead code with no consumers. If admin functionality is needed post-beta, it should be rebuilt with proper Zod validation and test coverage.

**Option B (if admin dashboard is needed for beta):** Create `backend/src/routes/adminRoutes.ts`:
```typescript
import { Router } from 'express';
import { AdminController } from '../controllers/AdminController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();
const adminController = new AdminController();

// ALL admin routes require authentication + admin privileges
router.use(authenticateToken, requireAdmin());

router.get('/stats', adminController.getStats);
// Only add routes that have been validated with Zod schemas
// Do NOT expose moderateContent until input validation is added (CFR-API-002-004)

export default router;
```
Then register in `backend/src/index.ts`: `app.use('/api/admin', adminRoutes);`

Do NOT expose `moderateContent`, `recentActivity`, or `getReports` until Zod validation schemas are added (tracked as CFR-API-002-004 in the High-priority backlog).

**Testing:**
- If Option A: verify `AdminController.ts` is deleted and no import references remain.
- If Option B: write test confirming unauthenticated requests return 401 and non-admin authenticated requests return 403.
**Risk of Regression:** None for Option A (dead code removal). For Option B, ensure `requireAdmin()` middleware is tested.
**Dependencies:** None
**Estimated Effort:** small (5-15 min)

---

### Fix 7: WebSocket accepts unauthenticated connections + unscoped room access
**Finding(s):** CFR-026
**Domain:** Security
**Root Cause:** `backend/src/utils/websocket.ts:59` creates a `WebSocket.Server` with no `verifyClient` callback. Any client can establish a WebSocket connection and consume server resources. The `join_room` handler at line 196-198 accepts any room name without validating that the user has access to that room. An attacker can open thousands of unauthenticated connections for denial-of-service.
**Files to Modify:**
- `backend/src/utils/websocket.ts:59` -- add `verifyClient` callback with JWT verification
- `backend/src/utils/websocket.ts:196-198` -- add room authorization in `joinRoom`
**Proposed Fix:**
1. Add `verifyClient` during WebSocket server creation:
```typescript
this.wss = new WebSocket.Server({
  server,
  verifyClient: (info, callback) => {
    try {
      // Extract token from query string or Authorization header
      const url = new URL(info.req.url || '', `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token')
        || AuthUtils.extractTokenFromHeader(info.req.headers.authorization);

      if (!token) {
        callback(false, 401, 'Authentication required');
        return;
      }

      const payload = AuthUtils.verifyToken(token);
      if (!payload) {
        callback(false, 401, 'Invalid or expired token');
        return;
      }

      // Attach userId to the upgrade request for use in connection handler
      (info.req as any).userId = payload.userId;
      callback(true);
    } catch (error) {
      callback(false, 500, 'Authentication error');
    }
  },
});
```

2. In the `connection` handler, set `client.userId` from the verified request:
```typescript
this.wss.on('connection', (ws: WebSocket, req) => {
  const clientId = this.generateClientId();
  const client: Client = {
    ws,
    userId: (req as any).userId, // Set from verifyClient
    rooms: new Set(),
    isAlive: true,
    messageCount: 0,
    lastMessageReset: Date.now(),
  };
  // ...
});
```

3. Add room authorization in `joinRoom`:
```typescript
private joinRoom(clientId: string, room: string): void {
  const client = this.clients.get(clientId);
  if (!client || !client.userId) return;

  // Validate room name format and authorize access
  const validRoomPrefixes = ['event:', 'venue:', 'user:'];
  const isValidRoom = validRoomPrefixes.some(prefix => room.startsWith(prefix));
  if (!isValidRoom) {
    this.send(clientId, 'error', { message: 'Invalid room name' });
    return;
  }

  // User-specific rooms: only allow joining own room
  if (room.startsWith('user:') && room !== `user:${client.userId}`) {
    this.send(clientId, 'error', { message: 'Cannot join another user\'s room' });
    return;
  }

  client.rooms.add(room);
  this.send(clientId, 'room_joined', { room });
}
```

4. Remove the `auth` message type handler since authentication now happens at connection time. The existing `authenticateClient` method becomes unnecessary.

**Testing:**
1. Write test: WebSocket connection without token is rejected with 401.
2. Write test: WebSocket connection with valid JWT is accepted and `client.userId` is set.
3. Write test: `join_room` with `user:other-id` is rejected.
4. Write test: `join_room` with `event:uuid` is accepted.
5. Load test: verify connection throughput is not degraded by `verifyClient`.
**Risk of Regression:** Mobile WebSocket client currently authenticates via a post-connection `auth` message (`mobile/lib/src/core/services/websocket_service.dart:67-68`). The mobile client must be updated to pass the JWT as a query parameter during the WebSocket upgrade handshake instead. Update the mobile `connect()` method to append `?token=$_authToken` to the WebSocket URL.
**Dependencies:** None (but coordinate with mobile team for client-side update)
**Estimated Effort:** medium (15-45 min)

---

### Backend Fixes

### Fix 8: Check-in creation not wrapped in a database transaction
**Finding(s):** CFR-003
**Domain:** Backend
**Root Cause:** `CheckinCreatorService.createEventCheckIn()` at `backend/src/services/checkin/CheckinCreatorService.ts:110-149` performs the checkin INSERT at line 122 (which auto-commits and fires the stats trigger), then inserts vibe tags at line 148-149 in a separate query. If the vibe tag insertion fails, the check-in exists in a partially-created state with stats already incremented. The user cannot retry because the unique constraint returns 409.
**Files to Modify:**
- `backend/src/services/checkin/CheckinCreatorService.ts:100-160` -- wrap INSERT + vibe tags in a transaction
**Proposed Fix:**
Use the `this.db.getClient()` pattern that already exists in `EventService.createEvent()`:
```typescript
const client = await this.db.getClient();
try {
  await client.query('BEGIN');

  // INSERT the check-in (line 122 logic)
  const result = await client.query(insertQuery, [
    userId, eventId, event.venue_id, headlinerBandId,
    isVerified, comment || null, locationLat || null, locationLon || null,
    event.event_date, 0, comment || null,
  ]);

  const checkinId = result.rows[0].id;

  // Add vibe tags if provided (line 148 logic)
  if (vibeTagIds && vibeTagIds.length > 0) {
    await this.addVibeTagsToCheckin(checkinId, vibeTagIds, client);
  }

  await client.query('COMMIT');
} catch (error: any) {
  await client.query('ROLLBACK');

  // Re-throw unique constraint violation as 409
  if (error.code === '23505' && error.constraint && error.constraint.includes('user_event')) {
    const dupErr = new Error('You have already checked in to this event');
    (dupErr as any).statusCode = 409;
    throw dupErr;
  }
  throw error;
} finally {
  client.release();
}
```

The `addVibeTagsToCheckin` method must accept an optional `client` parameter to execute within the same transaction. Update its signature to:
```typescript
private async addVibeTagsToCheckin(checkinId: string, vibeTagIds: string[], client?: PoolClient): Promise<void>
```
Use `client || this.db` for query execution.

**Testing:**
1. Write test: create checkin with invalid vibe tag IDs -- verify no checkin row is created (ROLLBACK).
2. Write test: create checkin with valid vibe tags -- verify both checkin and vibe tags exist (COMMIT).
3. Write test: duplicate checkin attempt still returns 409.
4. Run existing checkin creation tests.
**Risk of Regression:** The stats trigger fires on INSERT. With a transaction, the trigger fires inside the transaction and is rolled back if the transaction fails. This is the correct behavior. Verify that the trigger does not have any side effects outside the transaction (e.g., cache invalidation via Redis -- those calls happen after the INSERT in the service code, not in the trigger).
**Dependencies:** None
**Estimated Effort:** small (5-15 min)

---

### Fix 9: Stats trigger INSERT-only -- DELETE never decrements counters
**Finding(s):** CFR-004
**Domain:** Backend
**Root Cause:** The stats trigger function `update_user_stats_on_checkin()` defined in migration `009_expand-update-triggers.ts:143-147` only fires on `AFTER INSERT ON checkins`. When a checkin is deleted via `deleteCheckin()` at `CheckinCreatorService.ts:245`, the `DELETE FROM checkins` runs with no trigger handler and no manual stat recalculation. As a result, `users.total_checkins`, `bands.total_checkins`, `venues.total_checkins`, `unique_bands`, `unique_venues`, `unique_fans`, `unique_visitors`, and `events.total_checkins` monotonically increase and never self-correct.
**Files to Modify:**
- `backend/migrations/044_create-base-tables.ts` or a separate `045_add-delete-stats-trigger.ts` -- add AFTER DELETE trigger
**Proposed Fix:**
Create a new migration that adds a DELETE handler to the trigger function:
```sql
CREATE OR REPLACE FUNCTION update_user_stats_on_checkin_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Decrement user stats
  UPDATE users SET
    total_checkins = GREATEST(total_checkins - 1, 0),
    unique_venues = (SELECT COUNT(DISTINCT venue_id) FROM checkins WHERE user_id = OLD.user_id),
    unique_bands = (SELECT COUNT(DISTINCT band_id) FROM checkins WHERE user_id = OLD.user_id AND band_id IS NOT NULL)
  WHERE id = OLD.user_id;

  -- Decrement venue stats
  IF OLD.venue_id IS NOT NULL THEN
    UPDATE venues SET
      total_checkins = GREATEST(total_checkins - 1, 0),
      unique_visitors = (SELECT COUNT(DISTINCT user_id) FROM checkins WHERE venue_id = OLD.venue_id)
    WHERE id = OLD.venue_id;
  END IF;

  -- Decrement band stats
  IF OLD.band_id IS NOT NULL THEN
    UPDATE bands SET
      total_checkins = GREATEST(total_checkins - 1, 0),
      unique_fans = (SELECT COUNT(DISTINCT user_id) FROM checkins WHERE band_id = OLD.band_id)
    WHERE id = OLD.band_id;
  END IF;

  -- Decrement event stats
  IF OLD.event_id IS NOT NULL THEN
    UPDATE events SET
      total_checkins = GREATEST(total_checkins - 1, 0)
    WHERE id = OLD.event_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_stats_on_checkin_delete ON checkins;
CREATE TRIGGER trigger_update_stats_on_checkin_delete
  AFTER DELETE ON checkins
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stats_on_checkin_delete();
```

Note: `unique_bands` and `unique_venues` are recomputed via subquery (not just decremented) because a simple decrement would be wrong when the user has multiple checkins for the same band/venue. The `GREATEST(x - 1, 0)` pattern prevents negative counts for `total_checkins`.

**Testing:**
1. Write test: create checkin, verify stats increment. Delete checkin, verify stats decrement to original values.
2. Write test: create two checkins for the same venue, delete one -- `unique_venues` should still be 1.
3. Write test: delete checkin for the last venue visit -- `unique_venues` should decrement by 1.
4. Run existing delete checkin tests.
**Risk of Regression:** The subquery recomputation of `unique_*` columns is slower than a simple decrement but necessary for correctness. For users with thousands of checkins, this could be slow. Consider adding an index `idx_checkins_user_venue ON checkins(user_id, venue_id)` if performance is a concern.
**Dependencies:** Fix 8 (transaction) should land first so that rollback behavior is well-defined when triggers fire inside transactions.
**Estimated Effort:** medium (15-45 min)

---

### Fix 10: cache.delPattern() uses blocking Redis KEYS command
**Finding(s):** CFR-PERF-001
**Domain:** Backend
**Root Cause:** `backend/src/utils/cache.ts:217` uses `await redis.keys(pattern)` which is O(N) on the total keyspace and blocks the single-threaded Redis event loop. Each checkin triggers KEYS scans for cache invalidation (once per follower), so a user with 100 followers triggers 102 blocking KEYS calls. This stalls all Redis operations including rate limiting and BullMQ dispatch.
**Files to Modify:**
- `backend/src/utils/cache.ts:210-225` -- replace KEYS with SCAN-based iteration
**Proposed Fix:**
Replace the `delPattern` method:
```typescript
/**
 * Delete keys by pattern using non-blocking SCAN
 */
async delPattern(pattern: string): Promise<void> {
  const redis = getRedis();

  if (redis) {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.unlink(...keys); // UNLINK is non-blocking DEL
        }
      } while (cursor !== '0');
      return;
    } catch (error) {
      logger.error('Redis del pattern error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    }
  }

  // Memory fallback (unchanged)
  const regex = new RegExp(pattern.replace(/\*/g, '.*'));
  const keysToDelete: string[] = [];
  // ... existing memory fallback code ...
}
```

Key changes:
- `SCAN` with `COUNT 100` iterates in non-blocking batches instead of blocking the entire keyspace.
- `UNLINK` (instead of `DEL`) frees memory in a background thread, not on the main Redis thread.

**Testing:**
1. Write test: populate 1000 keys matching a pattern, call `delPattern`, verify all keys are deleted.
2. Write test: verify `delPattern` does not block other Redis operations (concurrent PING returns immediately).
3. Run existing cache invalidation tests.
**Risk of Regression:** SCAN may return duplicate keys across iterations. UNLINK handles this gracefully (no error on missing keys). The iteration is slightly slower than KEYS for small keyspaces but dramatically better for large ones.
**Dependencies:** None
**Estimated Effort:** medium (15-45 min)

---

### Fix 11: WebSocket fan-out O(followers * connections) with no back-pressure
**Finding(s):** CFR-PERF-002
**Domain:** Backend
**Root Cause:** `sendToUser()` at `websocket.ts:302-308` iterates the entire `clients` Map for every follower to find connections belonging to that user. With 500 connections and 200 followers, a single check-in triggers 100,000 Map iterations. Additionally, `CheckinCreatorService.ts:564-581` does sequential Redis RPUSH calls per follower with no pipelining.
**Files to Modify:**
- `backend/src/utils/websocket.ts:302-308` -- index clients by userId with a secondary map
- `backend/src/utils/websocket.ts` -- add `userClients: Map<string, Set<string>>` index
- `backend/src/services/checkin/CheckinCreatorService.ts:564-581` -- use Redis pipeline for batch RPUSH
**Proposed Fix:**
1. Add a userId-to-clientId index in the WebSocket manager:
```typescript
private userClients: Map<string, Set<string>> = new Map();
```

2. Maintain the index when clients authenticate and disconnect:
```typescript
// In authenticateClient():
if (!this.userClients.has(userId)) {
  this.userClients.set(userId, new Set());
}
this.userClients.get(userId)!.add(clientId);

// In handleDisconnect():
const client = this.clients.get(clientId);
if (client?.userId) {
  const userSet = this.userClients.get(client.userId);
  if (userSet) {
    userSet.delete(clientId);
    if (userSet.size === 0) {
      this.userClients.delete(client.userId);
    }
  }
}
```

3. Replace the O(N) sendToUser:
```typescript
sendToUser(userId: string, type: string, payload: any): void {
  const clientIds = this.userClients.get(userId);
  if (!clientIds) return;
  for (const clientId of clientIds) {
    this.send(clientId, type, payload);
  }
}
```

4. In CheckinCreatorService, use Redis pipeline for batch RPUSH:
```typescript
const pipeline = redis.pipeline();
for (const followerId of followerIds) {
  const listKey = `notif:batch:${followerId}`;
  pipeline.rpush(listKey, notifData);
  pipeline.expire(listKey, 300);
}
await pipeline.exec();

// Then enqueue BullMQ jobs (these are already deduped by jobId)
for (const followerId of followerIds) {
  if (notificationQueue) {
    await notificationQueue.add('send-batch', { userId: followerId }, {
      delay: 120_000,
      jobId: `notif-batch:${followerId}`,
    });
  }
}
```

5. For very large follower sets (>100), add chunked fan-out:
```typescript
const CHUNK_SIZE = 50;
for (let i = 0; i < followerIds.length; i += CHUNK_SIZE) {
  const chunk = followerIds.slice(i, i + CHUNK_SIZE);
  // Process chunk...
  if (i + CHUNK_SIZE < followerIds.length) {
    await new Promise(resolve => setImmediate(resolve)); // yield to event loop
  }
}
```

**Testing:**
1. Write test: sendToUser with userId index returns O(1) lookup.
2. Write test: disconnecting last client for a userId removes the index entry.
3. Load test: 500 concurrent connections, 200-follower checkin fan-out completes in <500ms.
4. Run existing WebSocket and notification tests.
**Risk of Regression:** The `userClients` index must be kept in sync with the `clients` map. Any code path that removes a client from `clients` without updating `userClients` will cause a memory leak or stale reference. Audit all disconnect/cleanup paths.
**Dependencies:** Fix 7 (WebSocket auth) changes the authentication flow. Coordinate the `userClients` index updates with the new `verifyClient` approach.
**Estimated Effort:** medium (15-45 min)

---

### Fix 12: Following a user creates NO notification
**Finding(s):** CFR-E2E-054
**Domain:** Backend
**Root Cause:** `FollowService.followUser()` at `backend/src/services/FollowService.ts:47` inserts the follow row and returns, but never calls `notificationService.createNotification()`. The mobile app has a `case 'new_follower':` handler and WebSocket constants define `NEW_FOLLOWER`, but the backend never emits the notification. Users have no way to discover new followers.
**Files to Modify:**
- `backend/src/services/FollowService.ts:39-49` -- add notification creation after successful follow INSERT
- `backend/src/controllers/FollowController.ts:55` -- pass notification service dependency
**Proposed Fix:**
In `FollowService.followUser()`, after the successful INSERT:
```typescript
async followUser(followerId: string, followingId: string): Promise<FollowResult> {
  // ... existing target user check ...

  const query = `
    INSERT INTO user_followers (follower_id, following_id)
    VALUES ($1, $2)
    ON CONFLICT (follower_id, following_id) DO NOTHING
    RETURNING id
  `;

  const result = await this.db.query(query, [followerId, followingId]);

  // Only send notification if this is a new follow (not a duplicate)
  if (result.rows.length > 0) {
    // Fire-and-forget: create notification for the followed user
    try {
      await this.notificationService.createNotification({
        userId: followingId,        // recipient
        type: 'new_follower',
        actorId: followerId,        // who followed
        message: 'started following you',
      });
    } catch (err) {
      logger.debug('Warning: follow notification failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { success: true, isFollowing: true };
}
```

Inject `NotificationService` into `FollowService` constructor. The pattern is already used by `CheckinCreatorService`.

**Testing:**
1. Write test: follow a user, verify notification row is created with type `new_follower`.
2. Write test: follow same user again (duplicate), verify no second notification is created.
3. Write test: notification creation failure does not block the follow operation.
4. E2E: follow a user, verify mobile notification appears.
**Risk of Regression:** None. This is additive behavior. The `ON CONFLICT DO NOTHING` means the notification is only sent for new follows, not re-follows.
**Dependencies:** None
**Estimated Effort:** small (5-15 min)

---

### Fix 13: Push notification pipeline silently disabled when Firebase unconfigured
**Finding(s):** CFR-E2E-057
**Domain:** Backend
**Root Cause:** `PushNotificationService.ts:20-42` logs a single warning at startup if `FIREBASE_SERVICE_ACCOUNT_JSON` is not set, then `sendToUser()` silently returns at line 64 for every notification. The entire push pipeline (Redis batching, BullMQ job scheduling) executes wastefully but delivery silently does nothing. No health check indicator, no admin visibility.
**Files to Modify:**
- `backend/src/index.ts:169-197` -- add push notification status to health check response
- `backend/src/services/PushNotificationService.ts:50-52` -- expose `isAvailable` for health check
- `backend/src/jobs/notificationWorker.ts` -- short-circuit worker when FCM is disabled
**Proposed Fix:**
1. Add push notification status to the health check response in `backend/src/index.ts`:
```typescript
app.get('/health', async (req, res) => {
  try {
    const db = Database.getInstance();
    const isDbHealthy = await db.healthCheck();
    const wsStats = getWebSocketStats();
    const pushService = new PushNotificationService();

    const response: ApiResponse = {
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
        database: isDbHealthy ? 'connected' : 'disconnected',
        websocket: {
          enabled: process.env.ENABLE_WEBSOCKET === 'true',
          ...wsStats,
        },
        pushNotifications: pushService.isAvailable ? 'enabled' : 'disabled',
      },
    };

    res.status(200).json(response);
  } catch (error) {
    // ... existing error handling ...
  }
});
```

2. In `notificationWorker.ts`, check at the start of the worker handler:
```typescript
const pushService = new PushNotificationService();
if (!pushService.isAvailable) {
  logger.debug('Push notifications disabled (Firebase not configured). Skipping batch.');
  return; // Skip processing, do not waste Redis reads
}
```

**Testing:**
1. Write test: `/health` response includes `pushNotifications: 'disabled'` when FIREBASE_SERVICE_ACCOUNT_JSON is not set.
2. Write test: `/health` response includes `pushNotifications: 'enabled'` when FIREBASE_SERVICE_ACCOUNT_JSON is set.
3. Write test: notification worker short-circuits when FCM is disabled.
**Risk of Regression:** None. This is additive observability.
**Dependencies:** None
**Estimated Effort:** small (5-15 min)

---

### Fix 14: deleteCheckin errors always surface as 500
**Finding(s):** CFR-011
**Domain:** Backend
**Root Cause:** The `deleteCheckin` endpoint catches all errors and returns 500 regardless of the actual error type. A "not found" error and a "not authorized" error both return the same 500 status.
**Files to Modify:**
- `backend/src/controllers/CheckinController.ts` (or wherever deleteCheckin is handled) -- add proper error status code mapping
- `backend/src/services/checkin/CheckinCreatorService.ts` -- throw typed errors (NotFoundError, ForbiddenError)
**Proposed Fix:**
In the deleteCheckin controller handler, add error type discrimination:
```typescript
} catch (error) {
  if (error instanceof Error) {
    if ((error as any).statusCode === 404) {
      res.status(404).json({ success: false, error: 'Check-in not found' });
      return;
    }
    if ((error as any).statusCode === 403) {
      res.status(403).json({ success: false, error: error.message });
      return;
    }
  }
  logger.error('Delete checkin error', { error: error instanceof Error ? error.message : String(error) });
  res.status(500).json({ success: false, error: 'Failed to delete check-in' });
}
```

In the service layer, throw errors with explicit status codes:
```typescript
// If checkin not found:
const err = new Error('Check-in not found');
(err as any).statusCode = 404;
throw err;

// If user is not the checkin owner:
const err = new Error('You can only delete your own check-ins');
(err as any).statusCode = 403;
throw err;
```

**Testing:**
1. Write test: delete non-existent checkin returns 404.
2. Write test: delete another user's checkin returns 403.
3. Write test: delete own checkin returns 200.
**Risk of Regression:** None. This improves error handling specificity.
**Dependencies:** None
**Estimated Effort:** trivial (<5 min)

---

### Mobile Fixes

### Fix 15: Feed does not refresh after check-in (dead socialFeedProvider)
**Finding(s):** CFR-006
**Domain:** Mobile
**Root Cause:** `checkin_providers.dart` at lines 147, 179, 207, and 311 calls `ref.invalidate(socialFeedProvider)` which targets a provider with zero consumers. The feed screen actually watches `globalFeedNotifierProvider` and `friendsFeedNotifierProvider`. After a checkin, toast, or comment, the feed never refreshes because the wrong provider is invalidated.
**Files to Modify:**
- `mobile/lib/src/features/checkins/presentation/providers/checkin_providers.dart:147,179,207,311` -- replace all `socialFeedProvider` references with the correct feed providers
**Proposed Fix:**
Replace every occurrence of `ref.invalidate(socialFeedProvider)` with:
```dart
ref.invalidate(globalFeedNotifierProvider);
ref.invalidate(friendsFeedNotifierProvider);
```

Affected locations:
1. Line 147 (CreateCheckIn.submit): `ref.invalidate(socialFeedProvider)` -> invalidate both feed providers
2. Line 179 (ToastCheckIn.toggle): same replacement
3. Line 207 (AddComment.submit): same replacement
4. Line 311 (DeleteCheckIn or similar): same replacement

After replacing all references, search for `socialFeedProvider` definition and delete it if it has zero remaining consumers. Run `dart analyze` to confirm no remaining references.

**Testing:**
1. Manual test: create a checkin, verify the feed screen shows the new checkin immediately without manual refresh.
2. Manual test: toast a checkin, verify the toast count updates in the feed.
3. Manual test: add a comment, verify the comment count updates in the feed.
4. Run `dart analyze` to verify no dead provider references remain.
**Risk of Regression:** If any other screen watches `socialFeedProvider`, removing it will cause a compile error (which is good -- it surfaces hidden consumers). Search the entire mobile codebase for `socialFeedProvider` before deleting.
**Dependencies:** None
**Estimated Effort:** trivial (<5 min)

---

### Fix 16: Logout does not invalidate session-dependent providers
**Finding(s):** CFR-007
**Domain:** Mobile
**Root Cause:** `providers.dart:171-186` defines the `logout()` method which disconnects WebSocket, clears RevenueCat, and calls `authRepository.logout()`, but never calls `ref.invalidate()` on any data provider. Over 10 `keepAlive` providers retain stale data from User A when User B logs in. This causes data leakage between accounts on shared devices.
**Files to Modify:**
- `mobile/lib/src/core/providers/providers.dart:171-186` -- add `_clearUserData()` that invalidates all user-scoped providers
**Proposed Fix:**
Add a `_clearUserData()` method and call it during logout:
```dart
Future<void> logout() async {
  final authRepository = ref.read(authRepositoryProvider);

  // Disconnect WebSocket before logout
  final wsService = ref.read(webSocketServiceProvider);
  wsService.disconnect();

  // Clear RevenueCat identity and premium state
  try {
    await SubscriptionService.logout();
    ref.read(isPremiumProvider.notifier).set(false);
  } catch (_) {}

  // Clear all user-scoped data providers
  _clearUserData();

  await authRepository.logout();
  state = const AsyncValue.data(null);
}

void _clearUserData() {
  // Feed providers
  ref.invalidate(globalFeedNotifierProvider);
  ref.invalidate(friendsFeedNotifierProvider);

  // User profile and stats
  ref.invalidate(userProfileProvider);
  ref.invalidate(userStatsProvider);
  ref.invalidate(concertCredProvider);

  // Notifications
  ref.invalidate(notificationsProvider);
  ref.invalidate(unreadNotificationCountProvider);

  // Badges
  ref.invalidate(userBadgesProvider);

  // Check-in history
  ref.invalidate(userCheckInsProvider);

  // Wishlist
  ref.invalidate(userWishlistProvider);

  // Followers/following
  ref.invalidate(userFollowersProvider);
  ref.invalidate(userFollowingProvider);

  // Discovery / suggestions
  ref.invalidate(followSuggestionsProvider);

  // Subscription state
  ref.invalidate(subscriptionStatusProvider);
}
```

The exact provider names need to be verified against the codebase. Search for all `@Riverpod` and `keepAlive: true` providers to build the complete list.

**Testing:**
1. Manual test: log in as User A, view feed. Log out. Log in as User B. Verify feed shows User B's data, not User A's.
2. Manual test: verify notifications, badges, profile, and stats all reflect the new user after account switch.
3. Run existing auth/logout tests.
**Risk of Regression:** Invalidating too many providers at once may cause a brief flash of loading states when the new user logs in. This is acceptable UX -- better than showing stale data.
**Dependencies:** None
**Estimated Effort:** small (5-15 min)

---

### Fix 17: Legacy CreateCheckIn calls non-existent repository method
**Finding(s):** CFR-E2E-005
**Domain:** Mobile
**Root Cause:** `CreateCheckIn.submit()` at `checkin_providers.dart:133` calls `repository.createCheckIn()` which does not exist on `CheckInRepository` -- only `createEventCheckIn()` exists. This causes a `NoSuchMethodError` at runtime. The legacy `_submitCheckIn()` method in `checkin_screen.dart:971-1012` invokes it with parameters (`bandId`, `venueId`) the backend no longer accepts (the backend was refactored to only accept event-based checkins).
**Files to Modify:**
- `mobile/lib/src/features/checkins/presentation/providers/checkin_providers.dart:112-155` -- delete the `CreateCheckIn` notifier and `CreateCheckInRequest` class
- `mobile/lib/src/features/checkins/presentation/checkin_screen.dart:971-1012` -- delete the legacy `_submitCheckIn()` method
**Proposed Fix:**
1. Delete the entire `CreateCheckIn` class (lines ~112-155) from `checkin_providers.dart`.
2. Delete the `CreateCheckInRequest` class if it exists in the same file or a separate types file.
3. Delete the `_submitCheckIn()` method from `checkin_screen.dart` (lines 971-1012).
4. Search for `createCheckInProvider` references throughout the mobile codebase and remove them.
5. Run `dart analyze` to verify no compile errors.

The active checkin flow uses `CreateEventCheckIn` (which calls `repository.createEventCheckIn()`), not the legacy `CreateCheckIn`.

**Testing:**
1. `dart analyze` passes with no errors.
2. Manual test: the event-based checkin flow (which uses `CreateEventCheckIn`) still works end-to-end.
3. Verify no UI element references `_submitCheckIn` or `createCheckInProvider`.
**Risk of Regression:** If any code path still references `CreateCheckIn` or `createCheckInProvider`, it will cause a compile error -- which is the desired outcome (surfaces hidden callers).
**Dependencies:** None
**Estimated Effort:** small (5-15 min)

---

### Fix 18: Dio 401 handler wipes credentials without token refresh or auth state update
**Finding(s):** CFR-005
**Domain:** Mobile
**Root Cause:** `dio_client.dart:41-48` handles 401 responses by silently deleting `auth_token` and `user_data` from secure storage, then passing the error through. There is no attempt to refresh the token, no user notification, no router redirect to the login screen, and no update to `authStateProvider`. Multiple concurrent 401s race against each other. The user gets stuck in a broken authenticated state where the UI thinks they are logged in but all API calls fail.
**Files to Modify:**
- `mobile/lib/src/core/api/dio_client.dart:30-51` -- replace `InterceptorsWrapper` with `QueuedInterceptorsWrapper` that implements token refresh
**Proposed Fix:**
Replace the current interceptor with a `QueuedInterceptorsWrapper` that serializes 401 handling:
```dart
void _initializeInterceptors() {
  _dio.interceptors.add(
    QueuedInterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _secureStorage.read(key: ApiConfig.tokenKey);
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          // Attempt token refresh
          try {
            final refreshToken = await _secureStorage.read(key: 'refresh_token');
            if (refreshToken != null) {
              // Call refresh endpoint with a fresh Dio instance (avoid interceptor recursion)
              final refreshDio = Dio(BaseOptions(baseUrl: ApiConfig.baseUrl));
              final response = await refreshDio.post('/api/users/refresh-token', data: {
                'refreshToken': refreshToken,
              });

              if (response.statusCode == 200) {
                final newToken = response.data['data']['token'];
                final newRefreshToken = response.data['data']['refreshToken'];

                // Save new tokens
                await _secureStorage.write(key: ApiConfig.tokenKey, value: newToken);
                await _secureStorage.write(key: 'refresh_token', value: newRefreshToken);

                // Retry the original request with the new token
                error.requestOptions.headers['Authorization'] = 'Bearer $newToken';
                final retryResponse = await _dio.fetch(error.requestOptions);
                return handler.resolve(retryResponse);
              }
            }
          } catch (_) {
            // Refresh failed -- fall through to credential wipe
          }

          // Refresh failed or no refresh token: clear credentials and update auth state
          await _secureStorage.delete(key: ApiConfig.tokenKey);
          await _secureStorage.delete(key: ApiConfig.userKey);
          await _secureStorage.delete(key: 'refresh_token');

          // Notify auth state provider (requires access to ProviderContainer)
          // Use a global callback or event bus to trigger logout
          _onAuthFailure?.call();
        }
        return handler.next(error);
      },
    ),
  );
  // ... existing log interceptor ...
}
```

`QueuedInterceptorsWrapper` serializes interceptor execution, preventing multiple concurrent 401s from racing. The first 401 triggers a refresh attempt; subsequent 401s queue behind it and will either succeed (with the new token) or fail (after credentials are wiped).

Add a callback parameter to `DioClient` for auth failure notification:
```dart
final VoidCallback? _onAuthFailure;
DioClient({VoidCallback? onAuthFailure}) : _onAuthFailure = onAuthFailure;
```

Wire the callback to trigger logout in the auth notifier when the DioClient is created.

**Testing:**
1. Write test: 401 response triggers token refresh attempt.
2. Write test: successful refresh retries original request with new token.
3. Write test: failed refresh clears all credentials and calls `_onAuthFailure`.
4. Write test: two concurrent 401s only trigger one refresh attempt (QueuedInterceptorsWrapper).
5. Manual test: let the token expire, verify the app refreshes silently and the user is not interrupted.
**Risk of Regression:** The refresh endpoint path and response format must match the backend exactly. Verify `POST /api/users/refresh-token` exists and returns `{ data: { token, refreshToken } }`. If the response format differs, adjust the parsing accordingly.
**Dependencies:** None
**Estimated Effort:** medium (15-45 min)

---

### Fix 19: Password reset deep link uses soundcheck:// scheme -- may not work
**Finding(s):** CFR-E2E-071
**Domain:** Mobile
**Root Cause:** `EmailService.ts:48` constructs the reset URL as `soundcheck://reset-password?token=...`. Custom URI schemes have no OS-level verification -- any app can register the same scheme and intercept the link. If the scheme is not registered in the app's manifest/Info.plist or GoRouter deep link handling is not configured, tapping the reset link opens a browser error page. There is no fallback web URL.
**Files to Modify:**
- `backend/src/services/EmailService.ts:48` -- change reset URL to use HTTPS with web fallback
- `mobile/android/app/src/main/AndroidManifest.xml` -- add app link intent filter for the reset path
- `mobile/ios/Runner/Info.plist` or associated entitlements -- add universal link association
- Hosting: deploy an `/.well-known/assetlinks.json` (Android) and `apple-app-site-association` (iOS) file
**Proposed Fix:**
This is a multi-step fix:

1. **Backend:** Change the reset URL in `EmailService.ts`:
```typescript
// Replace:
const resetUrl = `soundcheck://reset-password?token=${resetToken}`;

// With:
const webFallbackBase = process.env.APP_WEB_URL || 'https://app.soundcheck.live';
const resetUrl = `${webFallbackBase}/reset-password?token=${resetToken}`;
```

2. **Web fallback page:** Create a simple HTML page at the `APP_WEB_URL` path that:
   - On mobile browsers: attempts to open the app via universal link
   - On desktop browsers: shows a "Please open this link on your phone" message
   - If the app is not installed: shows a link to the app store

3. **Android:** Add an intent filter in `AndroidManifest.xml` for the reset path:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="app.soundcheck.live" android:pathPrefix="/reset-password" />
</intent-filter>
```

4. **iOS:** Add the associated domain entitlement and configure `apple-app-site-association`.

5. **GoRouter:** The existing route at `app_router.dart:177-180` already handles `/reset-password` with a `token` query parameter, so no router changes are needed as long as deep link handling is configured.

**Interim fix for beta (if universal links infrastructure is not ready):** Keep the `soundcheck://` scheme but add proper scheme registration in both Android (`AndroidManifest.xml` with intent filter for `soundcheck://`) and iOS (`Info.plist` with URL scheme), and verify GoRouter deep link handling works. Add a web fallback URL in the email that says "If the link doesn't open the app, copy this token and enter it manually: [token]".

**Testing:**
1. Send a password reset email. Tap the link on Android -- verify the app opens to the reset screen.
2. Send a password reset email. Tap the link on iOS -- verify the app opens to the reset screen.
3. Tap the link on a desktop browser -- verify the web fallback page shows.
4. Tap the link on a phone without the app installed -- verify the app store link shows.
**Risk of Regression:** Changing from `soundcheck://` to `https://` requires infrastructure (DNS, hosting, verification files). If the verification files are not deployed, the links will open in the browser instead of the app. The interim fix (keeping `soundcheck://` but registering it properly) is lower risk for beta.
**Dependencies:** None (but requires infra coordination for universal links)
**Estimated Effort:** medium (15-45 min)

---

## Implementation Notes

### Cross-Cutting Concerns

1. **Transaction pattern adoption:** Fixes 8 and 9 establish the transaction pattern for checkin operations. The same `getClient()` + `BEGIN/COMMIT/ROLLBACK` pattern should be applied to other multi-step writes identified in the High-priority backlog (rating updates BE-002, onboarding genre save E2E-002).

2. **Error handling consistency:** Fix 14 establishes the error status code discrimination pattern. Apply the same pattern to all controllers as part of CFR-011/CFR-012 (High-priority). Longer term, adopt a typed error hierarchy (NotFoundError, ForbiddenError, ConflictError) as a systemic fix.

3. **Auth response sanitization:** Fix 3 introduces `sanitizeUserForClient()`. Every new endpoint that returns user data must call this function. Add a linting rule or code review checklist item.

4. **Mobile provider cleanup on logout:** Fix 16 establishes the `_clearUserData()` pattern. As new providers are added, they must be added to this cleanup list. Consider a registry pattern where providers self-register for logout cleanup.

5. **WebSocket auth migration:** Fix 7 changes WebSocket auth from post-connection message to pre-connection `verifyClient`. The mobile WebSocket client must be updated simultaneously. This is a coordinated backend + mobile deploy.

### Testing Strategy

- **Unit tests:** Each fix should include at least one targeted test that verifies the fix and would have caught the original bug.
- **Integration tests:** Fixes touching database (8, 9, 20) need integration tests with a real PostgreSQL instance.
- **E2E smoke test:** After all fixes are deployed, run the core flow: register -> checkin -> feed refresh -> logout -> login as different user -> verify clean state.
- **Security verification:** After Fixes 3, 4, 5, 6, 7: run a targeted security scan of auth endpoints, delete endpoints, discovery endpoints, and WebSocket connections.

### Deploy Order

1. **Phase 1 (infra, zero-risk):** Fix 1 + Fix 2 (railway.toml + database.ts) -- deploy immediately.
2. **Phase 2 (security, backend):** Fixes 3-6, 8, 10, 12-14 -- deploy together after testing.
3. **Phase 3 (WebSocket):** Fix 7 + Fix 11 -- coordinated deploy with mobile client update.
4. **Phase 4 (triggers):** Fix 9 -- deploy after Fix 8 is verified in production.
5. **Phase 5 (mobile):** Fixes 15-18 -- release new mobile build.
6. **Phase 6 (mobile infra):** Fix 19 -- requires infrastructure setup, can be last.
7. **Phase 7 (migrations):** Fix 20 -- deploy last, verify on staging first.

### Pre-Existing Issues Discovered During Source Review

While reading source files for fix specification, the following issues were observed that are NOT in the blocker list but warrant attention:

1. **`auth.ts:60` sends `email` to Sentry** (`sentrySetUser({ id: user.id, email: user.email, username: user.username })`). This is tracked as CFR-013 (High priority) and should be fixed alongside the blocker work -- it is a one-line change (remove `email` from the object).

2. **`auth.ts:69` returns 500 for auth middleware errors** instead of 401. This is tracked as API-063 (Low priority). Not blocking but worth fixing when touching the auth middleware for other fixes.

3. **Missing `requireAdmin()` middleware on delete routes** -- the route files (`venueRoutes.ts:24`, `bandRoutes.ts:26`, `eventRoutes.ts:41`) apply only `authenticateToken` to delete endpoints. Fix 4 adds controller-level auth checks, but adding `requireAdmin()` at the route level as defense-in-depth is recommended for a future pass.
