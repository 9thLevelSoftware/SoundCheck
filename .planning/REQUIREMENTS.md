# Requirements: v3.0 — UI/UX Design Audit

**Defined:** 2026-03-01
**Source:** UI Design Audit Report (78/100 B+ score) — all findings verified against codebase
**Goal:** Raise the design quality score from 78 (B+) to 90+ (A) by fixing every accessibility violation, contrast failure, touch target issue, and UX friction point identified in the audit. No new features — pure quality remediation.

---

## WCAG Contrast & Typography (5)

- [ ] **UIUX-01**: Increase social icon background alpha from 0.15 to 0.3+ in band detail `_SocialIcon` — current ~2.5:1 ratio fails WCAG AA 4.5:1 minimum (`band_detail_screen.dart:915`)
- [ ] **UIUX-02**: Bump venue detail address from `textTertiary` at 12px to `textSecondary` at 14px — current ~3.5:1 ratio fails AA (`venue_detail_screen.dart:374-379`). Apply same fix to all `textTertiary` + `fontSize: 12` instances in that file (lines 730, 903, 919, 1132)
- [ ] **UIUX-03**: Increase notifications timestamp from `textTertiary` at 12px to `textSecondary` at 13-14px — fails AA (`notifications_screen.dart:325-327`)
- [ ] **UIUX-04**: Increase Pro feature footer link font size from 12px to 14px — below readable minimum (`pro_feature_screen.dart:213,220`)
- [ ] **UIUX-05**: Verify search hint text contrast ratio (`textSecondary` on dark background) and add explicit fontSize to hintStyle to match input text sizing (`search_screen.dart:56-61`)

## Accessibility — Semantic Labels (5)

- [ ] **UIUX-06**: Add `semanticLabel` to all four `_SocialIcon` instances in band detail (Spotify, Instagram, Facebook, Website) — currently zero accessible names on tappable widgets (`band_detail_screen.dart:893-923`)
- [ ] **UIUX-07**: Add screen reader description to star rating widget in rating bottom sheet — no accessible description of current rating value (`rating_bottom_sheet.dart`)
- [ ] **UIUX-08**: Add `tooltip` to search clear button (`search_screen.dart`)
- [ ] **UIUX-09**: Add `semanticLabel: 'Toggle password visibility'` to password toggle icons in registration and login screens (`register_screen.dart`, `login_screen.dart`)
- [ ] **UIUX-10**: Add `tooltip` or `Semantics` label to all verified badge icons across band detail and venue detail screens

## Registration Form — Lightweight UX Improvements (4)

- [ ] **UIUX-11**: Mark First Name and Last Name fields as "(optional)" in their labels — currently indistinguishable from required fields (`register_screen.dart:177-203`)
- [ ] **UIUX-12**: Add password strength indicator below password field — visual bar or text showing weak/medium/strong (`register_screen.dart:207-228`)
- [ ] **UIUX-13**: Add real-time validation hints on email format and username availability (debounced API check) (`register_screen.dart:147-173`)
- [ ] **UIUX-14**: Add inline validation error display on confirm password mismatch before form submit (`register_screen.dart:232-264`)

## Touch Targets (5)

- [ ] **UIUX-15**: Add `minimumSize: Size(0, 44)` to "Clear" TextButtons in band and venue filter sheets (`band_filters_sheet.dart:236`, `venue_filters_sheet.dart:228,304`)
- [ ] **UIUX-16**: Increase venue verified badge touch target — add padding to 6px and icon size to 20px for 44px effective target
- [ ] **UIUX-17**: Add `minimumSize: Size(0, 44)` to "Restore Purchases" TextButton (`pro_feature_screen.dart:191`, `premium_paywall_sheet.dart:158`)
- [ ] **UIUX-18**: Add explicit height ≥44px to "See All" TextButtons in search results and detail screens (`venue_detail_screen.dart:595`)
- [ ] **UIUX-19**: Add explicit height ≥44px to "Mark all read" TextButton in notifications AppBar (`notifications_screen.dart:32-45`)

## Feed Tabs Consolidation (2)

- [x] **UIUX-20**: Merge "Events" and "Happening Now" into a single "Events" tab with a "Happening Now" chip/pill filter inside — reduce from 4 tabs to 3, lowering cognitive scan load (`feed_screen.dart` TabController length 4→3)
- [x] **UIUX-21**: Add "Happening Now" live indicator badge/dot on the merged Events tab when active events exist — preserves the FOMO signal without a dedicated tab

## Profile Section Collapsing (2)

