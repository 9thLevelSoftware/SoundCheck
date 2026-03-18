# Phase 1 Infrastructure Audit -- Beta Readiness Review

**Date:** 2026-03-18
**Auditor:** DevOps Automator (Claude Opus 4.6)
**Scope:** Deployment, environment config, job reliability, logging/monitoring, CI/CD, Redis failover
**Target:** Public beta (~500-2,000 users)

---

## Executive Summary

The SoundCheck backend is well-structured for a monorepo deployment on Railway with
Nixpacks. The codebase demonstrates thoughtful graceful degradation patterns -- most
optional services (Redis, Firebase, R2, Ticketmaster, etc.) degrade cleanly when
credentials are missing. However, the audit identified **2 blockers**, **5 high-severity
issues**, **6 medium issues**, and **5 low-severity improvements** that should be
addressed before public beta.

The most critical gaps are: (1) no Railway health check configuration, meaning deploys
cannot detect a broken release before routing traffic, and (2) the database pool crashes
the entire process on idle-client errors, which combined with the restart policy may
cause cascading failures.

---

## Findings

### INF-001: No Railway Health Check Configured
**Severity:** Blocker
**File(s):** `railway.toml:1-9`
**Description:** The `railway.toml` deploy section has no `healthcheckPath` or
`healthcheckTimeout` configured. Railway uses health checks to determine when a new
deployment is ready to receive traffic. Without a health check, Railway will route
traffic to the new instance immediately after the process starts -- even if the database
connection has not been established or migrations are still running. This means a bad
deploy will serve 503s to all users until the restart policy kicks in.
**Evidence:**
```toml
[deploy]
startCommand = "cd backend && npm run migrate:up && npm start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
# No healthcheckPath, healthcheckTimeout, or numReplicas
```
The application does have a `/health` endpoint (index.ts:169) that checks the database
connection, which is exactly what should be wired up.
**Recommended Fix:** Add health check configuration to `railway.toml`:
```toml
[deploy]
startCommand = "cd backend && npm run migrate:up && npm start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
healthcheckPath = "/health"
healthcheckTimeout = 120
```
The 120-second timeout accounts for migration time on deploys.

---

### INF-002: Database Pool Error Crashes Process
**Severity:** Blocker
**File(s):** `backend/src/config/database.ts:91-94`
**Description:** The PostgreSQL connection pool's `error` event handler calls
`process.exit(-1)` on any idle client error. This is an aggressive response to
transient network issues (e.g., Railway internal networking hiccup, brief PostgreSQL
maintenance). Combined with `restartPolicyMaxRetries = 10`, a flapping database
connection could exhaust all retries and leave the service down permanently.
**Evidence:**
```typescript
this.pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', { ... });
  process.exit(-1);  // Kills the entire process
});
```
The `pg` Pool emits `error` events for idle clients that encounter problems -- this is
expected during transient network issues and does not mean the pool is unusable. Active
queries will receive their own errors.
**Recommended Fix:** Log the error and let the pool's internal reconnection handle
recovery. Only exit on fatal, unrecoverable conditions:
```typescript
this.pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', { ... });
  // Do NOT process.exit -- the pool will create new connections as needed.
  // If the database is truly down, healthCheck() will fail and
  // Railway's health check will handle restart.
});
```

---

### INF-003: Graceful Shutdown Does Not Close HTTP Server
**Severity:** High
**File(s):** `backend/src/index.ts:370-396`
**Description:** The SIGTERM and SIGINT handlers close BullMQ workers, Sentry, Redis,
WebSocket, and the database pool, but never call `server.close()` on the HTTP server
itself. This means in-flight HTTP requests may be abruptly terminated during deploys.
On Railway, SIGTERM is sent during deployment rollover -- incomplete requests will fail
with connection resets.
**Evidence:**
```typescript
process.on('SIGTERM', async () => {
  logInfo('SIGTERM received, shutting down gracefully');
  if (syncWorker) await stopEventSyncWorker(syncWorker);
  // ... workers, sentry, redis, websocket, db ...
  process.exit(0);
  // Missing: server.close() to drain in-flight HTTP connections
});
```
**Recommended Fix:** Call `server.close()` first, then close downstream dependencies:
```typescript
process.on('SIGTERM', async () => {
  logInfo('SIGTERM received, shutting down gracefully');
  server.close();  // Stop accepting new connections, drain in-flight
  // Then close workers, sentry, redis, websocket, db
  ...
});
```

