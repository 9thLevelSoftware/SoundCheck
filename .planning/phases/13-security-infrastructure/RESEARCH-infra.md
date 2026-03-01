# Phase 13: Security Infrastructure - Research

**Researched:** 2026-03-01
**Domain:** Security hardening (secret detection, CI, rate limiting, auth sentinels, file hygiene)
**Confidence:** HIGH

## Summary

This research covers five specific security requirements (BETA-05 through BETA-09) for the SoundCheck backend and CI infrastructure. Each finding is based on direct code inspection of the current codebase.

The project currently has **no git hooks** (only sample hooks exist), **no pre-commit framework** (no husky, no .pre-commit-config.yaml, no lefthook). The CI pipeline targets `main/develop` branches but the project uses `master`. Rate limiting has three distinct fail-open paths that should fail-closed. The `$SOCIAL_AUTH$` sentinel is stored as **plaintext** in the `password_hash` column. Two backup files are tracked in git and contain old source code.

**Primary recommendation:** These are all surgical, low-risk fixes that can be executed in parallel with no cross-dependencies.

---

## BETA-05: Secret Detection Pre-Commit Hook

### Current State
- **Git hooks directory:** `/.git/hooks/` contains only `.sample` files (no active hooks)
- **Pre-commit framework:** None. No `.pre-commit-config.yaml`, no `.husky/` directory, no `lefthook.yml`
- **Package.json hooks:** Root `package.json` has no `prepare` script, no husky dependency. Backend `package.json` has no hook-related dependencies.
- **No lint-staged, no commitlint** -- the project has zero commit-time automation

### Files
| File | Line | Relevance |
|------|------|-----------|
| `/.git/hooks/` | -- | Only `.sample` files |
| `/package.json` | 1-14 | No husky/hooks config |
| `/backend/package.json` | 1-97 | No hook dependencies |
| `/.gitignore` | 1-38 | No `.pre-commit-config.yaml` exclusion |

### What Needs to Change

**Recommended approach: `gitleaks` as a standalone pre-commit hook** (no framework needed).