- [ ] **UIUX-22**: Collapse secondary profile sections (Wrapped, Level Progress, Favorite Bands, Favorite Venues) behind "See More" expanders — reduce initial scroll from 9 sections to ~5 visible (`profile_screen.dart`)
- [ ] **UIUX-23**: Wire "View All" trailing action on Recent Activity section — currently defined but `onTrailingTap` is null (`profile_screen.dart:153-154`)

## Rating Sheet UX Clarity (3)

- [ ] **UIUX-24**: Add helper text "Rate at least one band or the venue to submit" when submit button is disabled — currently no explanation for disabled state (`rating_bottom_sheet.dart:186`)
- [ ] **UIUX-25**: Add visual checkmark or "rated" indicator on band/venue tabs that have been rated in the rating sheet
- [ ] **UIUX-26**: Show venue rating tab visual "rated" state — currently no indicator after venue is rated

## Check-in Vibes Reduction (1)

- [ ] **UIUX-27**: Reduce visible vibes from 10 to 6, collapse remaining 4 behind "More vibes" chip — Hick's Law violation with 10 simultaneous choices (`checkin_screen.dart:58-69`)

## Color & Theme Cleanup (4)

- [x] **UIUX-28**: Remove `electricPurple` alias — replace all references with `voltLime` (they resolve to the same `0xFFD2FF00`) to eliminate maintenance confusion (`app_theme.dart:68`)
- [x] **UIUX-29**: Remove `liveGreen` alias — replace all references with `voltLime` (`app_theme.dart:72`)
- [x] **UIUX-30**: Rename bottom nav "Alerts" label to "Notifications" — platform convention per Jakob's Law (`scaffold_with_nav_bar.dart:116`)
- [x] **UIUX-31**: Add unread notification count badge to bottom nav Notifications tab — Feed tabs have badges but Notifications does not (`scaffold_with_nav_bar.dart`)

## Light Mode Preparation (2)

- [x] **UIUX-32**: Audit all light theme color pairs for WCAG AA compliance — primary green `#2E7D32` on white is borderline. Document results before enabling light mode.
- [x] **UIUX-33**: Replace hardcoded `size: 24` in `_NavItem` icon with `IconThemeData` inheritance from theme — prep for theme-responsive sizing (`scaffold_with_nav_bar.dart:168`)

---

**Total: 33 requirements across 9 categories**

**Priority mapping from audit:**
- P0 (critical a11y): UIUX-01 through UIUX-10 (contrast + semantic labels)
- P1 (high impact): UIUX-11 through UIUX-19 (registration + touch targets)
- P2 (medium UX): UIUX-20 through UIUX-27 (feed tabs, profile, rating sheet, vibes)
- P3 (minor cleanup): UIUX-28 through UIUX-33 (color aliases, nav label, light mode prep)

## Traceability

Populated during roadmap creation. Each requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| UIUX-01 | Phase 18 | Pending |
| UIUX-02 | Phase 18 | Pending |
| UIUX-03 | Phase 18 | Pending |
| UIUX-04 | Phase 18 | Pending |
| UIUX-05 | Phase 18 | Pending |
| UIUX-06 | Phase 18 | Pending |
| UIUX-07 | Phase 18 | Pending |
| UIUX-08 | Phase 18 | Pending |
| UIUX-09 | Phase 18 | Pending |
| UIUX-10 | Phase 18 | Pending |
| UIUX-11 | Phase 19 | Pending |
| UIUX-12 | Phase 19 | Pending |
| UIUX-13 | Phase 19 | Pending |
| UIUX-14 | Phase 19 | Pending |
| UIUX-15 | Phase 19 | Pending |
| UIUX-16 | Phase 19 | Pending |
| UIUX-17 | Phase 19 | Pending |
| UIUX-18 | Phase 19 | Pending |
| UIUX-19 | Phase 19 | Pending |
| UIUX-20 | Phase 20 | Complete |
| UIUX-21 | Phase 20 | Complete |
| UIUX-22 | Phase 20 | Pending |
| UIUX-23 | Phase 20 | Pending |
| UIUX-24 | Phase 20 | Pending |
| UIUX-25 | Phase 20 | Pending |
| UIUX-26 | Phase 20 | Pending |
| UIUX-27 | Phase 20 | Pending |
| UIUX-28 | Phase 21 | Complete |
| UIUX-29 | Phase 21 | Complete |
| UIUX-30 | Phase 21 | Complete |
| UIUX-31 | Phase 21 | Complete |
| UIUX-32 | Phase 21 | Complete |
| UIUX-33 | Phase 21 | Complete |

**Coverage:**
- v3.0 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
