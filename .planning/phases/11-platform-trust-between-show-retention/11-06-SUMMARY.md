---
phase: 11-platform-trust-between-show-retention
plan: 06
subsystem: mobile-ui
tags: [verification, claims, badge, venue-detail, band-detail, flutter, riverpod, go-router]

# Dependency graph
requires:
  - phase: 11-platform-trust-between-show-retention
    plan: 04
    provides: ClaimService with submit/list endpoints (POST /api/claims, GET /api/claims/me), claimed_by_user_id on venue/band entities
provides:
  - ClaimRepository with submitClaim and getMyClaims API calls
  - ClaimSubmissionScreen with evidence text/URL form fields
  - MyClaimsScreen with status badges (pending/approved/denied) and pull-to-refresh
  - Verification badge on venue/band detail screens when claimedByUserId is set
  - "Claim this venue/band" buttons on unclaimed profiles navigating to claim form
  - Routes: /claim/:entityType/:entityId and /profile/settings/my-claims
  - My Claims entry in settings screen
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [claim repository DioClient pattern, manual Riverpod claim providers, dual-badge pattern (claimed vs organic verified)]

key-files:
  created:
    - mobile/lib/src/features/verification/data/claim_repository.dart
    - mobile/lib/src/features/verification/presentation/providers/claim_providers.dart
    - mobile/lib/src/features/verification/presentation/claim_submission_screen.dart
    - mobile/lib/src/features/verification/presentation/my_claims_screen.dart
  modified:
    - mobile/lib/src/core/router/app_router.dart
    - mobile/lib/src/features/profile/presentation/settings_screen.dart
    - mobile/lib/src/features/venues/domain/venue.dart
    - mobile/lib/src/features/bands/domain/band.dart
    - mobile/lib/src/features/venues/presentation/venue_detail_screen.dart
    - mobile/lib/src/features/bands/presentation/band_detail_screen.dart

key-decisions:
  - "ClaimRepository uses DioClient pattern (not raw Dio) consistent with all other repositories"
  - "Manual Riverpod providers (not @riverpod codegen) for claim feature per Phase 10 decision [10-05]"
  - "Claimed-owner badge (primary color) takes precedence over organic isVerified badge (info color) on venue detail"
  - "VerificationClaim.fromJson supports both camelCase and snake_case field names for backend compatibility"

patterns-established:
  - "Verification feature directory: features/verification/{data,presentation/providers} matching reporting/blocking pattern"
  - "Dual badge precedence: claimedByUserId badge shown instead of isVerified when both could apply"
  - "Claim route: /claim/:entityType/:entityId with ?name= query param for display"

requirements-completed: [VERIFY-01, VERIFY-02, VERIFY-04, VERIFY-05, VERIFY-06]

# Metrics
duration: 8min
completed: 2026-02-28
---

# Phase 11 Plan 06: Mobile Verification UI Summary

**Claim submission form with evidence fields, claims status screen with status badges, and verified-owner badge on venue/band detail screens**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-28T15:46:34Z
- **Completed:** 2026-02-28T15:54:39Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Built complete ClaimRepository with submitClaim (POST /claims) and getMyClaims (GET /claims/me) following DioClient pattern
- Created ClaimSubmissionScreen with evidence text + URL fields, loading state, and success/error SnackBars
- Created MyClaimsScreen with status badges (pending=amber, approved=green, denied=red), pull-to-refresh, and denied review notes
- Added claimedByUserId field to Venue and Band Freezed models with build_runner regeneration
- Added claimed-owner verification badge on venue/band detail screens with claim buttons for unclaimed entities
- Registered claim submission route and my-claims settings route in GoRouter
- Added "My Claims" entry in settings screen alongside existing "Blocked Users"

## Task Commits

Each task was committed atomically:

1. **Task 1: Build claim repository, providers, and submission screen** - `b069cbd` (feat)
2. **Task 2: Add verification badges and claim buttons to venue/band detail screens** - `96acf2e` (feat)

## Files Created/Modified
- `mobile/lib/src/features/verification/data/claim_repository.dart` - ClaimRepository + VerificationClaim model with dual-case JSON parsing
- `mobile/lib/src/features/verification/presentation/providers/claim_providers.dart` - Manual Riverpod providers for claim repo and my-claims
- `mobile/lib/src/features/verification/presentation/claim_submission_screen.dart` - Full-screen claim form with evidence text/URL, loading state, error handling
- `mobile/lib/src/features/verification/presentation/my_claims_screen.dart` - Claims list with status badges, pull-to-refresh, empty state, denied notes
- `mobile/lib/src/core/router/app_router.dart` - Added /claim/:entityType/:entityId route and /profile/settings/my-claims route
- `mobile/lib/src/features/profile/presentation/settings_screen.dart` - Added "My Claims" settings tile
- `mobile/lib/src/features/venues/domain/venue.dart` - Added claimedByUserId field to Venue Freezed model
- `mobile/lib/src/features/bands/domain/band.dart` - Added claimedByUserId field to Band Freezed model
- `mobile/lib/src/features/venues/presentation/venue_detail_screen.dart` - Claimed-owner badge + "Claim this venue" button
- `mobile/lib/src/features/bands/presentation/band_detail_screen.dart` - Verified icon badge + "Claim this band" button

## Decisions Made
- ClaimRepository uses DioClient pattern consistent with ReportRepository and all other mobile repositories
- Manual Riverpod providers per Phase 10 decision [10-05], matching block_providers and report_providers patterns
- Claimed-owner badge takes precedence over organic isVerified badge -- if claimedByUserId is set, show "Claimed" badge; else fall back to original "Verified" badge
- VerificationClaim.fromJson handles both camelCase (entityType) and snake_case (entity_type) keys for robustness against backend response format variations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Mobile verification UI complete: claim submission, status tracking, verification badges
- All backend API endpoints from Plan 04 are now consumed by mobile clients
- Phase 11 (Platform Trust & Between-Show Retention) fully implemented across all 6 plans
- Flutter analyzes cleanly with zero errors

## Self-Check: PASSED

All 4 created files verified present. Both task commits (b069cbd, 96acf2e) verified in git log. Line counts: claim_repository.dart (90), claim_submission_screen.dart (250), my_claims_screen.dart (252), claim_providers.dart (28) -- all meet plan minimums.

---
*Phase: 11-platform-trust-between-show-retention*
*Completed: 2026-02-28*
