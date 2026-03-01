---
phase: 13-security-infrastructure
plan: 01
subsystem: security
tags: [rate-limiting, bcrypt, trust-proxy, express, railway, fail-closed]

# Dependency graph
requires: []
provides:
  - "Trust proxy configuration for Railway reverse proxy"
  - "Fail-closed rate limiting across all 6 error paths"
  - "Bcrypt-hashed social auth password placeholders (no plaintext sentinel)"
  - "PasswordResetService column name bugfixes and social auth detection via user_social_accounts"
  - "Migration 039 to convert existing plaintext sentinel rows"
  - ".gitignore patterns for backup files"
affects: [password-reset, social-auth, rate-limiting, checkins]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-closed rate limiting: return 429 on Redis/rate-limit errors instead of allowing through"
    - "Social auth users get random bcrypt hashes indistinguishable from regular password hashes"
    - "Social auth detection via user_social_accounts table join, not password sentinel comparison"

key-files:
  created:
    - backend/migrations/039_replace-social-auth-sentinel.ts
  modified:
    - backend/src/index.ts
    - backend/src/middleware/auth.ts
    - backend/src/utils/redisRateLimiter.ts
    - backend/src/middleware/checkinRateLimit.ts
    - backend/src/services/SocialAuthService.ts
    - backend/src/services/PasswordResetService.ts
    - .gitignore

key-decisions:
  - "Used bcryptjs in TypeScript migration (portable) instead of pgcrypto SQL extension (Railway compatibility)"
  - "Removed unused bcrypt import from PasswordResetService during sentinel cleanup"

patterns-established:
  - "Fail-closed: all rate limiting error paths return 429, never next()"
  - "Social auth password: crypto.randomBytes(32) + AuthUtils.hashPassword, never plaintext"

requirements-completed: [BETA-04, BETA-07, BETA-08, BETA-09]

# Metrics
duration: 4min
completed: 2026-03-01
---

# Phase 13 Plan 01: Security Hardening Summary

**Trust proxy for Railway, fail-closed rate limiting on all 6 error paths, bcrypt replacement of plaintext $SOCIAL_AUTH$ sentinel, and PasswordResetService column/query bugfixes**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-01T16:14:07Z
- **Completed:** 2026-03-01T16:18:25Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Configured Express trust proxy so rate limiting uses real client IPs behind Railway's reverse proxy (BETA-04)
- Converted all 6 fail-open rate limiting error paths to fail-closed 429 responses across auth.ts, redisRateLimiter.ts, and checkinRateLimit.ts (BETA-07)
- Eliminated plaintext `$SOCIAL_AUTH$` sentinel from SocialAuthService and PasswordResetService; new social users get random bcrypt hashes (BETA-08)
- Fixed PasswordResetService: `password` -> `password_hash` in SELECT and UPDATE queries, social auth detection via `user_social_accounts` table join
- Created migration 039 to backfill existing `$SOCIAL_AUTH$` rows with bcrypt hashes
- Removed tracked .bak/.backup files and added patterns to .gitignore (BETA-09)

## Task Commits

Each task was committed atomically:

1. **Task 1: Trust proxy + fail-closed rate limiting** - `acfc76c` (feat)
2. **Task 2: Replace social auth plaintext sentinel + fix PasswordResetService** - `ea87424` (fix)
3. **Task 3: Delete backup files + update .gitignore** - `c17ddbc` (chore)

## Files Created/Modified
- `backend/src/index.ts` - Added `app.set('trust proxy', 1)` before middleware
- `backend/src/middleware/auth.ts` - Fail-closed rate limit catch block (429 instead of next())
- `backend/src/utils/redisRateLimiter.ts` - Fail-closed on all 3 checkRateLimit paths + middleware catch
- `backend/src/middleware/checkinRateLimit.ts` - Fail-closed daily check-in rate limit
- `backend/src/services/SocialAuthService.ts` - Random bcrypt hash instead of plaintext sentinel
- `backend/src/services/PasswordResetService.ts` - Fixed column names, social auth detection via table join
- `backend/migrations/039_replace-social-auth-sentinel.ts` - Backfill existing sentinel rows
- `.gitignore` - Added *.bak, *.backup, *.orig, *.old patterns

## Decisions Made
- Used bcryptjs in TypeScript migration code instead of PostgreSQL pgcrypto extension for portability across Railway environments
- Removed unused `bcrypt` import from PasswordResetService (only the `SOCIAL_AUTH_NO_PASSWORD` constant was removed by plan, but the `bcrypt` import became dead code as a result)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused bcrypt import from PasswordResetService**
- **Found during:** Task 2 (sentinel removal)
- **Issue:** After removing the `SOCIAL_AUTH_NO_PASSWORD` constant, the `bcrypt` import became unused (bcrypt was only used indirectly via `AuthUtils.hashPassword`)
- **Fix:** Removed `import bcrypt from 'bcryptjs'` and cleaned up extra blank line
- **Files modified:** backend/src/services/PasswordResetService.ts
- **Verification:** TypeScript compiles clean with `npx tsc --noEmit`
- **Committed in:** ea87424 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug cleanup)
**Impact on plan:** Minimal cleanup of dead import. No scope creep.

## Issues Encountered
- 10 pre-existing test failures in CheckinService test suite (UUID validation error mismatch). Confirmed identical failure count before and after changes -- not caused by this plan's modifications.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All security hardening for BETA-04/07/08/09 complete
- Ready for Phase 13 Plan 02 (CI/CD, gitleaks, env documentation) or other beta launch tasks
- Migration 039 needs to be run against production database before beta launch

---
*Phase: 13-security-infrastructure*
*Completed: 2026-03-01*
