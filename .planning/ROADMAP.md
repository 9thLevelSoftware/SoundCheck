# Roadmap: SoundCheck

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-02-27)
- ✅ **v1.1 Launch Readiness & Growth Platform** — Phases 9-12 (shipped 2026-02-28)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-8) — SHIPPED 2026-02-27</summary>

**Total: 8 phases, 22 plans, 77 requirements — all complete**
**Archive:** `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Launch Readiness & Growth Platform (Phases 9-12) — SHIPPED 2026-02-28</summary>

**Total: 9 phases, 30 plans, 32 requirements — all complete**
**Archive:** `.planning/milestones/v1.1-ROADMAP.md`, `.planning/milestones/v1.1-REQUIREMENTS.md`

</details>

### v2.0 Beta Launch

#### Phase 17: Social Graph & Beta Onramp
**Goal**: User discovery, global feed, and multi-account demo seeding for beta launch
**Depends on**: Phases 14, 15
**Plans:** 1/2 plans complete
Plans:
- [x] 17-01-PLAN.md -- Backend: user discovery + global feed + seed content
- [ ] 17-02-PLAN.md -- Mobile: user discovery UI + global feed tab

---

<details>
<summary>v1.1 Phase Details (archived)</summary>

## v1.1 Phase Details

### Phase 9: Trust & Safety Foundation
**Goal**: Users and content are protected by a complete moderation pipeline, and the app meets App Store Guideline 1.2 requirements for UGC-enabled applications
**Depends on**: Phase 8 (v1.0 complete)
**Requirements**: SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05, AUTH-01, AUTH-02
**Success Criteria** (what must be TRUE):
  1. User can report any check-in, comment, or photo and sees confirmation that the report was received
  2. User can block another user from any profile, and all interactions between them cease in both directions
  3. User can reset a forgotten password by receiving an email link and setting a new password
  4. Admin can open a moderation queue, see reported content with automated SafeSearch results, and approve or remove items
  5. Login screen shows only working authentication options (no fake biometric button, no Facebook stub)
**Plans:** 4/4 plans complete
Plans:
- [x] 09-01-PLAN.md — Database migrations and types foundation (reports, blocks, reset tokens, is_admin fix)
- [x] 09-02-PLAN.md — Report & moderation pipeline (ReportService, ModerationService, SafeSearch, admin queue)
- [x] 09-03-PLAN.md — Block system & auth cleanup (BlockService, feed filtering, remove biometric/Facebook stubs)
- [x] 09-04-PLAN.md — Password reset flow (EmailService, PasswordResetService, Resend integration, mobile screen)

### Phase 9.1: Content Moderation Enforcement *(INSERTED — gap closure)*
**Goal**: Moderated content (flagged by SafeSearch or hidden by admin) is actually excluded from all user-facing feeds, completing the moderation enforcement loop
**Depends on**: Phase 9 (is_hidden column and ModerationService already exist)
**Requirements**: SAFE-02, SAFE-03
**Gap Closure**: Closes audit gaps — is_hidden written but never read in content-serving queries
**Success Criteria** (what must be TRUE):
  1. Check-ins with `is_hidden = true` do not appear in friends feed, event feed, happening-now feed, or activity feed
  2. Comments with `is_hidden = true` do not appear in comment lists
  3. Hidden content is excluded from discovery/recommendation queries
  4. Admin hiding content via moderation queue causes immediate removal from all feeds on next refresh
**Plans:** 2/2 plans complete
Plans:
- [x] 09.1-01-PLAN.md -- Feed & checkin query is_hidden filtering (FeedService, CheckinQueryService, CheckinToastService) + partial indexes migration
- [x] 09.1-02-PLAN.md -- Discovery/trending/stats is_hidden filtering (DiscoveryService, EventService, StatsService) + ModerationService cache invalidation

### Phase 10: Viral Growth Engine
**Goal**: New users convert through onboarding, existing users share check-ins and badges to social platforms, and pre-show engagement drives friend attendance
**Depends on**: Phase 9 (moderation must exist before new UGC surfaces)
**Requirements**: ONBD-01, ONBD-02, ONBD-03, SHARE-01, SHARE-02, SHARE-03, SHARE-04, EVENT-01, EVENT-02
**Success Criteria** (what must be TRUE):
  1. First-time user sees onboarding carousel, picks favorite genres, and gets personalized event recommendations immediately
  2. After checking in, user sees a celebration screen showing badge progress and can share a branded card to Instagram Stories, X, or TikTok with one tap
  3. User can share a badge unlock card to social platforms from the badge detail screen
  4. Non-user clicking a shared link on social media lands on a web page showing the check-in/badge card with App Store and Play Store download buttons
  5. User can tap "I'm Going" on an upcoming event and see which friends are also going (count + avatars)
**Plans:** 5/5 plans complete
Plans:
- [x] 10-01-PLAN.md -- Database migrations + RsvpService + OnboardingService + routes (backend RSVP & onboarding APIs)
- [x] 10-02-PLAN.md -- ShareCardService + satori card templates + web landing page (backend share pipeline)
- [x] 10-03-PLAN.md -- Mobile onboarding enhancement (carousel + genre picker)
- [x] 10-04-PLAN.md -- Mobile celebration screen + social sharing flow
- [x] 10-05-PLAN.md -- Mobile RSVP UI + event detail friends going

### Phase 10.1: Report & Block Mobile UI *(INSERTED — gap closure)*
**Goal**: Users can report content and block other users from the mobile app, completing the Trust & Safety loop that Phase 9 started on the backend
**Depends on**: Phase 9 (report and block backend APIs already exist), Phase 10 (audit discovered gaps after Phase 10 completion)
**Requirements**: SAFE-01, SAFE-04
**Gap Closure**: Closes audit gaps — backend POST /api/reports and POST/DELETE /api/blocks/:userId/block exist but have no mobile entry points
**Success Criteria** (what must be TRUE):
  1. User can tap a report option on any check-in, comment, or photo and submit a report with reason
  2. User can tap a block button on any user profile to block that user, with confirmation
  3. Blocked state is reflected in the UI (block/unblock toggle)
  4. Report confirmation is shown to the user after submission
**Plans:** 2/2 plans complete
Plans:
- [x] 10.1-01-PLAN.md -- Content reporting UI (ReportRepository + ReportBottomSheet + feed card / check-in detail integration)
- [x] 10.1-02-PLAN.md -- Block system UI (BlockRepository + UserProfileScreen rebuild + BlockedUsersScreen + Settings link)

### Phase 10.2: Password Reset Mobile Fix *(INSERTED — gap closure)*
**Goal**: Password reset flow works end-to-end on mobile — user can request a reset email and complete the password change via deep link
**Depends on**: Phase 9 (PasswordResetService and EmailService already exist)
**Requirements**: SAFE-05
**Gap Closure**: Closes audit gap — forgot_password_screen.dart double-prefix URL causes 404; app_router.dart missing deep link handler for password reset completion
**Success Criteria** (what must be TRUE):
  1. User taps "Forgot Password", enters email, and request reaches backend successfully (no 404)
  2. User clicks `soundcheck://reset-password?token=X` link from email and app navigates to password reset screen
  3. User enters new password on reset screen and password is updated successfully
  4. Pre-existing discover_providers.dart double-prefix URL fixed (bonus)
