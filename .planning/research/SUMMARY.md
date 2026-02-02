# Research Summary: SoundCheck Milestone 2

**Domain:** Social concert check-in app ("Untappd for live music")
**Researched:** 2026-02-02
**Overall Confidence:** HIGH
**Research Scope:** Stack additions for Untappd-style features on existing Flutter + Node/Express + PostgreSQL stack

---

## Executive Summary

SoundCheck's existing technology stack (Flutter 3.2+, Node.js 20/Express/TypeScript, PostgreSQL, Redis, Railway.app) is well-suited for the Untappd-style feature expansion. The research identifies that **no major technology changes** are needed -- the additions are incremental libraries and services that integrate cleanly with the current stack.

The concert event API landscape has consolidated since 2024. **Ticketmaster Discovery API is the clear primary choice**: it is free, offers instant registration, provides the largest event dataset (230K+ events), and supports multi-performer (attraction) data essential for SoundCheck's lineup model. **Songkick is effectively dead for new integrations** -- API key registration is frozen with no timeline for restoration. Bandsintown serves as a secondary source for indie/DIY coverage, though its approval process and single-artist key scoping add friction.

For real-time social features, the existing WebSocket infrastructure (`ws` + `web_socket_channel`) is sufficient. The key architectural addition is **Redis Pub/Sub for multi-instance fan-out**, which uses the already-installed ioredis package with zero new dependencies. **BullMQ** is the critical new addition -- a Redis-backed job queue (MIT licensed, v5.66.5) that handles badge evaluation, event sync scheduling, feed fan-out, and recommendation computation as background jobs, keeping the check-in endpoint fast.

The gamification badge system and recommendation engine do **not require third-party libraries**. Badge evaluation is best built as a custom event-driven engine using PostgreSQL JSONB criteria and BullMQ for async processing. Recommendations start as pure SQL queries (genre-based content filtering) and graduate to **pgvector** (PostgreSQL vector similarity extension, fully supported on Railway.app) when the user base justifies collaborative filtering.

---

## Key Findings

- **Ticketmaster Discovery API** is the best concert event source: free, 230K+ events, multi-performer data, instant access. 5,000 calls/day with a bulk Discovery Feed option for unlimited initial seeding.
- **Songkick API is not available** for new integrations. Do not plan for it.
- **BullMQ** (v5.66.5, MIT) is the critical new backend dependency: persistent job queue for badge evaluation, event sync, feed fan-out, and recommendations -- all using the existing Redis instance.
- **No new real-time libraries needed**: existing `ws` + ioredis handles WebSocket + Redis Pub/Sub for multi-instance scaling.
- **pgvector for recommendations** is available on Railway.app (one-click template, $5-15/mo) but should be deferred until 10K+ users -- SQL-based recommendations are sufficient at launch.
- **Cloudflare R2** replaces local filesystem for image storage (the current setup loses photos on every Railway deploy).
- **Firebase Cloud Messaging** for push notifications: `firebase_messaging` (Flutter) + `firebase-admin` (Node.js) -- Firebase is already partially initialized in the app.

---

## Implications for Roadmap

Based on research, the suggested phase structure for the technology additions:

### Phase 1: Data Foundation + Event Pipeline

**Rationale:** Events are the prerequisite for everything. Without event data from APIs, there is nothing to check into, rate, or earn badges for.

- Set up Ticketmaster Discovery API integration (register key, build adapter service)
- Add BullMQ for background job processing (event sync, badge evaluation)
- Set up Cloudflare R2 for image storage (fix the ephemeral filesystem problem)
- Addresses: Event data pipeline (FEATURES T2), image upload reliability (PITFALLS Critical-3)
- Avoids: Songkick dependency (PITFALLS CRITICAL-3), global sync rate limit exhaustion (PITFALLS MOD-2)

### Phase 2: Check-in Flow + Dual Ratings

**Rationale:** The core user action must work before social and gamification layers are added on top.

- Event-based check-in with optional dual ratings (band + venue)
- Location verification using existing geolocator
- Per-set ratings for multi-band events
- Addresses: Core check-in (FEATURES T1), dual ratings (FEATURES D2), location verification (FEATURES D8)
- Avoids: Dual rating friction trap (PITFALLS HIGH-2), synchronous badge evaluation blocking check-in (PITFALLS Critical-2 in STACK)

### Phase 3: Badge Engine + Gamification

**Rationale:** Badge evaluation must be async (via BullMQ) and criteria-driven (via JSONB). This phase depends on check-in data flowing.