---

### INF-004: Notification Worker LRANGE+DEL Is Not Atomic
**Severity:** High
**File(s):** `backend/src/jobs/notificationWorker.ts:56-57`
**Description:** The notification batch worker reads the pending notification list with
`LRANGE` and then deletes it with a separate `DEL` command. Between these two commands,
a new notification could be pushed onto the list by the API server and would be silently
lost when `DEL` executes.
**Evidence:**
```typescript
const items = await redis.lrange(listKey, 0, -1);
await redis.del(listKey);
// If a new item is pushed between lrange and del, it is lost
```
At 500-2,000 users with active friend graphs, the timing window is material --
especially when multiple friends check in to the same event within the 2-minute batch
window.
**Recommended Fix:** Use a Lua script or Redis MULTI/EXEC transaction to atomically
read and delete:
```typescript
const items = await redis.multi()
  .lrange(listKey, 0, -1)
  .del(listKey)
  .exec();
```
Or use `RENAME` to swap the list to a processing key before reading.

---

### INF-005: BullMQ Workers Have No Stalled Job Detection Configuration
**Severity:** High
**File(s):** `backend/src/jobs/badgeWorker.ts:54-58`, `backend/src/jobs/eventSyncWorker.ts:59-63`, `backend/src/jobs/moderationWorker.ts:91-95`, `backend/src/jobs/notificationWorker.ts:99-103`
**Description:** None of the four BullMQ workers configure `lockDuration` or
`stalledInterval`. BullMQ defaults to `lockDuration: 30000` (30s). If the event sync
job (which calls the Ticketmaster API with pagination and rate limiting) takes longer
than 30 seconds, BullMQ will consider the job stalled and either retry it or move it to
failed. The event sync can easily take 2-5 minutes for a full multi-region sync.
**Evidence:**
```typescript
const worker = new Worker(
  'event-sync',
  async (job: Job) => { ... },
  {
    connection: createBullMQConnection(),
    concurrency: 1,
    // No lockDuration, stalledInterval, or maxStalledCount
  },
);
```
**Recommended Fix:** Configure appropriate lock durations based on expected job runtime:
```typescript
// Event sync: can take several minutes
{ lockDuration: 300000, stalledInterval: 60000 }

// Badge eval: typically <10s
{ lockDuration: 60000, stalledInterval: 30000 }

// Image moderation: Cloud Vision call + DB write, typically <30s
{ lockDuration: 60000, stalledInterval: 30000 }

// Notification: quick Redis + FCM call, typically <5s
{ lockDuration: 30000, stalledInterval: 15000 }
```

---

### INF-006: Sentry Not Wired into BullMQ Job Failures
**Severity:** High
**File(s):** `backend/src/jobs/badgeWorker.ts:65-71`, `backend/src/jobs/eventSyncWorker.ts:70-76`, `backend/src/jobs/moderationWorker.ts:102-108`, `backend/src/jobs/notificationWorker.ts:110-116`
**Description:** All four BullMQ workers log job failures via Winston but none report
errors to Sentry. The global Express error handler in index.ts calls
`sentryCaptureException` for HTTP 5xx errors, but BullMQ workers run outside the
Express request lifecycle. Failed background jobs (badge eval, event sync, moderation,
notifications) will only appear in Railway logs, which have limited retention and no
alerting.
**Evidence:**
```typescript
worker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error(`Job failed: ${job?.id || 'unknown'}`, {
    jobId: job?.id,
    error: err.message,
    attemptsMade: job?.attemptsMade,
  });
  // No Sentry.captureException(err) call
});
```
Across the entire codebase, `captureException` is only imported/used in `index.ts`.
**Recommended Fix:** Import and call `captureException` from `utils/sentry` in each
worker's `failed` event handler:
```typescript
import { captureException } from '../utils/sentry';
worker.on('failed', (job, err) => {
  logger.error(...);
  captureException(err, { jobId: job?.id, queue: 'badge-eval', attemptsMade: job?.attemptsMade });
});
```

