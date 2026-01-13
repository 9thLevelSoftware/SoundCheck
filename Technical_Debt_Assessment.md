# SoundCheck - Stubs & Technical Debt Review

## Executive Summary
- Total stubs/TODOs: 8 (code-level TODOs) + 5 stubbed integrations
- Feature completion: ~70%
- Technical debt score: 58/100

## Incomplete Features

### Critical (Blocks production)
- None identified.

### High Priority (Important)
- Feature: Social auth backend verification (Google/Apple/Facebook)
  - Location: `mobile/lib/src/features/auth/data/social_auth_service.dart:19`, `mobile/lib/src/features/auth/presentation/login_screen.dart:136`
  - Status: Partially implemented (client obtains tokens, backend exchange missing)
  - Blocker: No backend verification/token exchange endpoints
  - ETA: 1-2 sprints

- Feature: Crash reporting (Sentry/Crashlytics)
  - Location: `mobile/lib/src/core/services/crash_reporting_service.dart`, `backend/src/utils/sentry.ts`
  - Status: Stubbed (disabled)
  - Blocker: Missing SDK dependency and DSN wiring
  - ETA: 1 sprint

- Feature: Analytics integration
  - Location: `mobile/lib/src/core/services/analytics_service.dart`
  - Status: Stubbed (no provider configured)
  - Blocker: No SDK dependency or token wiring
  - ETA: 1 sprint

- Feature: Distributed rate limiting and cache
  - Location: `backend/src/utils/redisRateLimiter.ts`, `backend/src/utils/cache.ts`
  - Status: In-memory only; Redis integration commented out
  - Blocker: Missing Redis client setup and environment config
  - ETA: 1 sprint

### Medium Priority (Nice to have)
- Feature: Notifications deep-link navigation
  - Location: `mobile/lib/src/features/notifications/presentation/notifications_screen.dart:204`
  - Status: TODO
  - Blocker: Routing targets not wired
  - ETA: 1 sprint

- Feature: Discover user search
  - Location: `mobile/lib/src/features/discover/presentation/providers/discover_providers.dart:81`
  - Status: TODO
  - Blocker: No backend endpoint for user search
  - ETA: 1-2 sprints

- Feature: Profile band navigation
  - Location: `mobile/lib/src/features/profile/presentation/profile_screen.dart:1111`
  - Status: TODO
  - Blocker: Route not available
  - ETA: 1 sprint

### Low Priority (Future work)
- Feature: Facebook sign-in
  - Location: `mobile/lib/src/features/auth/presentation/login_screen.dart:405`
  - Status: TODO
  - Blocker: Missing SDK and backend support
  - ETA: 2+ sprints

## TODO/FIXME Inventory
```
Location: mobile/lib/src/core/services/log_service.dart:32
Type: TODO
Description: Integrate Crashlytics/Sentry in logging path
Priority: Medium
Owner: Mobile

Location: mobile/lib/src/features/notifications/presentation/notifications_screen.dart:204
Type: TODO
Description: Navigate to relevant screens from notification taps
Priority: Medium
Owner: Mobile

Location: mobile/lib/src/features/discover/presentation/providers/discover_providers.dart:81
Type: TODO
Description: Implement user search when API endpoint is available
Priority: Medium
Owner: Backend/Mobile

Location: mobile/lib/src/features/auth/presentation/login_screen.dart:136
Type: TODO
Description: Send social auth credentials to backend for verification
Priority: High
Owner: Backend/Mobile

Location: mobile/lib/src/features/auth/presentation/login_screen.dart:175
Type: TODO
Description: Send social auth credentials to backend for verification
Priority: High
Owner: Backend/Mobile

Location: mobile/lib/src/features/auth/presentation/login_screen.dart:405
Type: TODO
Description: Implement Facebook Sign-In
Priority: Low
Owner: Mobile

Location: mobile/lib/src/features/profile/presentation/profile_screen.dart:1111
Type: TODO
Description: Navigate to band detail screen when route is available
Priority: Medium
Owner: Mobile

Location: mobile/lib/src/features/auth/data/social_auth_service.dart:19
Type: TODO
Description: Backend verification for Google idToken
Priority: High
Owner: Backend/Mobile

Location: mobile/lib/src/features/auth/data/social_auth_service.dart:51
Type: TODO
Description: Backend verification for Apple identityToken
Priority: High
Owner: Backend/Mobile
```

## Recommendations
- Quick wins: Wire notification deep links and profile navigation, add user search endpoint.
- Sprint items: Implement social auth verification, enable crash reporting and analytics, connect Redis rate limiting.
- Epic items: Consolidate monitoring/observability stack (Sentry + metrics + alerting).
