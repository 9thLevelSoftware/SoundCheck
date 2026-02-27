---
phase: "08"
plan: "02"
subsystem: "compliance"
tags: ["app-store", "account-deletion", "privacy-manifest", "gdpr", "flutter-pin", "demo-account"]
dependencies:
  requires:
    - "01-01 (database schema with deletion_requests table)"
    - "01-03 (DataRetentionService, UserController)"
    - "06-02 (SettingsScreen, profile_providers)"
  provides:
    - "Account deletion API routes wired to DataRetentionService"
    - "Delete Account UI in SettingsScreen with 30-day grace period dialog"
    - "PrivacyInfo.xcprivacy with Required Reason API declarations"
    - "Flutter version pin via .fvmrc (3.27.4)"
    - "Demo account seed script (demo@soundcheck.app)"
  affects:
    - "App Store submission (all compliance requirements met)"
    - "Future: cancel-deletion flow on login"
tech-stack:
  added: []
  patterns:
    - "DataRetentionService route wiring (expose existing GDPR service)"
    - "Idempotent seed script with ON CONFLICT clauses"
    - "iOS privacy manifest with Required Reason API declarations"
key-files:
  created:
    - "mobile/lib/src/features/profile/data/account_repository.dart"
    - "mobile/ios/Runner/PrivacyInfo.xcprivacy"
    - "mobile/.fvmrc"
    - "backend/src/scripts/seed-demo.ts"
  modified:
    - "backend/src/routes/userRoutes.ts"
    - "mobile/lib/src/features/profile/presentation/settings_screen.dart"
    - "mobile/lib/src/features/profile/presentation/providers/profile_providers.dart"
    - "mobile/ios/Runner.xcodeproj/project.pbxproj"
    - "backend/package.json"
decisions:
  - id: "08-02-D1"
    decision: "Wire DataRetentionService to three new routes (request, cancel, status) rather than modifying existing DELETE /me"
    rationale: "Existing DELETE /me does deactivation only; new routes use proper GDPR-compliant deletion with 30-day grace period"
  - id: "08-02-D2"
    decision: "Pin Flutter to 3.27.4 via .fvmrc without installing FVM"
    rationale: "Documents minimum safe version; avoids 3.24.3/3.24.4 App Store rejection bug; developer installs FVM separately"
  - id: "08-02-D3"
    decision: "Use is_demo column flag instead of code-level deletion protection for demo account"
    rationale: "Simple, queryable guard; future middleware can check is_demo to prevent deletion during review"
metrics:
  duration: "8m 33s"
  completed: "2026-02-03"
---

# Phase 8 Plan 02: App Store Compliance Summary

**One-liner:** Account deletion flow wired to DataRetentionService with 30-day grace period UI, PrivacyInfo.xcprivacy with 7 collected data types and 3 Required Reason APIs, Flutter pinned to 3.27.4, and idempotent demo account seed script.

## Performance

| Metric | Value |
|--------|-------|
| Duration | 8m 33s |
| Start | 2026-02-03T22:37:42Z |
| End | 2026-02-03T22:46:15Z |
| Tasks | 3/3 |
| Files created | 4 |
| Files modified | 5 |

## Accomplishments

### Task 1: Account Deletion API Routes and Mobile UI
- Added three authenticated routes to userRoutes.ts: `POST /me/delete-account`, `POST /me/cancel-deletion`, `GET /me/deletion-status`
- Routes wire directly to the existing DataRetentionService (30-day grace period, account deactivation, GDPR-compliant anonymization)
- Error handling returns 400 for user-facing errors (not found, duplicate request, no pending request)
- Created AccountRepository in mobile with requestAccountDeletion() and cancelDeletion() methods
- Added "Delete Account" tile in SettingsScreen Account section with red delete icon
- Confirmation dialog explains 30-day grace period and permanent deletion consequences
- On confirmation: calls API, logs out user, navigates to /login
- Added accountRepositoryProvider to profile_providers (keepAlive for stateless wrapper)

