# Requirements: SoundCheck

**Defined:** 2026-02-27
**Core Value:** The live check-in moment: check in fast, rate the experience, share with friends — feeding discovery, gamification, and concert identity.

## v1.1 Requirements

Requirements for v1.1 Launch Readiness & Growth Platform. Each maps to roadmap phases.

### Trust & Safety

- [x] **SAFE-01**: User can report any check-in, comment, or photo for abuse/spam/inappropriate content
- [x] **SAFE-02**: Reported content enters moderation queue with automated Cloud Vision SafeSearch image scan
- [x] **SAFE-03**: Admin can review, approve, or remove reported content from moderation queue
- [x] **SAFE-04**: User can block another user (bilateral — blocks all interactions in both directions)
- [x] **SAFE-05**: User can reset forgotten password via email link

### Auth Cleanup

- [x] **AUTH-01**: Fake biometric login button removed from login screen
- [x] **AUTH-02**: Facebook sign-in stub removed from login screen

### Onboarding & UX

- [x] **ONBD-01**: New user sees 3-screen onboarding carousel explaining SoundCheck's value
- [x] **ONBD-02**: Onboarding includes genre picker that seeds personalized recommendations
- [x] **ONBD-03**: After successful check-in, user sees celebration screen with badge progress and share CTA

### Social Sharing

- [x] **SHARE-01**: Server generates shareable check-in card images (1200x630 OG + 1080x1920 Stories variants)
- [x] **SHARE-02**: User can share check-in card to Instagram Stories, X, and TikTok from celebration screen
- [x] **SHARE-03**: User can share badge unlock card to social platforms
- [x] **SHARE-04**: Non-users clicking a shared link see web landing page with card preview and App Store/Play Store CTAs

### Event Engagement

- [x] **EVENT-01**: User can RSVP "I'm Going" to upcoming events
- [x] **EVENT-02**: Event detail shows count and avatars of friends going
- [ ] **EVENT-03**: User sees "Trending Shows Near You" feed for between-concert retention
- [ ] **EVENT-04**: Trending algorithm uses Wilson-scored mix of RSVP count, check-in velocity, friend signals, and proximity

### Platform Credibility

- [ ] **VERIFY-01**: Venue owner can submit claim request for venue profile
- [ ] **VERIFY-02**: Artist can submit claim request for band profile
- [ ] **VERIFY-03**: Admin reviews and approves/denies verification claims
- [ ] **VERIFY-04**: Verified profiles display verification badge
- [ ] **VERIFY-05**: Claimed venue owner can view aggregate ratings and respond to reviews
- [ ] **VERIFY-06**: Claimed artist can update profile and view performance stats

### Technical Scale

- [ ] **SCALE-01**: Search uses PostgreSQL tsvector + GIN indexes with pg_trgm fuzzy fallback (replaces ILIKE)
- [ ] **SCALE-02**: Feed queries use denormalized toast_count and comment_count columns
- [ ] **SCALE-03**: Band.genre migrated from single string to array/many-to-many for faceted filtering

### Monetization

- [ ] **MONEY-01**: User can view SoundCheck Wrapped annual recap (basic version free)
- [ ] **MONEY-02**: Wrapped generates shareable recap cards via satori pipeline
- [ ] **MONEY-03**: User can subscribe to SoundCheck Pro ($4.99/mo) via in-app purchase
- [ ] **MONEY-04**: Premium users access enhanced Wrapped with detailed analytics
- [ ] **MONEY-05**: Premium entitlements validated server-side via RevenueCat webhooks

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Recommendations

- **RECO-01**: Collaborative filtering for recommendations (requires >5K active users, >50K check-ins)
- **RECO-02**: Recommendation impression and click-through logging for training data

### Engagement

- **ENGAGE-01**: Badge catalog expanded to 25-30 types
- **ENGAGE-02**: Offline check-in queue for venues with poor signal
- **ENGAGE-03**: Setlist integration into check-in flow
- **ENGAGE-04**: Shimmer loading states replacing plain spinners

### B2B Platform

- **B2B-01**: Full venue dashboard with data exports and heatmaps
- **B2B-02**: Artist promotional tools and featured events

### Infrastructure

- **INFRA-01**: Public API with OAuth2 scopes for partner ecosystem
- **INFRA-02**: WebSocket horizontal scaling (complete Redis Pub/Sub wiring)
- **INFRA-03**: Database read replicas for query distribution

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Custom ML content moderation | Cloud Vision SafeSearch is accurate and cheap at current scale |
| Real-time moderation blocking check-in flow | Adds latency to core action; async post-publish is the correct tradeoff |
| Collaborative filtering in v1.1 | Insufficient data — existing content-based recommendations are correct for this stage |
| Web frontend / web profiles | Mobile-only; web landing page for share links is minimal (card preview + CTAs only) |
| Past concert logging/diary | "I'm here now" creates urgency and authenticity |
| Ticket sales or purchasing | Link out to Ticketmaster/Bandsintown |
| Chat/messaging between users | Social via check-ins, toasts, comments |
| Concert buddy matching | Safety concerns, moderation complexity |
| Competitive leaderboards | Badges reward milestones, not competition |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SAFE-01 | Phase 9 | Complete |
| SAFE-02 | Phase 9.1 | Complete |
| SAFE-03 | Phase 9.1 | Complete |
| SAFE-04 | Phase 9 | Complete |
| SAFE-05 | Phase 9 | Complete |
| AUTH-01 | Phase 9 | Complete |
| AUTH-02 | Phase 9 | Complete |
| ONBD-01 | Phase 10 | Complete |
| ONBD-02 | Phase 10 | Complete |
| ONBD-03 | Phase 10 | Complete |
| SHARE-01 | Phase 10 | Complete |
| SHARE-02 | Phase 10 | Complete |
| SHARE-03 | Phase 10 | Complete |
| SHARE-04 | Phase 10 | Complete |
| EVENT-01 | Phase 10 | Complete |
| EVENT-02 | Phase 10 | Complete |
| EVENT-03 | Phase 11 | Pending |
| EVENT-04 | Phase 11 | Pending |
| VERIFY-01 | Phase 11 | Pending |
| VERIFY-02 | Phase 11 | Pending |
| VERIFY-03 | Phase 11 | Pending |
| VERIFY-04 | Phase 11 | Pending |
| VERIFY-05 | Phase 11 | Pending |
| VERIFY-06 | Phase 11 | Pending |
| SCALE-01 | Phase 11 | Pending |
| SCALE-02 | Phase 11 | Pending |
| SCALE-03 | Phase 11 | Pending |
| MONEY-01 | Phase 12 | Pending |
| MONEY-02 | Phase 12 | Pending |
| MONEY-03 | Phase 12 | Pending |
| MONEY-04 | Phase 12 | Pending |
| MONEY-05 | Phase 12 | Pending |

**Coverage:**
- v1.1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 after roadmap creation*