---

### INF-007: Sentry User Context Sends PII (email)
**Severity:** High
**File(s):** `backend/src/middleware/auth.ts:60`, `backend/src/middleware/auth.ts:93`
**Description:** The authentication middleware sends the user's email address to Sentry
via `sentrySetUser()`. While the `beforeSend` hook in sentry.ts scrubs sensitive
*headers* (authorization, cookie, x-api-key), it does not scrub user email from the
user context. Under GDPR/CCPA, user emails in a third-party error tracking service
require explicit consent or a legitimate interest assessment.
**Evidence:**
```typescript
sentrySetUser({ id: user.id, email: user.email, username: user.username });
```
**Recommended Fix:** Remove `email` from Sentry user context. User ID is sufficient
for debugging:
```typescript
sentrySetUser({ id: user.id, username: user.username });
```

---

### INF-008: CI Pipeline Missing TypeScript Type Checking as Separate Step
**Severity:** Medium
**File(s):** `.github/workflows/ci.yml:29-30`
**Description:** The CI pipeline runs `npm run build` which invokes `tsc`, so type
errors will fail the build. However, `tsc` is being used as both the type checker and
the build tool in a single step. If the build passes, type errors are caught. But the
test step runs *after* the build -- if tests import modules with type errors that are
not caught by `tsc --noEmit`, they could pass in ts-jest even when the build fails. A
separate `npx tsc --noEmit` step before tests would be more robust, though the current
setup is acceptable for beta.
**Evidence:**
```yaml
- name: Build
  run: npm run build
# No separate "npm run lint" or "npx tsc --noEmit" step
```
**Recommended Fix:** Add explicit lint and type-check steps:
```yaml
- name: Type Check
  run: npx tsc --noEmit
- name: Build
  run: npm run build
```

---

### INF-009: File-Based Log Rotation in Ephemeral Container
**Severity:** Medium
**File(s):** `backend/src/utils/logger.ts:72-96`
**Description:** In production, Winston writes to rotating log files
(`soundcheck-%DATE%.log` and `soundcheck-error-%DATE%.log`) in addition to stdout JSON.
On Railway, containers are ephemeral -- file system is wiped on every deploy. The
14-day and 30-day retention settings are meaningless because files never survive a
deploy. The file transports add I/O overhead with no benefit.
**Evidence:**
```typescript
if (process.env.NODE_ENV === 'production') {
  transports.push(
    new DailyRotateFile({
      dirname: path.join(__dirname, '../../logs'),
      maxFiles: '14d', // Files are lost on every deploy anyway
    })
  );
```
**Recommended Fix:** Remove file-based transports in production. Railway captures stdout
natively. If persistent logs are needed, forward to a log aggregation service
(Datadog, Logtail, Axiom) via a Winston transport or Railway's log drain feature.

---

### INF-010: Rate Limiter Fail-Closed Blocks All Traffic When Redis Unavailable
**Severity:** Medium
**File(s):** `backend/src/utils/redisRateLimiter.ts:85-87`
**Description:** The `checkRateLimit` function returns `allowed: false` when the Redis
instance is null (line 85-87). While the auth middleware in `auth.ts` has an in-memory
fallback (line 196-265), the `RedisRateLimiter` class used elsewhere does not fall
through to the in-memory path. If Redis goes down during a Railway maintenance window,
the `RedisRateLimiter.middleware()` will 429-reject all incoming requests.
**Evidence:**
```typescript
// redisRateLimiter.ts:85-87
if (!redis) {
  return { allowed: false, remaining: 0, resetAt: Date.now() + windowMs };
}
```
Versus auth.ts which has:
```typescript
// auth.ts:253-254 - Falls back to in-memory when Redis unavailable
const result = checkInMemoryRateLimit(clientIP, windowMs, maxRequests);
```
**Recommended Fix:** The `RedisRateLimiter` singleton's `middleware()` method (line 157)
should check if Redis is null and fall through to an in-memory check, similar to what
`auth.ts` already does. Alternatively, always use the `rateLimit()` function from
`auth.ts` which already has the fallback logic.

