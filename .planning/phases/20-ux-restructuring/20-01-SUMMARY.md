---
phase: "20"
plan: "01"
subsystem: mobile-feed
tags: [ux-restructuring, tab-consolidation, feed, choicechip]
dependency_graph:
  requires: []
  provides: [merged-events-tab, live-dot-indicator]
  affects: [feed-screen]
tech_stack:
  added: []
  patterns: [ChoiceChip-filter-row, live-dot-indicator, merged-tab-pattern]
key_files:
  modified:
    - mobile/lib/src/features/feed/presentation/feed_screen.dart
decisions:
  - "Merged Happening Now into Events tab rather than removing it entirely -- preserves FOMO urgency via ChoiceChip filter"
  - "Combined badge count (event + happeningNow) on Events tab -- single attention signal instead of split"
  - "Live green dot shows only when count == 0 but happeningNow > 0 -- avoids double indicator when badge already visible"
metrics:
  duration: "109s"
  completed: "2026-03-01"
  tasks: 5
  files: 1
---

# Phase 20 Plan 01: Feed Tab Consolidation Summary

Feed reduced from 4 tabs to 3 (Discover, Friends, Events) by merging Happening Now into Events tab with ChoiceChip filter row and live-dot badge indicator.

## Changes Made

### Task 1: TabController 4 to 3
- Changed `TabController(length: 4)` to `TabController(length: 3)` in `_FeedScreenState.initState()`

### Task 2: Merged Tab Labels and Badges
- Events tab badge now shows combined count: `(event ?? 0) + (happeningNow ?? 0)`
- Added `showLiveDot: (happeningNow ?? 0) > 0` parameter to Events tab badge
- Removed standalone "Happening Now" tab entry

### Task 3: TabBarView Children
- Replaced 4 children with 3: `_GlobalFeedTab`, `_FriendsTab`, `_MergedEventsTab`
- Removed `_EventsTab()` and `_HappeningNowTab()` instantiations

### Task 4: _markTabRead for 3-Tab Layout
- Tab index 1 (Friends) marks `'friends'` as read
- Tab index 2 (Events) marks both `'event'` and `'happening_now'` as read
- Removed old array-based index mapping approach

### Task 5: _MergedEventsTab Widget + _TabWithBadge Live Dot
- Added `showLiveDot` parameter to `_TabWithBadge` -- shows 8px green (`liveGreen`) circle when `showLiveDot && count == 0`
- Created `_EventsFilter` enum (`events`, `happeningNow`)
- Created `_MergedEventsTab` as `ConsumerStatefulWidget` with ChoiceChip filter row
- Events chip: solid when selected (`electricPurple`), dark when not (`surfaceVariantDark`)
- Happening Now chip: includes 6px green dot when not selected, label text "Happening Now"
- Content area switches between `_buildEventsContent()` and `_buildHappeningNowContent()`
- Deleted old `_EventsTab` and `_HappeningNowTab` classes entirely

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- `dart analyze` -- no issues found
- `TabController(length: 3)` -- confirmed
- `_HappeningNowTab` -- 0 matches (class deleted)
- `_EventsTab` -- 0 matches (class deleted)
- `_MergedEventsTab` -- appears at class def + instantiation (correct)
- `showLiveDot` -- appears in `_TabWithBadge` constructor, field, and build method
- "Happening Now" in feed directory -- appears only in ChoiceChip label, comments, and empty state message (not as standalone tab label)

## Commits

| Hash | Message |
|------|---------|
| b8e3f80 | feat(phase-20): merge Happening Now into Events tab with ChoiceChip filter |

## Self-Check: PASSED