### Task 2: iOS Privacy Manifest and Flutter Version Pin
- Created PrivacyInfo.xcprivacy declaring:
  - NSPrivacyTracking: false (no tracking)
  - 7 collected data types: PreciseLocation, PhotosOrVideos, CrashData, PerformanceData, EmailAddress, Name, UserID
  - 3 Required Reason APIs: UserDefaults (CA92.1), SystemBootTime (35F9.1), FileTimestamp (C617.1)
- Registered file in project.pbxproj across all 4 required sections (PBXBuildFile, PBXFileReference, PBXGroup, PBXResourcesBuildPhase)
- Created .fvmrc pinning Flutter to 3.27.4 (safe minimum above 3.24.3/3.24.4 rejection bug)

### Task 3: Demo Account Seed Script
- Created idempotent seed-demo.ts with ON CONFLICT clauses throughout
- Demo user: demo@soundcheck.app / SoundCheck2026! with bcrypt hash (12 rounds, matching AuthUtils)
- Seeds 10 events (7 past, 3 upcoming) across existing venues with multi-band lineups
- Creates 7 check-ins with mix of verified/unverified location and venue ratings
- Creates 6 band ratings (3.0-5.0 range) and 3 follow relationships
- Awards up to 3 badges (first_show, genre_explorer, venue_collector) if they exist
- Adds is_demo BOOLEAN column guard for optional demo account protection
- Added `npm run seed:demo` script to package.json

## Task Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | c0c6e60 | feat(08-02): account deletion API routes and mobile UI |
| 2 | 1d74009 | feat(08-02): iOS privacy manifest and Flutter version pin |
| 3 | 2ec3916 | feat(08-02): demo account seed script for App Store review |

## Files Created

| File | Purpose |
|------|---------|
| mobile/lib/src/features/profile/data/account_repository.dart | Account deletion API client |
| mobile/ios/Runner/PrivacyInfo.xcprivacy | iOS privacy manifest with Required Reason API declarations |
| mobile/.fvmrc | Flutter version pin (3.27.4) |
| backend/src/scripts/seed-demo.ts | Demo account seed script for App Store review |

## Files Modified

| File | Changes |
|------|---------|
| backend/src/routes/userRoutes.ts | Added 3 account deletion routes, DataRetentionService import |
| mobile/lib/src/features/profile/presentation/settings_screen.dart | Added Delete Account tile and confirmation dialog |
| mobile/lib/src/features/profile/presentation/providers/profile_providers.dart | Added accountRepositoryProvider |
| mobile/ios/Runner.xcodeproj/project.pbxproj | Registered PrivacyInfo.xcprivacy in 4 Xcode project sections |
| backend/package.json | Added seed:demo npm script |

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 08-02-D1 | Wire DataRetentionService to new routes, keep existing DELETE /me | Existing route does deactivation only; new routes use proper GDPR deletion |
| 08-02-D2 | Pin Flutter 3.27.4 via .fvmrc without FVM install | Documents minimum safe version; developer installs FVM separately |
| 08-02-D3 | Use is_demo column flag for demo account protection | Simple, queryable guard; future middleware can check before deletion |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

- build_runner regeneration of .g.dart file succeeded but the file is gitignored; this is expected behavior since generated code is excluded from version control
- Pre-existing uncommitted changes in feed/ directory from Plan 08-01 were present; carefully staged only Task 1/2/3 files to avoid including them

## Next Phase Readiness

**App Store Submission Readiness:**
- Account deletion: READY (Settings > Delete Account > 30-day grace dialog > API > DataRetentionService > logout)
- Privacy manifest: READY (PrivacyInfo.xcprivacy in bundle with all required declarations)
- Flutter version: READY (pinned to 3.27.4, safe from 3.24.x rejection)
- Demo account: READY (run `npm run seed:demo` before submission, credentials for App Review Notes)

**Remaining for Submission:**
- Run `npm run seed:demo` against production database before submission
- Include demo credentials in App Store Review Notes
- Test full deletion flow end-to-end against real backend
- Run `pod update` to ensure all SDK privacy manifests are current
- Upload to TestFlight to verify Apple does not flag missing privacy declarations
