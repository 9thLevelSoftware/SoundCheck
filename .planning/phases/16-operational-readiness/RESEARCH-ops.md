# Phase 16: Operational Readiness — Research

## Current State Assessment

### 1. Sentry Error Tracking (BETA-20)

**Status: Code complete, DSN not configured**

`backend/src/utils/sentry.ts` — Full wrapper module exists:
- `initSentry()`: reads `SENTRY_DSN`, no-ops gracefully if absent
- `setupSentryForExpress(app)`: Sentry v10+ `setupExpressErrorHandler`
- `closeSentry()`: flush + close on graceful shutdown
- `captureException()`, `captureMessage()`: wrapped helpers
- `setUser()`, `clearUser()`, `addBreadcrumb()`: lifecycle helpers (unused)
- `beforeSend` scrubs `authorization`, `cookie`, `x-api-key` headers
- `tracesSampleRate`: 0.1 prod / 1.0 dev

Callsites in `backend/src/index.ts`:
- Line 12: `initSentry()` — early startup
- Line 252: `setupSentryForExpress(app)` — after routes, before error handler
- Line 271: `sentryCaptureException(error, ...)` — global 5xx handler
- Line 391: `sentryCaptureException(error, { type: 'uncaughtException' })`
- Line 398: `sentryCaptureException(reason, { type: 'unhandledRejection' })`

**Gaps:**
- `SENTRY_DSN` env var not set in Railway (placeholder in `.env.example` line 85)
- `setUser()` never called in auth middleware — Sentry events lack user context
- No test error route to verify capture works

### 2. Health Endpoint (BETA-21)

**Status: Complete, ready for monitoring**

`backend/src/index.ts` lines 163-191:
- `GET /health` — returns `{ status, timestamp, version, database, websocket }`
- Returns 200 on success, 503 on failure
- Checks DB via `SELECT 1`
- Version hardcoded as `"1.0.0"` (minor)

**What's needed:** External monitoring service (UptimeRobot/Better Uptime) configured to ping `/health`.

### 3. Deployment Config (BETA-22, BETA-24)

**Three overlapping config files — needs cleanup:**

| File | Purpose | Start cmd | Migrations? |
|------|---------|-----------|-------------|
| `railway.toml` (root) | Active Railway config | `cd backend && npm run migrate:up && npm start` | Yes |
| `nixpacks.toml` (root) | Nixpacks build/start | `cd backend && node dist/index.js` | No |
| `backend/railway.json` | Legacy (pre-monorepo) | `npm start` | No |

`railway.toml` `[deploy].startCommand` overrides `nixpacks.toml` `[start].cmd` — confirmed Railway precedence. `backend/railway.json` is stale and should be deleted.

Current deploy flow: push to `master` → Railway detects via GitHub webhook → nixpacks builds → `railway.toml` startCommand runs migrations + starts server.

**Gaps:**
- `backend/railway.json` — legacy cruft, potential confusion
- `nixpacks.toml` `[start]` conflicts with `railway.toml` — remove to avoid ambiguity
- No staging environment exists
- No documented runbook

### 4. Winston Logger — Pre-existing Bug

**Production logs invisible on Railway.**

`backend/src/utils/logger.ts`:
- Development: Console transport with colorized output
- Production: **Only** `DailyRotateFile` transports to `../../logs/`
- Railway containers have ephemeral filesystems — files vanish on redeploy
- **Result: Zero logs visible in Railway dashboard** (Railway captures stdout/stderr)

Fix: Add a JSON Console transport for production so Railway can capture logs.

### 5. Test Infrastructure (BETA-23)

**Framework:** Jest 29 + ts-jest + supertest
**Tests:** 24 test files under `backend/src/__tests__/`
**Smoke tests:** Zero — no `smoke/` directory or equivalent

Integration tests (`ReviewService.integration.test.ts`, `CheckinService.integration.test.ts`) are gated by `RUN_INTEGRATION_TESTS=true` env var.

**What's needed:** A new `smoke.test.ts` that hits the actual Express app (via supertest) on critical paths: health, register, login, check-in creation, feed load.

### 6. CI/CD (relates to BETA-23, BETA-24)

`.github/workflows/ci.yml`:
- Triggers: push/PR to master, main, develop
- Backend: `npm ci → npm run build → npm test`
- Mobile: Flutter analyze + test
- Secret scan: Gitleaks

**No CD:** Railway deploys via GitHub push webhook. No smoke test step post-deploy. No staging gate.

## Plan Breakdown

Based on the requirements and dependencies, **2 plans**:

**Plan 1 (Backend code changes):** Fix pre-existing logger bug (stdout for production), add Sentry user context in auth middleware, create smoke tests, clean up deployment config files, add test error endpoint for Sentry verification.

**Plan 2 (Documentation + ops setup):** Deployment runbook, staging environment setup instructions, uptime monitoring configuration guide, Sentry DSN configuration steps.