**Plans:** 1/1 plans complete
Plans:
- [x] 10.2-01-PLAN.md -- Password reset URL fix + deep link handler + ResetPasswordScreen

### Phase 11: Platform Trust & Between-Show Retention
**Goal**: Users stay engaged between concerts via trending shows, the platform gains credibility through verified venue/artist profiles, and search/feed performance scales
**Depends on**: Phase 10 (RSVP data feeds trending algorithm; satori pipeline reused for verification badges)
**Requirements**: EVENT-03, EVENT-04, VERIFY-01, VERIFY-02, VERIFY-03, VERIFY-04, VERIFY-05, VERIFY-06, SCALE-01, SCALE-02, SCALE-03
**Success Criteria** (what must be TRUE):
  1. User sees a "Trending Shows Near You" feed that surfaces upcoming events ranked by a Wilson-scored mix of RSVP count, check-in velocity, friend signals, and proximity
  2. Venue owner can submit a claim request, and after admin approval, sees a verification badge on their venue profile and can view aggregate ratings and respond to reviews
  3. Artist can submit a claim request, and after admin approval, sees a verification badge on their band profile and can update their profile and view performance stats
  4. Search across bands, venues, and events uses full-text search with fuzzy fallback, returning relevant results for partial matches, typos, and multi-word queries
  5. Feed queries perform consistently under load using denormalized count columns instead of COUNT(DISTINCT) joins
