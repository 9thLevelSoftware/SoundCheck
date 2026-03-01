# SoundCheck Deployment & Operations Runbook

> Railway-based deployment for the SoundCheck backend API.

## Architecture

- **Platform**: Railway (Nixpacks builder)
- **Build config**: `nixpacks.toml` (install + build phases)
- **Deploy config**: `railway.toml` (start command with auto-migration)
- **Database**: Railway-provisioned PostgreSQL
- **Cache/Queue**: Railway-provisioned Redis (optional — app degrades gracefully)
- **Monitoring**: Sentry (error tracking) + UptimeRobot (uptime)

## Environment Variables

See `.env.example` for the full list with tiers and descriptions.

**Critical variables that must be set in Railway:**

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | (auto-provisioned) | Railway Postgres plugin sets this |
| `JWT_SECRET` | `openssl rand -hex 32` | Rotate on any suspected leak |
| `NODE_ENV` | `production` | Must be `production` — controls CORS, error responses, logging |
| `CORS_ORIGIN` | `https://soundcheck.app` | Never use `*` in production |
| `SENTRY_DSN` | `https://xxx@o123.ingest.sentry.io/456` | See [Sentry Setup](#sentry-setup) |
| `REDIS_URL` | (auto-provisioned) | Railway Redis plugin sets this |
| `ENABLE_WEBSOCKET` | `true` | Required for real-time features |

## Deploy Procedure

### Pre-Deploy Checklist

- [ ] All changes committed and pushed to `master`
- [ ] CI pipeline passes (GitHub Actions: build, test, gitleaks)
- [ ] If schema changes: migration file exists in `backend/migrations/`
- [ ] If new env vars: added to Railway Variables dashboard
- [ ] If risky change: tested on staging first (see [Staging](#staging-environment))

### Deploy Steps

1. **Push to master**: Railway auto-deploys on push to `master` via GitHub webhook
2. **Monitor build**: Railway Dashboard > Deployments > watch build logs
3. **Verify startup**: Build completes > migrations run > server starts on configured port
4. **Run smoke check**: After deploy completes, verify core endpoints (see [Post-Deploy Verification](#post-deploy-verification))

### Post-Deploy Verification

Run these checks against the production URL after each deploy:

```bash
# 1. Health check
curl -s https://YOUR_RAILWAY_URL/health | jq .

# Expected: { "success": true, "data": { "status": "healthy", "database": "connected" } }

# 2. Auth endpoint responds
curl -s -X POST https://YOUR_RAILWAY_URL/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}' | jq .status

# Expected: 401 (proves the auth pipeline is working, not that credentials are valid)

# 3. Protected route enforces auth
curl -s https://YOUR_RAILWAY_URL/api/feed | jq .

# Expected: { "success": false, "error": "Access token required" }

# 4. Sentry test (admin only — requires valid admin JWT)
curl -s https://YOUR_RAILWAY_URL/api/debug/sentry-test \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"

# Expected: 500 response + error appears in Sentry dashboard within 30 seconds
```

### Rollback Procedure

1. **Railway Dashboard** > Deployments > find last known-good deployment
2. Click **Redeploy** on the good deployment — this rolls back code AND re-runs migrations
3. **If migration was destructive**: Migrations are forward-only. Contact the team to write a reverse migration and deploy that forward.
4. **Emergency**: Railway Dashboard > Settings > **Remove deployment** stops the current deployment immediately

> **Note**: `npm run migrate:up` is idempotent — re-running a previously applied migration is safe.

## Sentry Setup

1. Create a Sentry project at https://sentry.io (free tier: 5k errors/month)
2. Choose **Node.js** as the platform
3. Copy the DSN (looks like `https://xxx@o123.ingest.sentry.io/456`)
4. In Railway Dashboard > Variables, add: `SENTRY_DSN=<your DSN>`
5. Redeploy (or wait for next push)
6. Verify: Hit `GET /api/debug/sentry-test` with an admin token — check Sentry dashboard for the test error
7. Verify data scrubbing: The error event should NOT contain `authorization`, `cookie`, or `x-api-key` headers

**What Sentry captures:**
- All 5xx errors (via global error handler)
- Uncaught exceptions and unhandled promise rejections
- User context (id, email, username) on authenticated requests
- Request path, method, and status code

## Uptime Monitoring Setup

1. Create a free account at https://uptimerobot.com
2. Add a new monitor:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: SoundCheck API
   - **URL**: `https://YOUR_RAILWAY_URL/health`
   - **Monitoring Interval**: 5 minutes
3. Configure alerts:
   - **Alert Type**: Email (default) + SMS if available
   - **Alert Contacts**: Add team email addresses
4. The `/health` endpoint returns:
   - `200` with `status: "healthy"` when database is connected
   - `503` with `status: "unhealthy"` when database is down
5. UptimeRobot will alert when it receives a non-2xx response or the endpoint is unreachable

**Optional: Status Page**
UptimeRobot includes a free public status page. Enable it at Monitor > Status Pages if you want a public uptime dashboard for beta testers.

## Staging Environment

### Setup

1. In Railway Dashboard, click **New Project** > **Deploy from GitHub repo**
2. Select the same SoundCheck repository
3. Configure build/deploy:
   - Railway will auto-detect `railway.toml` and `nixpacks.toml`
   - Add a PostgreSQL plugin (separate from production)
   - Add a Redis plugin (optional)
4. Set environment variables:
   - Copy all production variables from the production service
   - **Change**: `DATABASE_URL` > auto-set by the new Postgres plugin
   - **Change**: `NODE_ENV=staging` (or keep `production` for parity)
   - **Change**: `CORS_ORIGIN` > staging URL
   - **Change**: `SENTRY_DSN` > same Sentry project (use `environment` tag to separate) or a separate project
5. Deploy by pushing to `master` — both production and staging will deploy

### Using Staging

- **Before risky deploys**: Push to a branch, manually deploy from that branch in the staging project
- **Verify migrations**: Staging runs `npm run migrate:up` on the separate database — if migration fails, production is unaffected
- **Test new features**: Use staging URL for manual QA before merging to master

### Cost

Railway free tier: $5/month credit. Staging with Postgres will consume some of this. For a beta with low traffic, one staging service + DB fits within the free tier.

## Monitoring & Alerts Summary

| System | What it monitors | Alert channel | SLA |
|--------|-----------------|---------------|-----|
| Sentry | Backend errors, exceptions | Email + Sentry dashboard | Real-time |
| UptimeRobot | `/health` endpoint availability | Email/SMS | 5-minute check interval |
| Railway | Build failures, deployment status | Railway dashboard + GitHub checks | Per-deploy |
| GitHub Actions | CI pipeline (build, test, secrets) | GitHub notifications | Per-push |

## Troubleshooting

### Logs not visible in Railway

If logs are missing from the Railway dashboard, check that the winston Console transport is present for production (`backend/src/utils/logger.ts`). Production logs must output to stdout for Railway to capture them.

### Migrations fail on deploy

1. Check Railway build logs for the migration error
2. Fix the migration file locally
3. Push to master — Railway will re-run all pending migrations
4. Migrations are idempotent: previously applied migrations are skipped

### Sentry not receiving errors

1. Verify `SENTRY_DSN` is set in Railway Variables
2. Check Railway logs for `Sentry error reporting initialized` on startup
3. Hit the test route: `GET /api/debug/sentry-test` (admin auth required)
4. If behind a CDN or firewall, ensure outbound HTTPS to `*.ingest.sentry.io` is allowed