---

### INF-011: Migration Runs Inline with Server Start
**Severity:** Medium
**File(s):** `railway.toml:6`
**Description:** The start command is
`cd backend && npm run migrate:up && npm start`. This runs migrations synchronously
before the server starts. If a migration fails (e.g., due to a lock conflict with a
concurrent deploy), the process exits and Railway counts it as a failure against the
10-retry limit. Additionally, migrations block the health check from responding during
the migration window. For a single-instance Railway deploy this is acceptable, but if
you scale to multiple instances, concurrent migrations could conflict.
**Evidence:**
```toml
startCommand = "cd backend && npm run migrate:up && npm start"
```
**Recommended Fix:** For beta with a single instance, this is tolerable. Before scaling
to multiple instances, extract migrations to a separate Railway service or use an
advisory lock in the migration script:
```sql
SELECT pg_advisory_lock(12345);
-- run migrations
SELECT pg_advisory_unlock(12345);
```

---

### INF-012: unhandledRejection Handler Exits Process
**Severity:** Medium
**File(s):** `backend/src/index.ts:405-411`
**Description:** The `unhandledRejection` handler calls `process.exit(1)`. While this
is the Node.js recommended behavior for truly unhandled rejections, it means any
forgotten `await` or missing `.catch()` in controller code will crash the entire server.
In a beta environment with active development, this is aggressive -- a single unhandled
promise rejection in a non-critical path (e.g., a failed notification send) will take
down all active user connections.
**Evidence:**
```typescript
process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection', { reason, promise });
  if (reason instanceof Error) {
    sentryCaptureException(reason, { type: 'unhandledRejection' });
  }
  process.exit(1);  // Kills the process
});
```
**Recommended Fix:** Log and report to Sentry but do not exit. Add a metric/counter to
track unhandled rejections so you can identify and fix them without taking the service
down:
```typescript
process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Rejection', { reason, promise });
  if (reason instanceof Error) {
    sentryCaptureException(reason, { type: 'unhandledRejection' });
  }
  // Do not exit -- let the request cycle complete
});
```

---

### INF-013: No Shutdown Timeout / Forced Exit
**Severity:** Medium
**File(s):** `backend/src/index.ts:370-396`
**Description:** The SIGTERM handler awaits all shutdown steps sequentially
(4 workers + Sentry + Redis + WebSocket + database). If any of these hangs (e.g., a
BullMQ worker waiting for a stuck job to complete), the shutdown will never finish.
Railway sends SIGKILL after a grace period (default 10s), but the process will be
hard-killed mid-cleanup.
**Evidence:**
```typescript
process.on('SIGTERM', async () => {
  if (syncWorker) await stopEventSyncWorker(syncWorker);  // Could hang
  if (badgeWorker) await stopBadgeEvalWorker(badgeWorker);
  if (notifWorker) await stopNotificationWorker(notifWorker);
  if (modWorker) await stopModerationWorker(modWorker);
  await closeSentry(2000);
  await closeRedis();
  // ... no timeout, no forced exit
});
```
**Recommended Fix:** Add a hard timeout to the shutdown sequence:
```typescript
const SHUTDOWN_TIMEOUT = 8000; // Leave 2s margin before Railway SIGKILL
setTimeout(() => {
  logError('Forced shutdown after timeout');
  process.exit(1);
}, SHUTDOWN_TIMEOUT).unref();
```