Rationale for gitleaks over detect-secrets:
- gitleaks is a single Go binary, no Python runtime needed
- Works natively on Windows (this project's dev environment is Windows 11)
- Has a well-maintained default ruleset for API keys, tokens, passwords
- Can run in CI too (same tool, same rules)

Implementation plan:
1. Install gitleaks (Windows: `winget install gitleaks` or download binary)
2. Create `.git/hooks/pre-commit` script that runs `gitleaks protect --staged`
3. Create `.gitleaks.toml` at project root for any allowlist entries (e.g., test fixtures)
4. Optionally add gitleaks to CI workflow as well

**Alternative (lower friction): Add gitleaks to CI only.** Since this is a solo-developer project with no team hook distribution mechanism, a CI-based check might be more practical than a local hook. But the requirement says "pre-commit hook" so we should do both.

**No framework needed** -- husky/lefthook would be overkill for a single hook. A simple shell script in `.git/hooks/pre-commit` suffices.

### Risks
- `.git/hooks/` is not tracked by git. The hook only exists on the developer's machine. Document the setup in README or provide a setup script.
- gitleaks may produce false positives on test fixtures or example code. Pre-create `.gitleaks.toml` with allowlist rules.

---

## BETA-06: CI Pipeline Branch Trigger

### Current State
- **CI config:** `/.github/workflows/ci.yml`
- **Current triggers:** `push: branches: [main, develop]` and `pull_request: branches: [main, develop]`
- **Actual branch in use:** `master` (confirmed by git status)
- **Result:** CI **never runs**. Push to `master` does not match `main` or `develop`.

### Files
| File | Line | What's Wrong |
|------|------|-------------|
| `/.github/workflows/ci.yml` | 4 | `branches: [ main, develop ]` should include `master` |
| `/.github/workflows/ci.yml` | 7 | `branches: [ main, develop ]` should include `master` |

### Exact Current Content (lines 1-8)
```yaml
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
```

### What Needs to Change
```yaml
on:
  push:
    branches: [ master, main, develop ]
  pull_request:
    branches: [ master, main, develop ]
```

Including both `master` and `main` is defensive -- if the branch is ever renamed, CI continues to work.

### Additional Issues Found
- Line 17: `actions/checkout@v3` -- should be `@v4` (v3 is deprecated as of 2024)
- Line 20: `actions/setup-node@v3` -- should be `@v4`
- Line 43: `subosito/flutter-action@v2` -- current version
- Line 49: `flutter-version: '3.19.x'` -- may be outdated (current stable is 3.27+)
- Lines 29-31: "Run Lint (dry-run)" step just runs `npm run build` (not a lint step), and then line 33 runs `npm run build` again (duplicate build step)
- No test step for backend (only build, no `npm test`)

### Risks
- None for the branch fix itself. Purely additive change.
- The CI config has other issues (duplicate build, no backend tests, outdated actions) but those are out of scope for BETA-06 which is specifically about branch triggers.

---

## BETA-07: Auth Rate Limiter Fail-Closed

### Current State

There are **three separate rate limiting implementations**, and **all three fail-open** on errors:

#### 1. Global IP-based rate limiter (`/backend/src/middleware/auth.ts`)
- Lines 220-267: `rateLimit()` middleware
- Line 261-265: **FAIL-OPEN** -- catch block calls `next()` on any error
- Used by: `userRoutes.ts` (auth endpoints, 5 req/15min), `socialAuthRoutes.ts` (5 req/15min)

```typescript
// Line 261-265 in auth.ts
} catch (error) {
  // On any error, fail-open (allow request through)
  console.error('Rate limit error:', error);
  next();
}
```

#### 2. Redis rate limiter utility (`/backend/src/utils/redisRateLimiter.ts`)
- Lines 79-122: `checkRateLimit()` function
- Line 84-87: **FAIL-OPEN** -- returns `allowed: true` when Redis is null
- Line 117-120: **FAIL-OPEN** -- catch block returns `allowed: true`
- Line 101-102: **FAIL-OPEN** -- returns `allowed: true` when pipeline returns null
- Lines 155-184: `RedisRateLimiter.middleware()` -- Line 180: **FAIL-OPEN** on error

```typescript
// Line 117-120 in redisRateLimiter.ts
} catch (error) {
  console.error('Rate limit check error:', error);
  // On error, allow the request through (fail-open)
  return { allowed: true, remaining: maxRequests, resetAt: now + windowMs };
}
```

#### 3. Daily check-in rate limiter (`/backend/src/middleware/checkinRateLimit.ts`)
- Lines 16-53: `dailyCheckinRateLimit` middleware
- Line 48-52: **FAIL-OPEN** on error (including DB errors)

```typescript
// Line 48-52 in checkinRateLimit.ts
} catch (error) {
  console.error('Daily check-in rate limit error:', error);
  // On error, allow the request through (fail-open for rate limiting)
  next();
}
```

#### 4. Per-user rate limiter (`/backend/src/middleware/perUserRateLimit.ts`)
- Lines 40-166: `PerUserRateLimiter` class
- This one is **in-memory only** and does NOT have a try-catch fail-open pattern
- Used by: `passwordResetRoutes.ts`

### Files
| File | Lines | Fail-Open Location |
|------|-------|-------------------|
| `/backend/src/middleware/auth.ts` | 261-265 | `rateLimit()` catch block |
| `/backend/src/utils/redisRateLimiter.ts` | 84-87 | `checkRateLimit()` null redis |
| `/backend/src/utils/redisRateLimiter.ts` | 101-102 | Pipeline null result |
| `/backend/src/utils/redisRateLimiter.ts` | 117-120 | `checkRateLimit()` catch |
| `/backend/src/utils/redisRateLimiter.ts` | 178-182 | `RedisRateLimiter.middleware()` catch |
| `/backend/src/middleware/checkinRateLimit.ts` | 48-52 | `dailyCheckinRateLimit` catch |

### What Needs to Change

Change fail-open to fail-closed: when rate limiting encounters an error, **deny the request** (429) rather than allowing it through.

**For `auth.ts` rateLimit():**
```typescript
} catch (error) {
  console.error('Rate limit error:', error);
  // Fail-closed: deny request when rate limiting is unavailable
  res.status(429).json({
    success: false,
    error: 'Service temporarily unavailable, please try again later',
  });
}
```

**For `redisRateLimiter.ts` checkRateLimit():**
```typescript
} catch (error) {
  console.error('Rate limit check error:', error);
  // Fail-closed: deny when Redis is unavailable
  return { allowed: false, remaining: 0, resetAt: now + windowMs };
}
```

**For `checkinRateLimit.ts`:**
```typescript
} catch (error) {
  console.error('Daily check-in rate limit error:', error);
  // Fail-closed: deny when rate check fails
  res.status(429).json({
    success: false,
    error: 'Unable to verify rate limit, please try again',
  });
}
```

### Design Decision: What about the in-memory fallback?

The `auth.ts` `rateLimit()` middleware has a deliberate fallback path (lines 248-258): when Redis is unavailable, it falls back to in-memory rate limiting. This is **fine** -- the fallback itself enforces limits. The problem is only the `catch` block at lines 261-265 which lets requests through on unexpected errors.

The `checkRateLimit()` function in `redisRateLimiter.ts` line 84-87 (redis === null case) returns `allowed: true` because the caller (`auth.ts` line 226) checks `getRedis()` first and only calls `checkRateLimit` when Redis exists. So the null check at line 84 is a defensive guard that should also fail-closed.

### Risks
- **False denial risk:** If Redis goes down AND in-memory fallback has a bug, legitimate users get 429s. This is the correct security tradeoff -- temporary inconvenience beats bypassed rate limiting.
- **Check-in rate limiter uses PostgreSQL, not Redis.** If the DB is down, the entire app is down anyway, so fail-closed there has no additional user impact.

---

## BETA-08: Replace SOCIAL_AUTH_NO_PASSWORD Sentinel

### Current State

Social auth users get the **plaintext** string `$SOCIAL_AUTH$` stored directly in the `password_hash` column (no bcrypt hashing). This is a security problem because:

1. **It's a known, guessable value** -- anyone who reads this source code knows the sentinel
2. **It's stored plaintext** -- a DB leak reveals which accounts are social-only
3. **bcrypt.compare() with `$SOCIAL_AUTH$` will always return false** for any input (it's not a valid bcrypt hash), so social auth users can't brute-force login. But the plaintext value is still an information leak.
4. **PasswordResetService compares directly** (`user.password === SOCIAL_AUTH_NO_PASSWORD`) against the raw DB value

### Files
| File | Lines | What |
|------|-------|------|
| `/backend/src/services/SocialAuthService.ts` | 11 | `const SOCIAL_AUTH_NO_PASSWORD = '$SOCIAL_AUTH$';` |
| `/backend/src/services/SocialAuthService.ts` | 294 | Inserted as plaintext into `password_hash` column |
| `/backend/src/services/PasswordResetService.ts` | 10 | Duplicate sentinel constant |
| `/backend/src/services/PasswordResetService.ts` | 42 | Queries `SELECT id, password FROM users` (column name issue -- see below) |
| `/backend/src/services/PasswordResetService.ts` | 55 | Direct comparison: `user.password === SOCIAL_AUTH_NO_PASSWORD` |

### Pre-Existing Bug: Column Name Mismatch

**PasswordResetService line 42** queries `SELECT id, password FROM users` but the actual DB column is `password_hash` (confirmed in `database-schema.sql` line 19 and all other queries in UserService/SocialAuthService). This query would throw a PostgreSQL error at runtime. Either:
- This code path has never been tested against a real DB with a social auth user, OR
- The production DB was manually altered to rename the column

This should be fixed as part of BETA-08: change `password` to `password_hash` in the query.

### What Needs to Change

**Option A (recommended): Use `user_social_accounts` table instead of sentinel**

The `user_social_accounts` table already exists and tracks which users have social auth linked. Instead of checking a password sentinel, check whether the user has a social account:

```typescript
// In PasswordResetService.requestReset():
const socialResult = await this.db.query(
  'SELECT 1 FROM user_social_accounts WHERE user_id = $1 LIMIT 1',
  [user.id]
);
if (socialResult.rows.length > 0) {
  // This is a social auth user
  return { sent: false, message: 'This account uses Google/Apple Sign-In...' };
}
```

For the password_hash column itself, use a proper null or a random bcrypt hash:

```typescript
// In SocialAuthService.createSocialUser():
import crypto from 'crypto';
// Generate a random 64-char hex string, bcrypt-hash it
const randomPassword = crypto.randomBytes(32).toString('hex');
const hashedPlaceholder = await AuthUtils.hashPassword(randomPassword);
// Store hashedPlaceholder in password_hash column
```

This way:
- The password_hash column contains a valid bcrypt hash (looks identical to real passwords)
- No one can guess the random password
- Social auth detection uses the proper `user_social_accounts` table
- DB leaks don't reveal which accounts are social-only

**Option B (simpler): Hash the sentinel with bcrypt**

Keep the sentinel concept but bcrypt-hash it before storage. Less clean but fewer code changes.

### Risks
- **Data migration needed:** Existing users with `$SOCIAL_AUTH$` plaintext in `password_hash` need to be updated. Write a migration that: `UPDATE users SET password_hash = '<bcrypt-of-random>' WHERE password_hash = '$SOCIAL_AUTH$'`
- **PasswordResetService column name bug** must be fixed simultaneously or the social auth check will never work correctly

---

## BETA-09: Delete .bak/.backup Files

### Current State

Two backup files exist in the repository and are **tracked by git** (confirmed with `git ls-files`):

| File | Tracked | Content |
|------|---------|---------|
| `/backend/src/services/SocialAuthService.ts.bak` | YES | Old version with `const SOCIAL_AUTH_NO_PASSWORD = '$';` and empty password |
| `/backend/src/services/SocialAuthService.ts.backup` | YES | Old version with `$SOCIAL_AUTH$` sentinel but empty password at line 290 |

### Differences from Current Code
- `.bak` file line 11: sentinel is `'$'` (just a dollar sign, not `$SOCIAL_AUTH$`)
- `.bak` file line 290: `'', // No password for social auth users` (empty string)
- `.backup` file line 11: sentinel is `'$SOCIAL_AUTH$'` (same as current)
- `.backup` file line 290: `'', // No password for social auth users` (empty string)

These files contain source code (including auth logic) and should not be in the repository.

### .gitignore Status
Neither `.gitignore` file (root or backend) has patterns for `.bak`, `.backup`, or similar backup file extensions.

| Gitignore | Location | Has .bak/.backup pattern |
|-----------|----------|-------------------------|
| `/.gitignore` | Root | NO |
| `/backend/.gitignore` | Backend | NO |

### What Needs to Change

1. **Delete the files from git tracking:**
```bash
git rm backend/src/services/SocialAuthService.ts.bak
git rm backend/src/services/SocialAuthService.ts.backup
```

2. **Add patterns to root `.gitignore`:**
```gitignore
# Backup files
*.bak
*.backup
*.orig
*.old
```

3. **Full sweep for other backup files:** Already performed -- only two files found (excluding node_modules and build directories).

### Risks
- None. These are dead files with no imports or references.

---

## Cross-Cutting Concerns

### Dependency Map
```
BETA-05 (gitleaks)    -- independent
BETA-06 (CI branch)   -- independent
BETA-07 (rate limit)  -- independent
BETA-08 (sentinel)    -- depends on BETA-09 (delete .bak files that contain old sentinel code)
BETA-09 (.bak files)  -- independent, but should be done before or with BETA-08
```

### Execution Order Recommendation
All five can be done in a single plan. Suggested task order:
1. BETA-09 first (delete .bak files, update .gitignore)
2. BETA-08 (replace sentinel, fix column name bug, migration)
3. BETA-05 (gitleaks hook)
4. BETA-06 (CI branch fix)
5. BETA-07 (fail-closed rate limiting)

### Pre-Existing Bugs Discovered
1. **PasswordResetService column name:** `SELECT id, password FROM users` queries non-existent column `password`. Should be `password_hash`. (Lines 42, 55 of PasswordResetService.ts)
2. **CI duplicate build step:** Lines 29-34 of ci.yml run `npm run build` twice (once labeled "Run Lint", once labeled "Build")
3. **CI missing backend test step:** No `npm test` in CI pipeline

---

## Sources

### Primary (HIGH confidence)
All findings based on direct code inspection of the current codebase:
- `/backend/src/middleware/auth.ts` -- rate limiting middleware
- `/backend/src/utils/redisRateLimiter.ts` -- Redis rate limiter
- `/backend/src/middleware/checkinRateLimit.ts` -- check-in rate limiter
- `/backend/src/middleware/perUserRateLimit.ts` -- per-user rate limiter
- `/backend/src/services/SocialAuthService.ts` -- social auth sentinel
- `/backend/src/services/PasswordResetService.ts` -- password reset with sentinel check
- `/backend/src/services/UserService.ts` -- login authentication flow
- `/backend/src/utils/auth.ts` -- bcrypt helpers
- `/.github/workflows/ci.yml` -- CI configuration
- `/.git/hooks/` -- git hooks directory
- `/backend/database-schema.sql` -- DB schema (password_hash column)
- `/.gitignore` and `/backend/.gitignore` -- gitignore patterns

## Metadata

**Confidence breakdown:**
- BETA-05 (gitleaks): HIGH -- confirmed no hooks exist, approach is straightforward
- BETA-06 (CI branch): HIGH -- confirmed exact branch mismatch
- BETA-07 (rate limit): HIGH -- all three fail-open paths identified with exact line numbers
- BETA-08 (sentinel): HIGH -- plaintext sentinel confirmed, pre-existing column name bug found
- BETA-09 (.bak files): HIGH -- files confirmed tracked, gitignore gaps confirmed

**Research date:** 2026-03-01
**Valid until:** 2026-03-31 (code-inspection based, stable unless files change)