**Plans:** 6/6 plans complete
Plans:
- [x] 11-01-PLAN.md — Database migrations (verification claims, tsvector search, genre array, review responses) + TypeScript types
- [x] 11-02-PLAN.md — TrendingService with Wilson scoring + feed denormalized count switchover
- [x] 11-03-PLAN.md — SearchService (tsvector + fuzzy fallback) + genre array query migration
- [x] 11-04-PLAN.md — ClaimService + admin approval + claimed owner features (review response, profile update, stats)
- [x] 11-05-PLAN.md — Mobile trending feed section + search screen upgrade
- [x] 11-06-PLAN.md — Mobile verification UI (claim submission, claims list, verified badges, owner responses)

### Phase 11.1: Cross-Phase Integration Fixes *(INSERTED — gap closure)*
**Goal**: Fix 4 cross-phase integration gaps discovered by milestone audit — denormalized count write path, claimed_by_user_id in API responses, block filtering in trending, and is_hidden in search counts
**Depends on**: Phase 11 (all gaps are in Phase 11 services)
**Requirements**: SCALE-02, VERIFY-04, SAFE-04, SAFE-02
**Gap Closure**: Closes audit gaps — 2 unsatisfied requirements (SCALE-02, VERIFY-04) and 2 partial requirements (SAFE-04, SAFE-02); fixes 3 broken E2E flows and 4 integration connections
**Success Criteria** (what must be TRUE):
  1. After toasting or commenting on a check-in, the feed correctly reflects updated toast_count and comment_count (not permanently 0)
  2. Verified venues and bands display verification badges in venue/band detail screens (claimed_by_user_id returned in API responses)
  3. Blocked users' check-ins do not appear in or influence the trending feed
  4. Event search result checkin_count excludes hidden/moderated content
**Plans:** 2/2 plans complete
Plans:
- [x] 11.1-01-PLAN.md — Denormalized count triggers migration (PostgreSQL triggers + backfill for toast_count/comment_count)
- [x] 11.1-02-PLAN.md — Service query patches (claimed_by_user_id in venue/band APIs, block filter in trending, is_hidden in search)

### Phase 11.2: Mobile Review Response UI *(INSERTED — gap closure)*
**Goal**: Claimed venue owners can respond to reviews from the mobile app, completing the review response feature that currently exists only as a backend endpoint
**Depends on**: Phase 11.1 (claimed_by_user_id fix needed for badge display), Phase 11 (ReviewService.respondToReview endpoint exists)
**Requirements**: VERIFY-05
**Gap Closure**: Closes audit gap — POST /api/claims/reviews/:reviewId/respond exists but has no mobile consumer
**Success Criteria** (what must be TRUE):
  1. Claimed venue owner sees a "Respond" action on reviews of their venue
  2. Owner can type and submit a response that is saved via the existing backend endpoint
  3. Response appears in the review thread for all users to see
**Plans:** 1/1 plans complete
Plans:
- [x] 11.2-01-PLAN.md — Backend review query fix + mobile Review model update + owner response bottom sheet + venue detail reviews section

