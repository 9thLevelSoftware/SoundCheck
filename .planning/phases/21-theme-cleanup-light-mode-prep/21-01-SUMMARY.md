---
phase: "21"
plan: "01"
name: "Color Alias Removal + Nav Fixes + Notification Badge"
subsystem: mobile-ui
tags: [theme-cleanup, color-aliases, navigation, notification-badge, accessibility-prep]
requirements: [UIUX-28, UIUX-29, UIUX-30, UIUX-31]
dependency_graph:
  requires: [phase-18]
  provides: [canonical-color-names, notification-badge, icon-theme-sizing]
  affects: [scaffold_with_nav_bar, app_theme, 21-feature-files]
tech_stack:
  added: []
  patterns: [Consumer-widget-for-localized-riverpod, Badge-widget, IconTheme-inheritance]
key_files:
  created: []
  modified:
    - mobile/lib/src/core/theme/app_theme.dart
    - mobile/lib/src/shared/widgets/scaffold_with_nav_bar.dart
    - mobile/lib/src/features/checkins/presentation/checkin_screen.dart
    - mobile/lib/src/features/discover/presentation/discover_screen.dart
    - mobile/lib/src/features/bands/presentation/band_detail_screen.dart
    - mobile/lib/src/features/profile/presentation/profile_screen.dart
    - mobile/lib/src/features/venues/presentation/venue_detail_screen.dart
    - mobile/lib/src/features/feed/presentation/feed_screen.dart
    - mobile/lib/src/features/search/presentation/discover_users_screen.dart
    - mobile/lib/src/features/checkins/presentation/rating_bottom_sheet.dart
    - mobile/lib/src/features/verification/presentation/claim_submission_screen.dart
    - mobile/lib/src/features/checkins/presentation/photo_upload_sheet.dart
    - mobile/lib/src/features/feed/presentation/widgets/feed_card.dart
    - mobile/lib/src/features/search/presentation/search_screen.dart
    - mobile/lib/src/features/feed/presentation/widgets/new_checkins_banner.dart
    - mobile/lib/src/features/verification/presentation/my_claims_screen.dart
    - mobile/lib/src/shared/widgets/empty_state_widget.dart
    - mobile/lib/src/features/feed/presentation/widgets/happening_now_card.dart
    - mobile/lib/src/features/badges/presentation/badge_collection_screen.dart
    - mobile/lib/src/features/reporting/presentation/widgets/report_bottom_sheet.dart
    - mobile/lib/src/features/verification/presentation/widgets/owner_response_bottom_sheet.dart
decisions:
  - Used Consumer widget instead of converting _CustomBottomNavBar to ConsumerWidget (minimal change surface)
  - Used IconTheme.of(context).size for icon sizing prep (UIUX-33 forward-compatibility)
  - Used asData?.value instead of valueOrNull for Riverpod 3.x compatibility
metrics:
  duration: "8m 10s"
  completed: "2026-03-01"
  tasks_completed: 4
  tasks_total: 4
  files_modified: 21
---

# Phase 21 Plan 01: Color Alias Removal + Nav Fixes + Notification Badge Summary

Removed 3 misleading legacy color aliases (electricPurple/liveGreen/neonPink) across 21 files, renamed "Alerts" to "Notifications" per Jakob's Law, and added unread notification count badge using Consumer widget + Badge widget with IconTheme-inherited sizing.

## Task Summary

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Remove legacy color aliases (electricPurple, liveGreen, neonPink) | f87cc18 | Done |
| 2 | Rename "Alerts" to "Notifications" | c130a5e | Done |
| 3 | Add notification badge to _NavItem | fe334aa | Done |
| 4 | Verification | (no code changes) | Done |

## Changes Made

### Task 1: Legacy Color Alias Removal
- Replaced `AppTheme.electricPurple` with `AppTheme.voltLime` across 17 files (154 refs)
- Replaced `AppTheme.liveGreen` with `AppTheme.voltLime` across 11 files (23 refs)
- Replaced `AppTheme.neonPink` with `AppTheme.hotOrange` across 9 files (37 refs)
- Removed 5 alias definitions from `app_theme.dart` (electricPurple, electricPurpleLight, electricPurpleDark, neonPink, liveGreen)
- Total: 214 alias references replaced, 21 unique files modified

### Task 2: Nav Label Rename
- Changed `label: 'Alerts'` to `label: 'Notifications'` in `scaffold_with_nav_bar.dart`
- Semantics label and Tooltip message derive from label automatically

### Task 3: Notification Badge
- Added `badgeCount` parameter to `_NavItem` widget (default 0)
- Replaced `Icon` with `Builder` + `Badge` widget that shows when `badgeCount > 0`
- Badge displays `hotOrange` background with white bold count text (capped at "99+")
- Wrapped Notifications `_NavItem` in `Consumer` to access `unreadNotificationCountProvider`
- Used `IconTheme.of(context).size ?? 24` for icon sizing (forward-compatible with UIUX-33)
- Added Riverpod + notification provider imports

### Task 4: Verification
- `dart analyze` -- zero errors on all changed files
- `flutter build apk --debug` -- builds successfully
- Grep confirms zero legacy alias references in `mobile/lib/src/`
- Grep confirms zero `'Alerts'` references
- Badge widget, unreadNotificationCountProvider, and IconTheme.of(context) all present

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AsyncValue API: valueOrNull -> asData?.value**
- **Found during:** Task 3
- **Issue:** Plan specified `unreadCount.valueOrNull ?? 0` but Riverpod 3.x's AsyncValue does not have a `valueOrNull` getter; `dart analyze` reported `undefined_getter`
- **Fix:** Changed to `unreadCount.asData?.value ?? 0` which matches the pattern used throughout the codebase
- **Files modified:** `scaffold_with_nav_bar.dart`
- **Commit:** fe334aa (amended)

## Decisions Made

1. **Consumer vs ConsumerWidget**: Used `Consumer` widget wrapper instead of converting `_CustomBottomNavBar` to `ConsumerWidget` -- minimizes change surface and keeps other nav items as plain widgets
2. **IconTheme inheritance**: Used `IconTheme.of(context).size ?? 24` instead of hardcoded `size: 24` -- preps for UIUX-33 (Plan 21-02) which will add IconThemeData size values to theme definitions
3. **Riverpod API pattern**: Used `asData?.value ?? 0` matching existing codebase conventions instead of plan's `valueOrNull`

## Self-Check: PASSED

- All key files exist (app_theme.dart, scaffold_with_nav_bar.dart)
- All commits found (f87cc18, c130a5e, fe334aa)
- Zero legacy alias references remaining
- Zero 'Alerts' references remaining
- Build passes, dart analyze clean
