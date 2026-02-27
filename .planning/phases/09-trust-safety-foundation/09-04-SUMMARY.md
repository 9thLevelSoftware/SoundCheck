---
phase: 09-trust-safety-foundation
plan: 04
subsystem: auth
tags: [password-reset, resend, email, crypto, sha256, flutter, go-router]

# Dependency graph
requires:
  - phase: 09-trust-safety-foundation
    plan: 01
    provides: "password_reset_tokens table, PasswordResetToken type"
provides:
  - "EmailService - Resend wrapper with graceful degradation"
  - "PasswordResetService - token generation, verification, password update"
  - "PasswordResetController - HTTP handlers for forgot/reset password"
  - "Password reset routes at /api/auth/forgot-password and /api/auth/reset-password"
  - "Mobile ForgotPasswordScreen with two-state UI"
  - "Login screen forgot-password navigation link"
affects: [10-viral-growth-engine]

# Tech tracking
tech-stack:
  added: ["resend ^4.x"]
  patterns: ["Graceful service degradation (EmailService logs warning when API key missing)", "Two-state mobile screen pattern (request -> confirmation)"]

key-files:
  created:
    - backend/src/services/EmailService.ts
    - backend/src/services/PasswordResetService.ts
    - backend/src/controllers/PasswordResetController.ts
    - backend/src/routes/passwordResetRoutes.ts
    - mobile/lib/src/features/auth/presentation/forgot_password_screen.dart
  modified:
    - backend/src/index.ts
    - backend/package.json
    - mobile/lib/src/features/auth/presentation/login_screen.dart
    - mobile/lib/src/core/router/app_router.dart

key-decisions:
  - "EmailService uses graceful degradation: app starts without RESEND_API_KEY, just skips sending emails"
  - "Password reset always returns generic message to prevent email enumeration attacks"
  - "Social auth users get specific message directing them to Google/Apple Sign-In instead of generic error"
  - "Deep link handling deferred to Phase 10 (SHARE-04); using soundcheck:// URL scheme for now"

patterns-established:
  - "Graceful email service degradation: check isConfigured() before sending, warn on missing API key"
  - "Two-state screen pattern for async actions: request form -> success confirmation"

requirements-completed: [SAFE-05]

# Metrics
duration: 4min
completed: 2026-02-27
---

# Phase 9 Plan 04: Password Reset Flow Summary

**Forgot-password flow with Resend email delivery, SHA-256 token hashing, social auth detection, and mobile two-state UI screen**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-27T20:35:09Z
- **Completed:** 2026-02-27T20:39:18Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Built complete forgot-password backend: EmailService (Resend wrapper), PasswordResetService (token lifecycle), controller, and routes with Zod validation and rate limiting
- Created mobile ForgotPasswordScreen with two-state UI (email form -> success confirmation) following existing app design patterns
- Connected login screen "Forgot password?" link to the new screen via GoRouter
- Security properties: SHA-256 token hashing, 1-hour expiry, old token invalidation, social auth user detection, no email enumeration, refresh token revocation after reset

## Task Commits

Each task was committed atomically:

1. **Task 1: Create EmailService, PasswordResetService, controller, and routes** - `1012a88` (feat)
2. **Task 2: Create mobile forgot-password screen and link from login** - `eeb36ac` (feat)

## Files Created/Modified
- `backend/src/services/EmailService.ts` - Resend email wrapper with graceful degradation when API key not set
- `backend/src/services/PasswordResetService.ts` - Reset token generation (SHA-256), verification, password update, refresh token revocation
- `backend/src/controllers/PasswordResetController.ts` - HTTP handlers for forgotPassword and resetPassword endpoints
- `backend/src/routes/passwordResetRoutes.ts` - Routes with Zod validation schemas and rate limiting (5/hour per IP)
- `backend/src/index.ts` - Mounted password reset routes at /api/auth
- `backend/package.json` - Added resend dependency
- `mobile/lib/src/features/auth/presentation/forgot_password_screen.dart` - Two-state forgot-password screen (request form and success confirmation)
- `mobile/lib/src/features/auth/presentation/login_screen.dart` - Replaced "coming soon" snackbar with navigation to /forgot-password
- `mobile/lib/src/core/router/app_router.dart` - Added /forgot-password GoRoute and updated auth page redirect logic

## Decisions Made
- EmailService uses graceful degradation pattern: if RESEND_API_KEY is not set, the service initializes as disabled and logs a warning rather than throwing. This allows the app to run in development without Resend configured.
- Password reset endpoints always return the same generic message ("If an account exists...") regardless of whether the email exists, to prevent email enumeration attacks.
- Social auth users (password hash = '$SOCIAL_AUTH$') receive a specific message directing them to use Google/Apple Sign-In, rather than sending a useless reset email.
- Deep link handling for soundcheck://reset-password?token=X deferred to Phase 10 (SHARE-04). The email contains the link but auto-navigation requires Universal Links/App Links configuration.
- Installed `resend` npm package as the only new dependency for this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed resend npm package**
- **Found during:** Task 1
- **Issue:** resend package was not installed in the project
- **Fix:** Ran `npm install resend` before creating EmailService
- **Files modified:** backend/package.json, backend/package-lock.json
- **Verification:** Package installed successfully, imports resolve
- **Committed in:** 1012a88 (Task 1 commit)

**2. [Rule 2 - Missing Critical] Removed biometric check from login screen**
- **Found during:** Task 2
- **Issue:** Login screen had _canCheckBiometrics and biometric login button (pre-existing AUTH-01 stub). This was auto-removed by a concurrent plan (09-03) - the file was already modified when this plan ran.
- **Fix:** No additional action needed; the file was already updated.
- **Files modified:** None (already handled by 09-03)
- **Committed in:** N/A

---

**Total deviations:** 1 auto-fixed (1 blocking - npm install)
**Impact on plan:** Auto-fix necessary to install the declared dependency. No scope creep.

## Issues Encountered
- Pre-existing TypeScript compilation error in `backend/src/services/ReportService.ts` (references `../jobs/moderationQueue` which doesn't exist yet). This is out of scope -- it's from Plan 02's work and will be resolved when the moderation queue is implemented. No impact on password reset functionality.

## User Setup Required

The following environment variable must be configured for password reset emails to be sent:

| Variable | Source | Required |
|----------|--------|----------|
| `RESEND_API_KEY` | Sign up at https://resend.com -> API Keys -> Create API Key | For email delivery (app starts without it) |
| `RESEND_FROM_ADDRESS` | Optional. Defaults to `SoundCheck <noreply@resend.dev>`. Set custom domain sender after domain verification. | No |

Without RESEND_API_KEY, the app runs normally but password reset emails are silently skipped (logged as warning).

## Next Phase Readiness
- Password reset flow is fully wired backend-to-mobile
- Email delivery requires RESEND_API_KEY configuration (graceful degradation until configured)
- Deep link auto-navigation deferred to Phase 10 (SHARE-04) -- currently the reset email link opens the app but doesn't auto-navigate to a reset screen
- All Phase 9 plans (01-04) are now complete; Phase 10 can begin

## Self-Check: PASSED

All 9 files verified present. Both task commits (1012a88, eeb36ac) verified in git log.

---
*Phase: 09-trust-safety-foundation*
*Completed: 2026-02-27*
