---
phase: 16-operational-readiness
plan: 01
status: complete
---

## Summary

Fixed pre-existing production logging gap, enriched Sentry with user context, created critical-path smoke tests, and cleaned up deployment config conflicts.

## Changes Made

### 1. Production Logger — Console Transport (backend/src/utils/logger.ts)
- Added JSON Console transport in the production block so Railway can capture logs via stdout
- Kept existing DailyRotateFile transports (harmless on Railway, useful in other environments)

### 2. Sentry User Context (backend/src/middleware/auth.ts)
- Imported `setUser` from `../utils/sentry`
- Called `sentrySetUser()` after successful authentication in both `authenticateToken` and `optionalAuth` middleware
- Sentry events now include user id, email, and username

### 3. Sentry Test Route + Dynamic Version (backend/src/index.ts)
- Added `readFileSync` to read version from `package.json` at startup (`APP_VERSION`)
- Replaced hardcoded `'1.0.0'` in health and root endpoints with `APP_VERSION`
- Added `GET /api/debug/sentry-test` admin-only route that throws intentional error for Sentry verification

### 4. Smoke Tests (backend/src/__tests__/smoke/smoke.test.ts)
- Created 5 smoke tests covering: health endpoint, user registration, user login, auth-required route, 404 handler
- Uses supertest against a minimal Express app with mocked services
- All tests pass

### 5. Deployment Config Cleanup
- Deleted `backend/railway.json` (legacy pre-monorepo config)
- Removed `[start]` section from `nixpacks.toml` (conflicted with `railway.toml` startCommand)
- Single source of truth: `railway.toml` for start command, `nixpacks.toml` for build only

## Requirements Addressed
- BETA-20 (partial): Sentry enriched with user context + test route
- BETA-23: 5 smoke tests covering critical API paths

## Pre-existing Issues Fixed
- Winston production logs invisible on Railway (file-only transport → added Console)
- Health endpoint version hardcoded to '1.0.0' → reads from package.json

## Verification
- TypeScript compiles clean (`npx tsc --noEmit`)
- All 5 smoke tests pass
- No regressions in existing test suite (2 pre-existing failures in CheckinService + UserService unrelated to these changes)
