---
phase: "21"
plan: "02"
name: "Light Mode Color Audit + Icon Theme Definitions"
subsystem: mobile-ui
tags: [wcag-audit, light-mode, icon-theme, accessibility, contrast-ratios]
requirements: [UIUX-32, UIUX-33]
dependency_graph:
  requires: [21-01]
  provides: [light-mode-audit, icon-theme-sizing-complete]
  affects: [app_theme]
tech_stack:
  added: []
  patterns: [WCAG-2.1-relative-luminance, IconThemeData-inheritance]
key_files:
  created:
    - .planning/phases/21-theme-cleanup-light-mode-prep/LIGHT-MODE-AUDIT.md
  modified:
    - mobile/lib/src/core/theme/app_theme.dart
decisions:
  - Focus ring on input (4.50:1) classified as borderline/decorative rather than critical failure
  - Recommended darker color variants that preserve each color family (e.g., #D32F2F stays red, #0277BD stays blue)
  - voltLime/electricBlue not used directly in light theme ColorScheme but documented for future reference
metrics:
  duration: "3m 54s"
  completed: "2026-03-01"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 1
  files_created: 1
---

# Phase 21 Plan 02: Light Mode Color Audit + Icon Theme Definitions Summary

WCAG AA audit of 19 light theme color pairs found 10 failures (3 critical, 6 moderate, 1 borderline) with recommended fix hex values; added explicit `size: 24` to `IconThemeData` in both dark and light themes so `_NavItem` inherits icon size from theme instead of hardcoded fallback.

## Task Summary

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | WCAG AA audit of light theme color pairs | 17f4963 | Done |
| 2 | Add icon size to IconThemeData in both themes | 3259680 | Done |
| 3 | Verification (dart analyze + flutter build) | (no code changes) | Done |

## Changes Made

### Task 1: Light Mode Color Audit

Created `LIGHT-MODE-AUDIT.md` documenting contrast ratios for all 19 foreground/background pairs in the light theme:

**Passing pairs (9/19):**
- Body text `#0D0F11` on white/scaffold -- excellent (17-19:1)
- Secondary text `#6E7681` on white -- passes AA normal (4.59:1)
- White on primary green `#2E7D32` -- passes AA normal (5.13:1)
- Primary green on white -- passes AA normal (5.13:1)
- Chip text `#0D0F11` on `#F0F0F0` -- excellent (16.85:1)

**Failing pairs (10/19):**
- 3 critical: `#FFAB00` warning (1.90:1), `#00F0FF` info (1.41:1), `#D2FF00` voltLime (1.16:1) -- completely unusable on white
- 6 moderate: secondary blue buttons, error red text, alert orange, secondary text on scaffold -- pass AA large but fail AA normal
- 1 borderline: focus ring green on input fill (4.50:1) -- decorative element

**Verdict:** 7 fixes needed before enabling light mode. Recommended replacement hex values provided for each failure.

### Task 2: IconThemeData Size

- **Dark theme (line 453):** Added `size: 24` to existing `iconTheme: IconThemeData(color: textPrimary)`
- **Light theme (line 553):** Added new top-level `iconTheme: IconThemeData(color: Color(0xFF0D0F11), size: 24)`
- `_NavItem` in `scaffold_with_nav_bar.dart:178` now resolves `IconTheme.of(context).size` to `24` from theme instead of falling through to `?? 24` fallback

### Task 3: Verification

- `dart analyze` -- zero errors
- `flutter build apk --debug` -- builds successfully
- `LIGHT-MODE-AUDIT.md` exists with all 19 pairs audited, ratios computed, verdicts given
- `size: 24` confirmed in both dark (line 455) and light (line 555) theme `iconTheme` blocks
- Top-level `IconThemeData` confirmed in light theme (not just `appBarTheme`)
- `_NavItem` confirmed using `IconTheme.of(context).size` (scaffold_with_nav_bar.dart:178)

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Focus ring classification:** `#2E7D32` on `#F0F0F0` (4.50:1) classified as borderline/decorative since focus rings are non-text visual indicators, not readable content
2. **Color family preservation:** All recommended replacements stay within their original color family (red stays red, blue stays blue) to maintain visual intent
3. **voltLime/electricBlue scope:** Documented critical failures for semantic colors even though light theme `ColorScheme` doesn't reference them directly -- important for any widget code using `AppTheme.info` or `AppTheme.success`

## Self-Check: PASSED
