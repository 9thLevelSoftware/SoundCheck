---
phase: "17"
plan: "02"
subsystem: mobile
tags: [user-discovery, global-feed, share-cta, revenuecat, search, social-graph]
dependency_graph:
  requires: [plan-17-01]
  provides: [user-search-ui, discover-users-screen, global-feed-tab, share-cta-elevation, revenuecat-v9]
  affects: [search_providers, search_screen, feed_screen, feed_providers, feed_repository, celebration_screen, share_card_preview, subscription_service, premium_paywall_sheet, pro_feature_screen, app_router]
tech_stack:
  added: []
  patterns: [cursor-pagination-notifier, follow-toggle-local-state, PurchaseParams.package, CustomerInfo-null-pattern]
key_files:
  created:
    - mobile/lib/src/features/search/data/discovery_providers.dart
    - mobile/lib/src/features/search/presentation/discover_users_screen.dart
  modified:
    - mobile/lib/src/features/search/data/search_providers.dart
    - mobile/lib/src/features/search/presentation/search_screen.dart
    - mobile/lib/src/core/router/app_router.dart
    - mobile/lib/src/features/feed/data/feed_repository.dart
    - mobile/lib/src/features/feed/presentation/providers/feed_providers.dart
    - mobile/lib/src/features/feed/presentation/feed_screen.dart
    - mobile/lib/src/features/sharing/presentation/celebration_screen.dart
    - mobile/lib/src/features/sharing/presentation/share_card_preview.dart
    - mobile/lib/src/features/subscription/presentation/subscription_service.dart
    - mobile/lib/src/features/subscription/presentation/widgets/premium_paywall_sheet.dart
    - mobile/lib/src/features/subscription/presentation/pro_feature_screen.dart
decisions:
  - Riverpod codegen names GlobalFeedNotifier as globalFeedProvider (not globalFeedNotifierProvider)
  - Follow toggle uses local state Set<String> rather than server-synced provider for responsiveness
  - PurchaseParams.package() named constructor required by RevenueCat v9.12+ (unnamed constructor removed)
  - CustomerInfo null return pattern for purchase cancellation vs PlatformException for real errors
metrics:
  duration: "11 min"
  completed: "2026-03-01"
  tasks: 8
  files: 13
---

# Phase 17 Plan 02: Mobile -- Discovery UI + Global Feed + Share CTA + RevenueCat Summary

Mobile user search/discovery with follow buttons, global Discover feed tab, share CTA elevated to primary position on celebration screen, and RevenueCat API modernized to v9 PurchaseParams with CustomerInfo return types.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add Users to search providers + model | d795c2a | search_providers.dart |
| 2 | Add Users filter chip + results to SearchScreen | fd98cc7 | search_screen.dart |
| 3 | Create user suggestions screen + provider | 7c7ee5a | discovery_providers.dart (NEW), discover_users_screen.dart (NEW), app_router.dart |
| 4 | Add Discover/Global feed tab to FeedScreen | 1ea32b3 | feed_repository.dart, feed_providers.dart, feed_screen.dart |
| 5 | Elevate share CTA on CelebrationScreen | faec8bf | celebration_screen.dart |
| 6 | Enhance ShareCardPreview for primary prominence | 4b6e273 | share_card_preview.dart |
| 7 | Modernize RevenueCat API (BETA-28) | e051e0f | subscription_service.dart |
| 8 | Update purchase UI callers for new return types | 7ba6c82 | premium_paywall_sheet.dart, pro_feature_screen.dart |

## Decisions Made

1. **Riverpod codegen naming**: `GlobalFeedNotifier` class generates as `globalFeedProvider` (not `globalFeedNotifierProvider`) -- Riverpod convention strips "Notifier" suffix from generated provider names.

2. **Follow toggle local state**: `DiscoverUsersScreen` manages followed IDs in a local `Set<String>` for immediate UI response. This is sufficient for a suggestion-browsing use case without needing a full provider.

3. **PurchaseParams.package() constructor**: RevenueCat v9.12+ removes the unnamed `PurchaseParams()` constructor in favor of named constructors (`PurchaseParams.package()`, `.storeProduct()`, `.subscriptionOption()`).

4. **CustomerInfo null pattern**: `purchase()` returns `CustomerInfo?` -- null means user cancelled (silent), non-null means check entitlements, and `PlatformException` means real error (show snackbar). This replaces the previous bool return that swallowed both cancellations and errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Riverpod provider naming**
- **Found during:** Task 4 verification (dart analyze)
- **Issue:** Used `globalFeedNotifierProvider` but Riverpod codegen produces `globalFeedProvider`
- **Fix:** Replaced all 4 references in feed_screen.dart
- **Commit:** 0d2cdae

**2. [Rule 1 - Bug] Fixed RevenueCat PurchaseParams constructor**
- **Found during:** Task 7 verification (dart analyze)
- **Issue:** `PurchaseParams(package: package)` -- unnamed constructor doesn't exist in v9.12+
- **Fix:** Changed to `PurchaseParams.package(package)` named constructor
- **Commit:** 0d2cdae

## Verification

- `dart analyze` on all 13 modified files: 0 errors (20 pre-existing info-level lints only)
- `dart run build_runner build --delete-conflicting-outputs`: generated .g.dart files for new providers (28 outputs)
- All 8 tasks + 1 fix committed individually with conventional commit format
- Pre-existing test errors (totalCheckins parameter) are in test files, not caused by our changes

## Self-Check: PASSED

- All 13 source files: FOUND
- All 9 commits: FOUND (d795c2a, fd98cc7, 7c7ee5a, 1ea32b3, faec8bf, 4b6e273, e051e0f, 7ba6c82, 0d2cdae)