---

### INF-014: WebSocket PubSub Creates Connection Even When WebSocket Disabled
**Severity:** Low
**File(s):** `backend/src/utils/websocket.ts:106-122`
**Description:** The Redis Pub/Sub subscriber connection is created inside the `init()`
method, which is guarded by `ENABLE_WEBSOCKET=true`. This is correct. However, the
`createPubSubConnection()` function in `config/redis.ts` will throw if `REDIS_URL` is
not set, and the catch block logs a warning. This is handled, but worth noting that
there is no Redis connection leak -- the error is caught properly.
**Evidence:** No action needed; this is informational. The pattern is correct.
**Recommended Fix:** None required.

---

### INF-015: CI Missing ESLint/Prettier Linting Step
**Severity:** Low
**File(s):** `.github/workflows/ci.yml`
**Description:** The CI pipeline runs build and tests but has no linting step for the
backend. The mobile job runs `flutter analyze`, but there is no equivalent for the
Node.js backend. Code style inconsistencies will not be caught until review.
**Evidence:**
```yaml
# Backend CI steps: checkout, setup, install, build, test
# Missing: lint step
```
**Recommended Fix:** Add ESLint configuration and a lint step:
```yaml
- name: Lint
  run: npx eslint src/ --ext .ts
```

---

### INF-016: Sentry release Tag Uses npm_package_version
**Severity:** Low
**File(s):** `backend/src/utils/sentry.ts:28`
**Description:** The Sentry `release` field is set to `process.env.npm_package_version`.
This variable is only available when the process is started via `npm start` (npm injects
it). On Railway, the start command is
`cd backend && npm run migrate:up && npm start`, so npm does inject it. However, if the
start command ever changes to invoke `node dist/index.js` directly, the release tag will
fall back to `'1.0.0'` and all errors will be grouped under the same release.
**Evidence:**
```typescript
release: process.env.npm_package_version || '1.0.0',
```
**Recommended Fix:** Explicitly set a `SENTRY_RELEASE` env var in Railway, ideally
derived from the git commit SHA:
```typescript
release: process.env.SENTRY_RELEASE || process.env.npm_package_version || '1.0.0',
```

---