- Build custom badge engine with JSONB criteria definitions
- BullMQ job queue for async badge evaluation after each check-in
- Badge progress tracking and earned notifications via WebSocket
- Addresses: Badges (FEATURES D1), badge progress (PROJECT.md requirements)
- Avoids: Over-engineered rule engine (PITFALLS MOD in STACK), badge farming (PITFALLS HIGH-1)

### Phase 4: Social Feed + Real-Time

**Rationale:** Feed depends on check-ins existing. Real-time overlay depends on Redis Pub/Sub architecture.

- Activity feed with Redis caching (pull model with 2-min TTL)
- Redis Pub/Sub for cross-instance WebSocket broadcasting
- FOMO feed with "happening now" real-time overlay
- Firebase Cloud Messaging for push notifications
- Addresses: Social feed (FEATURES T6), FOMO feed (FEATURES D4), push notifications (FEATURES T12)
- Avoids: WebSocket-only feed (PITFALLS HIGH-3 in STACK), notification overload (PITFALLS MOD-3), multi-instance broadcast failure (PITFALLS in STACK)

### Phase 5: Discovery + Recommendations

**Rationale:** Recommendations require check-in history. Start with SQL, defer pgvector.

- SQL-based recommendations (genre affinity, friend attendance, trending)
- Bandsintown API integration (if approved by this point)
- Trending shows and event discovery
- Addresses: Recommendations (FEATURES D11), discovery (PROJECT.md requirements)
- Avoids: Premature ML infrastructure (STACK recommendation), MusicBrainz genre overload (PITFALLS in STACK)

### Phase ordering rationale

1. **Event data first** because it unblocks everything -- check-ins, badges, feed, recommendations all need events.
2. **Check-in before badges** because badges evaluate against check-in history.
3. **Badges before feed** because badge-earned notifications appear in the feed.
4. **Feed before recommendations** because recommendations need behavioral data from the feed/check-in loop.
5. **Event pipeline runs in parallel** with check-in/badge/feed work because it has no dependency on those features beyond the events table.

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Event APIs (Ticketmaster) | HIGH | Verified against official docs, rate limits confirmed, SDK evaluated |
| Event APIs (Songkick) | HIGH | Confirmed frozen via official application page |
| Event APIs (Bandsintown) | MEDIUM | Approval process not tested, key scoping verified via docs |
| BullMQ | HIGH | MIT licensed, v5.66.5 (Jan 2026), 850K+ weekly npm downloads |
| WebSocket + Redis Pub/Sub | HIGH | Existing infrastructure, well-documented pattern |
| Badge Engine (custom) | HIGH | Pattern verified from multiple sources, no good off-the-shelf option |
| Recommendations (SQL) | HIGH | Standard PostgreSQL queries, no new deps |
| Recommendations (pgvector) | HIGH | Railway supports it, npm package has 99K+ weekly downloads |
| Firebase Cloud Messaging | HIGH | Firebase already initialized in the app |
| Cloudflare R2 | MEDIUM | S3-compatible, well-documented, but not yet tested with this stack |

---

## Gaps to Address

- **Bandsintown API approval timeline**: Unknown how long approval takes. Build Ticketmaster first, add Bandsintown when approved.
- **firebase_messaging version compatibility**: Must verify exact compatible version against existing firebase_core 4.3.0 using FlutterFire compatibility matrix.
- **Cloudflare R2 vs AWS S3 for Railway**: Both work, but R2's zero-egress model hasn't been tested specifically with Railway's network configuration. Verify during implementation.
- **Curated genre taxonomy**: Need to define the 15-25 top-level genres that map from MusicBrainz's 800+ genres. This is a product decision more than a technical one.
- **Ticketmaster Discovery Feed** (bulk export): Mentioned in docs as rate-limit-free, but requires testing to confirm it provides sufficient data for initial seeding.

---

## Files Created

| File | Purpose |
|------|---------|
| `.planning/research/SUMMARY.md` | This file -- executive summary with roadmap implications |
| `.planning/research/STACK.md` | Technology recommendations: event APIs, BullMQ, real-time patterns, badge engine, recommendations, push notifications, image storage |
| `.planning/research/FEATURES.md` | Feature landscape: table stakes, differentiators, anti-features, competitor analysis (created by parallel researcher) |
| `.planning/research/ARCHITECTURE.md` | System architecture: schema design, service boundaries, check-in flow, feed patterns (created by parallel researcher) |
| `.planning/research/PITFALLS.md` | Domain pitfalls: 18 categorized pitfalls with prevention strategies (created by parallel researcher) |

---

*Research summary completed: 2026-02-02*
