---
phase: 08-polish-app-store-readiness
plan: 01
subsystem: mobile-ui
tags: [check-in, photo-upload, feed-card, PLSH-01, polish]
depends_on:
  requires: [03-02, 03-03, 05-01]
  provides: [PLSH-01-complete, enhanced-feed-cards, photo-upload-wiring]
  affects: [08-02]
tech-stack:
  added: []
  patterns: [bottom-sheet-enrichment, optional-field-display]
key-files:
  created: []
  modified:
    - mobile/lib/src/features/checkins/presentation/checkin_screen.dart
    - mobile/lib/src/features/feed/domain/feed_item.dart
    - mobile/lib/src/features/feed/presentation/widgets/feed_card.dart
decisions:
  - id: "08-01-01"
    decision: "PhotoUploadSheet invoked via showModalBottomSheet with isScrollControlled for expandable photo grid"
  - id: "08-01-02"
    decision: "eventDate and commentPreview added as optional nullable fields to FeedItem for backward compat"
  - id: "08-01-03"
    decision: "Comment preview placed above action buttons in feed card footer (Column wrapping existing Row)"
metrics:
  duration: "6 min"
  completed: "2026-02-03"
---

# Phase 8 Plan 1: Check-In Polish & Feed Card Enhancement Summary

**Wire PhotoUploadSheet in check-in success state (finalizing PLSH-01) and enhance feed cards with event date + comment preview**

## Performance

| Metric | Value |
|--------|-------|
| Duration | 6 min |
| Start | 2026-02-03T22:35:40Z |
| End | 2026-02-03T22:42:07Z |
| Tasks | 2/2 |
| Files modified | 3 |

## Accomplishments

### PLSH-01 Finalized: Check-In Flow Complete
The check-in flow is now fully functional with no dead-ends:
- **GPS auto-suggest** nearby events on screen load (Phase 3 Plan 02)
- **Single-tap CHECK IN** button on event card (Phase 3 Plan 02)
- **Optional enrichment** after check-in: rate bands, rate venue, **add photos** (wired here)
- **PhotoUploadSheet** opens as bottom sheet (thumb-reachable, one-handed friendly)
- The "Photo uploads coming soon!" placeholder has been replaced with working photo upload

### Enhanced Feed Cards
- **Event date** displayed beneath the check-in action text in the card header
- **Comment preview** shown as a one-line snippet above action buttons in the footer
- Both fields are optional (nullable) and gracefully hidden when null -- backward compatible with older data

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Wire photo upload in check-in success state | ff4b833 | Import PhotoUploadSheet, add _photosUploaded state, replace placeholder onTap with showModalBottomSheet |
| 2 | Enhance feed card with event date and comment preview | 453b493 | Add eventDate/commentPreview to FeedItem, display in feed card header/footer |

## Files Modified

| File | Changes |
|------|---------|
| `mobile/lib/src/features/checkins/presentation/checkin_screen.dart` | Added import, _photosUploaded state var, replaced placeholder with PhotoUploadSheet bottom sheet |
| `mobile/lib/src/features/feed/domain/feed_item.dart` | Added eventDate and commentPreview optional fields with JsonKey annotations |
| `mobile/lib/src/features/feed/presentation/widgets/feed_card.dart` | Wrapped header text in Column for event date, converted footer to Column for comment preview |

Note: `feed_item.freezed.dart` and `feed_item.g.dart` are regenerated but gitignored (generated at build time by `dart run build_runner build`).

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 08-01-01 | PhotoUploadSheet via showModalBottomSheet with isScrollControlled | Allows the sheet to expand for the photo grid; consistent with existing rating bottom sheet pattern |
| 08-01-02 | eventDate and commentPreview as optional nullable String? fields | Backward compatible with existing data; graceful degradation when backend doesn't provide these fields |
| 08-01-03 | Comment preview above action buttons in footer | Natural reading order -- see comment context before interacting with toast/comment actions |

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered

- Pre-existing `invalid_annotation_target` warnings on all JsonKey annotations in feed_item.dart due to Dart SDK 3.10 vs analyzer 3.9 version mismatch. Not introduced by this plan; affects all freezed models project-wide.
- Pre-existing staged files from another session detected in git working tree -- carefully scoped commits to only task-related files.

## Next Phase Readiness

- **08-02 (UI Polish & Theming):** Ready to proceed. Feed cards now have richer content to polish visually.
- **PLSH-01:** Fully satisfied. No further work needed for check-in flow speed/ergonomics.
- **Backend consideration:** The feed API query should be updated to SELECT event_date and a comment preview (e.g., first comment text) into the feed response. Currently these fields will be null until the backend populates them.