### Phase 12: Monetization & Wrapped
**Goal**: Users experience their year in concerts through SoundCheck Wrapped, and a premium subscription tier generates recurring revenue
**Depends on**: Phase 11 (user_roles authorization model supports premium entitlements; satori pipeline reused for Wrapped cards)
**Requirements**: MONEY-01, MONEY-02, MONEY-03, MONEY-04, MONEY-05
**Success Criteria** (what must be TRUE):
  1. User can view their SoundCheck Wrapped annual recap showing top artists, venues, genres, and concert stats
  2. User can share branded Wrapped recap cards to social platforms
  3. User can subscribe to SoundCheck Pro ($4.99/mo) via in-app purchase on iOS and Android
  4. Premium subscribers access enhanced Wrapped with detailed analytics (top sets, genre evolution, friend overlap)
  5. Premium entitlements are validated server-side — revoking a subscription immediately removes access to premium features
**Plans:** 7/7 plans complete
Plans:
- [x] 12-01-PLAN.md — Database migration (is_premium, processed_webhook_events) + types + requirePremium() middleware
- [x] 12-02-PLAN.md — WrappedService (year-filtered stats) + WrappedController + routes
- [x] 12-03-PLAN.md — Wrapped card templates (satori voltLime) + ShareCardService extension + landing page
- [x] 12-04-PLAN.md — SubscriptionService (RevenueCat webhook handler) + subscription routes
- [x] 12-05-PLAN.md — Mobile Wrapped feature (story slides, detail screen, repository, providers)
- [x] 12-06-PLAN.md — Mobile subscription feature (RevenueCat SDK, Pro screen, paywall, Pro badge)
- [x] 12-07-PLAN.md — Integration (main.dart init, router, profile Pro badge + Wrapped entry, analytics)

## Progress

**Execution Order:**
Phases execute in numeric order: 9 -> 9.1 -> 10 -> 10.1 -> 10.2 -> 11 -> 11.1 -> 11.2 -> 12

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Data Model Foundation | v1.0 | 3/3 | Complete | 2026-02-02 |
| 2. Event Data Pipeline | v1.0 | 3/3 | Complete | 2026-02-03 |
| 3. Core Check-in Flow | v1.0 | 3/3 | Complete | 2026-02-03 |
| 4. Badge Engine | v1.0 | 3/3 | Complete | 2026-02-03 |
| 5. Social Feed & Real-time | v1.0 | 3/3 | Complete | 2026-02-03 |
| 6. Profile & Concert Cred | v1.0 | 2/2 | Complete | 2026-02-03 |
| 7. Discovery & Recommendations | v1.0 | 3/3 | Complete | 2026-02-03 |
| 8. Polish & App Store Readiness | v1.0 | 2/2 | Complete | 2026-02-03 |
| 9. Trust & Safety Foundation | v1.1 | 4/4 | Complete | 2026-02-27 |
| 9.1. Content Moderation Enforcement | v1.1 | 2/2 | Complete | 2026-02-27 |
| 10. Viral Growth Engine | v1.1 | 5/5 | Complete | 2026-02-28 |
| 10.1. Report & Block Mobile UI | v1.1 | 2/2 | Complete | 2026-02-28 |
| 10.2. Password Reset Mobile Fix | v1.1 | 1/1 | Complete | 2026-02-28 |
| 11. Platform Trust & Between-Show Retention | v1.1 | 6/6 | Complete | 2026-02-28 |
| 11.1. Cross-Phase Integration Fixes | v1.1 | 2/2 | Complete | 2026-02-28 |
| 11.2. Mobile Review Response UI | v1.1 | 1/1 | Complete | 2026-02-28 |
| 12. Monetization & Wrapped | v1.1 | 7/7 | Complete | 2026-02-28 |

</details>

---
*Roadmap created: 2026-02-02*
*Last updated: 2026-03-01 — Phase 17-01 complete (user discovery + global feed backend)*
