# Roadmap: SoundCheck

## Milestones

- ✅ **v1.0 MVP** — Phases 1-8 (shipped 2026-02-27)
- 🚧 **v1.1 Launch Readiness & Growth Platform** — Phases 9-12 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-8) — SHIPPED 2026-02-27</summary>

- [x] Phase 1: Data Model Foundation (3/3 plans) — completed 2026-02-02
- [x] Phase 2: Event Data Pipeline (3/3 plans) — completed 2026-02-03
- [x] Phase 3: Core Check-in Flow (3/3 plans) — completed 2026-02-03
- [x] Phase 4: Badge Engine (3/3 plans) — completed 2026-02-03
- [x] Phase 5: Social Feed & Real-time (3/3 plans) — completed 2026-02-03
- [x] Phase 6: Profile & Concert Cred (2/2 plans) — completed 2026-02-03
- [x] Phase 7: Discovery & Recommendations (3/3 plans) — completed 2026-02-03
- [x] Phase 8: Polish & App Store Readiness (2/2 plans) — completed 2026-02-03

**Total: 8 phases, 22 plans, 77 requirements — all complete**
**Archive:** `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 🚧 v1.1 Launch Readiness & Growth Platform (In Progress)

**Milestone Goal:** Close the 5 structural gaps identified by the Board of Directors gap analysis — launch blockers, viral growth, platform trust, between-show retention, and monetization foundation — transforming SoundCheck from "a good concert check-in app" into "a platform with network effects."

**Phase Numbering:**
- Integer phases (9, 10, 11, 12): Planned milestone work
- Decimal phases (9.1, 10.1): Urgent insertions (marked with INSERTED)

- [ ] **Phase 9: Trust & Safety Foundation** — App Store compliance infrastructure: report/block/moderation pipeline, auth cleanup, and tech debt that must be resolved before new UGC surfaces ship
- [ ] **Phase 10: Viral Growth Engine** — Onboarding conversion, shareable check-in/badge cards, social platform sharing, RSVP, and the post-check-in celebration loop
- [ ] **Phase 11: Platform Trust & Between-Show Retention** — Trending shows feed, venue/artist verification and claimed profiles, full-text search, and scalability improvements
- [ ] **Phase 12: Monetization & Wrapped** — SoundCheck Wrapped annual recap, premium subscription tier via RevenueCat, and revenue infrastructure (targeting Dec 2026)

## Phase Details

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
**Plans:** 4 plans
Plans:
- [ ] 09-01-PLAN.md — Database migrations and types foundation (reports, blocks, reset tokens, is_admin fix)
- [ ] 09-02-PLAN.md — Report & moderation pipeline (ReportService, ModerationService, SafeSearch, admin queue)
- [ ] 09-03-PLAN.md — Block system & auth cleanup (BlockService, feed filtering, remove biometric/Facebook stubs)
- [ ] 09-04-PLAN.md — Password reset flow (EmailService, PasswordResetService, Resend integration, mobile screen)

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
**Plans**: TBD

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
**Plans**: TBD

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
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 9 -> 10 -> 11 -> 12

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
| 9. Trust & Safety Foundation | v1.1 | 2/4 | In Progress | - |
| 10. Viral Growth Engine | v1.1 | 0/TBD | Not started | - |
| 11. Platform Trust & Between-Show Retention | v1.1 | 0/TBD | Not started | - |
| 12. Monetization & Wrapped | v1.1 | 0/TBD | Not started | - |

---
*Roadmap created: 2026-02-02*
*Last updated: 2026-02-27 after 09-04 plan completed*