### INF-017: CORS_ORIGIN Warning But No CORS_ORIGIN Default
**Severity:** Low
**File(s):** `backend/src/index.ts:126-146`, `backend/src/index.ts:336-338`
**Description:** In production, if `CORS_ORIGIN` is not set, the CORS middleware logs a
warning but then *rejects* all requests with an Origin header (line 128-129). This is
actually secure behavior for a mobile-first API (mobile apps don't send Origin headers).
However, the startup warning at line 337 says "CORS will allow all origins" which
contradicts the actual behavior (it rejects all origins). The log message is misleading.
**Evidence:**
```typescript
// Line 337 - misleading warning
logWarn('CORS_ORIGIN not set - CORS will allow all origins.');

// Line 128 - actual behavior: rejects all requests with an origin
if (!corsOrigin) {
  logError('CORS: CORS_ORIGIN not configured, rejecting request from:', { origin });
  return callback(new Error('CORS not configured'), false);
}
```
**Recommended Fix:** Fix the startup warning message to match actual behavior:
```typescript
logWarn('CORS_ORIGIN not set. Requests with Origin headers (browsers) will be rejected.');
```

---

### INF-018: In-Memory Rate Limit Map Has No Size Bound
**Severity:** Low
**File(s):** `backend/src/middleware/auth.ts:196`
**Description:** The in-memory rate limit fallback store (`inMemoryRateLimitStore`) is a
`Map` that grows with each unique client IP. The cleanup interval runs every 5 minutes,
but during a DDoS or bot attack the map could grow to millions of entries before cleanup
runs, consuming significant memory.
**Evidence:**
```typescript
const inMemoryRateLimitStore = new Map<string, { count: number; resetTime: number }>();
// Cleanup runs every 5 minutes (line 291)
```
**Recommended Fix:** Add a maximum size check before inserting new entries. If the map
exceeds a threshold (e.g., 100,000 entries), deny the request rather than growing the
map further.

---

## Environment Variable Inventory

### Required (no default -- app will not start or feature is broken)

| Variable | File(s) | Notes |
|---|---|---|
| `JWT_SECRET` | `index.ts:70`, `utils/auth.ts:15` | Validated at startup; must be >= 32 chars |
| `DATABASE_URL` or `DB_PASSWORD` | `index.ts:79`, `config/database.ts:39,78` | One of the two is required |

### Required for Core Features (graceful degradation if missing)

| Variable | File(s) | Behavior When Missing |
|---|---|---|
| `REDIS_URL` | `config/redis.ts:16`, `utils/redisRateLimiter.ts:23` | BullMQ jobs disabled, rate limit falls back to in-memory |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `services/PushNotificationService.ts:21` | Push notifications disabled |
| `CLOUDFLARE_ACCOUNT_ID` | `services/R2Service.ts:42` | Photo uploads disabled |
| `R2_ACCESS_KEY_ID` | `services/R2Service.ts:43` | Photo uploads disabled |
| `R2_SECRET_ACCESS_KEY` | `services/R2Service.ts:44` | Photo uploads disabled |
| `GOOGLE_CLIENT_ID` | `services/SocialAuthService.ts:43` | Google sign-in returns null |
| `APPLE_BUNDLE_ID` | `services/SocialAuthService.ts:103` | Apple sign-in throws error |
| `RESEND_API_KEY` | `services/EmailService.ts:16` | Password reset emails not sent |
| `TICKETMASTER_API_KEY` | `services/EventSyncService.ts:53`, `services/TicketmasterAdapter.ts:48` | Event sync pipeline disabled |
| `SENTRY_DSN` | `utils/sentry.ts:18` | Error tracking disabled |
| `REVENUECAT_WEBHOOK_AUTH` | `controllers/SubscriptionController.ts:15` | Subscription webhooks return 200 with "not configured" |

### Optional (has fallback / default value)

| Variable | Default | File(s) |
|---|---|---|
| `NODE_ENV` | `'development'` | Multiple files |
| `PORT` | `3000` | `index.ts:87` |
| `DB_HOST` | `'localhost'` | `config/database.ts:74` |
| `DB_PORT` | `'5432'` | `config/database.ts:75` |
| `DB_NAME` | `'soundcheck'` | `config/database.ts:76` |
| `DB_USER` | `'postgres'` | `config/database.ts:77` |
| `DB_SSL` | `'verify'` (SSL enabled) | `config/database.ts:12` |
| `JWT_EXPIRES_IN` | `'7d'` | `utils/auth.ts:24` |
| `CORS_ORIGIN` | (none -- rejects browser requests) | `index.ts:126` |
| `ENABLE_WEBSOCKET` | `'false'` (disabled) | `utils/websocket.ts:54` |
| `R2_BUCKET_NAME` | `'soundcheck-photos'` | `services/R2Service.ts:38` |
| `R2_PUBLIC_URL` | `''` | `services/R2Service.ts:39`, `services/CheckinService.ts:295` |
| `RESEND_FROM_ADDRESS` | `'SoundCheck <noreply@resend.dev>'` | `services/EmailService.ts:25` |
| `BASE_URL` | `(derived from request)` | `controllers/ShareController.ts:249`, `controllers/UserController.ts:473` |
| `APP_STORE_URL` | `'#'` | `controllers/ShareController.ts:251` |
| `PLAY_STORE_URL` | `'#'` | `controllers/ShareController.ts:252` |
| `FOURSQUARE_API_KEY` | `''` (disabled) | `services/FoursquareService.ts:47` |
| `SETLISTFM_API_KEY` | `''` (disabled) | `services/SetlistFmService.ts:85` |
| `MUSICBRAINZ_USER_AGENT` | `'SoundCheck/1.0'` | `services/MusicBrainzService.ts:42` |

### Documentation Quality

The `.env.example` file is thorough and well-organized into tiers. It includes a Railway
configuration checklist with 17 items. This is good operational documentation.

**Gap:** No variable is documented for `GOOGLE_APPLICATION_CREDENTIALS` which the
Cloud Vision client (`ImageModerationService`) may require implicitly via the Google
Cloud SDK's Application Default Credentials flow. If the
`@google-cloud/vision` package is used in production, this needs either
`GOOGLE_APPLICATION_CREDENTIALS` or the service account credentials set via another
mechanism.

---

## Operational Readiness Assessment

### What Is Working Well

1. **Graceful degradation pattern** -- Every optional service (Redis, Firebase, R2,
   Ticketmaster, Foursquare, SetlistFM, Sentry, Resend, WebSocket) checks for its
   credentials and degrades cleanly. The app starts even if external services are
   unconfigured.

2. **Security posture** -- Helmet is configured with restrictive defaults, CORS properly
   blocks wildcard origins in production, WebSocket rooms require authentication,
   rate limiting is fail-closed, JWT minimum length is enforced.

3. **BullMQ queue design** -- Job deduplication via `jobId`, exponential backoff on all
   queues, completed/failed job retention for debugging, null-guard pattern prevents
   crashes when Redis is unavailable.

4. **Secret scanning** -- Gitleaks is configured in CI to prevent credential leaks.

5. **Structured logging** -- JSON format in production via Winston stdout, which
   Railway captures natively.

### Pre-Beta Blockers (Must Fix)

| ID | Title | Effort |
|---|---|---|
| INF-001 | Add Railway health check path | 5 min |
| INF-002 | Remove process.exit from pool error handler | 10 min |

### High Priority (Should Fix Before Beta)

| ID | Title | Effort |
|---|---|---|
| INF-003 | Add server.close() to graceful shutdown | 10 min |
| INF-004 | Make notification LRANGE+DEL atomic | 15 min |
| INF-005 | Configure BullMQ lockDuration per worker | 20 min |
| INF-006 | Wire Sentry into BullMQ job failures | 30 min |
| INF-007 | Remove email from Sentry user context | 5 min |

### Medium Priority (Fix During Beta)

| ID | Title | Effort |
|---|---|---|
| INF-008 | Add explicit tsc --noEmit CI step | 5 min |
| INF-009 | Remove file-based log transports in production | 10 min |
| INF-010 | Add in-memory fallback to RedisRateLimiter | 20 min |
| INF-011 | Document migration advisory lock strategy | 15 min |
| INF-012 | Remove process.exit from unhandledRejection | 5 min |
| INF-013 | Add shutdown timeout with forced exit | 10 min |

### Low Priority (Improve When Convenient)

| ID | Title | Effort |
|---|---|---|
| INF-015 | Add ESLint CI step | 30 min |
| INF-016 | Use explicit SENTRY_RELEASE env var | 5 min |
| INF-017 | Fix misleading CORS startup warning | 5 min |
| INF-018 | Bound in-memory rate limit map size | 15 min |

---

## Risks and Follow-ups

1. **Single instance.** Railway runs a single container by default. There is no
   horizontal scaling configured. For 500-2,000 users this is likely sufficient, but
   the `max: 20` PG pool connections and BullMQ concurrency settings should be
   monitored.

2. **No database backup automation.** Railway's PostgreSQL plugin provides automated
   backups, but the backup schedule and restoration process should be tested before
   beta.

3. **No load testing.** Before inviting 2,000 users, run a basic load test against the
   `/health`, `/api/feed`, and `/api/checkins` endpoints to validate connection pool
   sizing and Redis throughput.

4. **No application-level metrics.** There is no Prometheus/StatsD/Datadog integration.
   You are relying on Railway's built-in metrics (CPU, memory) and Sentry for errors.
   Consider adding custom metrics for: request latency percentiles, BullMQ queue depth,
   active WebSocket connections, and database pool utilization.
