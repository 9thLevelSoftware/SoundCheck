# SoundCheck Beta Readiness Review — Design Spec

**Date:** 2026-03-18
**Type:** E2E Application Review (Security, Stability, Functionality)
**Target:** Public invite-only beta (~500-2,000 users)
**Timeline:** No hard deadline — thoroughness over speed
**Approach:** Parallel Specialist Squads with Integration Phase

---

## 1. Context

SoundCheck is a live music check-in app ("Untappd for live music") built as a Flutter + Node.js/Express/PostgreSQL monorepo. The app lets users check in at concerts, rate bands and venues, earn badges, follow friends, and discover events.

### Tech Stack

- **Backend:** Node.js 20+, Express, TypeScript, PostgreSQL, Redis, BullMQ, WebSocket (ws)
- **Mobile:** Flutter 3.27.4+, Riverpod, GoRouter, Dio, Freezed
- **External APIs:** Ticketmaster, Foursquare, MusicBrainz, SetlistFM, Firebase (FCM), Cloudflare R2
- **Infrastructure:** Railway (auto-deploy), GitHub Actions CI, Sentry, Winston logging
- **Auth:** JWT (7-day expiry), Google OAuth, Apple Sign-In, bcrypt password hashing
- **Payments:** RevenueCat (iOS/Android subscriptions)

### Scale

- 25 controllers, 43 services, 28 route files, 43 database migrations
- 19 mobile feature modules, 37 badge definitions
- 6 external API integrations
- Recent v4.0 consolidation removed review tables, fixed 10 pre-existing test failures

### Beta Readiness Criteria

For a public invite-only beta, the app must:

1. **Not lose data** — no race conditions, cascade failures, or silent data corruption
2. **Not expose data** — no auth bypasses, PII leaks, injection vectors
3. **Not crash on core flows** — check-in, discovery, feed, profile, badges all work end-to-end
4. **Handle real-world usage** — rate limiting works, error handling is graceful, degraded external services don't crash the app
5. **Be operationally ready** — monitoring, logging, alerting, deployment pipeline, env vars all configured

---

## 2. Review Approach — Parallel Specialist Squads

### Why This Approach

The codebase has clean separation between backend and mobile, making parallel domain review natural. Specialized agents read less irrelevant code, reason more accurately about their domain, and produce findings with fewer false positives. A consolidation phase catches cross-cutting issues that domain-specific squads miss.

### Three Phases

1. **Phase 1 — Parallel Domain Squads:** 5 squads (9 agents) review their domains simultaneously
2. **Phase 2 — Integration & Cross-Cutting:** E2E flow verification, performance analysis, consolidated findings report
3. **Phase 3 — Resolution & Certification:** Fix blockers, verify fixes, produce GO/NO-GO report

---

## 3. Phase 1 — Parallel Domain Squads

All 5 squads run concurrently. Each produces a findings report.

### Squad 1: Security (2 agents)

**Agent Type:** Security Engineer

**Agent 1A — Backend Security:**
- Auth flows: JWT generation/validation, token refresh, social auth (Google/Apple) token verification
- Injection vectors: SQL injection across all parameterized queries, XSS in any HTML-generating endpoints, command injection in any shell-calling code
- Data exposure: PII in API responses (password hashes, emails in public endpoints), PII in logs (Winston config), PII in error messages (Sentry scrubbing)
- OWASP Top 10 audit against all 28 route files
- Secrets management: env var handling, no hardcoded secrets, .env in .gitignore
- HTTP security headers: Helmet config (CSP, COEP, COOP), CORS policy correctness
- Rate limiting: Redis-backed limiter actually enforces limits, graceful degradation if Redis down
- Admin endpoints: authorization checks, no privilege escalation paths

**Agent 1B — Mobile Security:**
- Secure storage: flutter_secure_storage usage patterns, token lifecycle, clearance on logout
- Network security: certificate pinning (or lack thereof), TLS enforcement
- Deep link handling: URI scheme hijacking, intent filter validation
- Token handling in Dio interceptors: race conditions during refresh, token exposure in logs
- Platform-specific: iOS Keychain access groups, Android Keystore configuration
- Sensitive data in state: tokens/PII in Riverpod providers that might persist beyond session
- Build configuration: debug flags, API URL hardcoding, ProGuard/obfuscation

**Deliverable:** Security findings report with severity, reproduction steps, and recommended fix for each finding.

### Squad 2: Backend (2 agents)

**Agent Type:** Backend Architect

**Agent 2A — Service Layer:**
- All 43 services for logic errors, unhandled exceptions, and null/undefined paths
- CheckinService (~600 LOC): race conditions on concurrent check-ins for same event, transaction boundaries, validation completeness
- BadgeEvaluators (37 badges): JSONB criteria evaluation correctness, anti-farming logic, edge cases (exactly-at-threshold, badge revocation)
- EventSyncService: Ticketmaster pipeline reliability, dedup logic correctness, fuzzy band matching accuracy, error handling on API failures
- DiscoveryService: recommendation algorithm correctness, genre affinity calculation, friend attendance logic
- FeedService: cursor-based pagination correctness, FOMO feed logic, real-time update consistency
- ModerationService: report handling completeness, block enforcement across all endpoints
- Error propagation: do service errors reach controllers correctly? Are they logged? Do they produce correct HTTP status codes?

**Agent 2B — Database Layer:**
- All migrations: UP/DOWN symmetry, idempotency, correctness of ALTER statements
- Index coverage: every WHERE clause and JOIN has an appropriate index, no missing GIN indexes on tsvector columns
- Trigger reliability: denormalized count triggers (checkin_count, follower_count) under concurrent writes
- Foreign key integrity: no orphan paths, CASCADE vs RESTRICT correctness
- Query patterns: N+1 detection across all services, unbound SELECTs, missing LIMIT clauses
- Transaction boundaries: which operations should be transactional but aren't?
- Data types: column types appropriate for their data (e.g., timestamps with timezone, numeric precision)

**Deliverable:** Backend findings report covering service logic and database integrity.

### Squad 3: API Surface (2 agents)

**Agent Type:** API Tester

**Agent 3A — Contract Validation:**
- All 25 controllers: request validation (Zod schemas) actually enforced, response shapes consistent
- HTTP status codes: correct codes for success, validation error, not found, unauthorized, forbidden, server error
- Error response format: consistent structure across all endpoints (code, message, details)
- Pagination: cursor-based pagination correctness (first page, middle, last, empty, single item)
- Edge cases: empty string inputs, null vs undefined, boundary values (max int, empty arrays), Unicode, extremely long strings
- Content-Type handling: JSON parsing errors handled gracefully
- CORS preflight: OPTIONS responses correct for all routes

**Agent 3B — Auth & Infrastructure Endpoints:**
- Auth middleware coverage: every route that should be protected IS protected (no missing `requireAuth` middleware)
- Rate limiting verification: limits actually enforced per configuration (5/15min auth, 30-100/15min general, 3/hr checkin)
- WebSocket: handshake auth, reconnection handling, message format validation, connection cleanup
- File upload flow: R2 presigned URL generation, upload validation, size limits, content type restrictions
- Admin endpoints: admin-only authorization enforced, no regular-user access
- Health check: `/health` endpoint returns correct status, checks database connectivity

**Deliverable:** API surface findings report with endpoint-by-endpoint results.

### Squad 4: Mobile App (2 agents)

**Agent Type:** Frontend Developer

**Agent 4A — State & Navigation:**
- All Riverpod providers: missing `autoDispose` causing memory leaks, stale state after logout, error state propagation
- Provider dependencies: circular dependencies, providers that rebuild too frequently
- GoRouter configuration: dead routes (routes defined but no navigation to them), missing routes (navigation to undefined routes), auth redirect completeness
- Dio interceptor: token refresh race condition (multiple 401s triggering multiple refreshes), network error handling (timeout, no connection, DNS failure), retry logic
- Logout flow: all state cleared, all providers reset, secure storage wiped, navigation reset to login
- Deep linking: all declared deep links actually handled, parameter parsing

**Agent 4B — UI/UX & Crash Paths:**
- All 19 feature modules: loading states, error states, empty states (no data), null data handling
- Crash paths: what happens when API returns unexpected shape, null fields in required positions, empty lists where non-empty expected
- Accessibility: minimum 44px touch targets, WCAG AA contrast ratios, semantic labels on interactive elements, screen reader navigation order
- Platform consistency: iOS vs Android behavioral differences (back button, safe areas, keyboard handling)
- Offline/degraded: behavior when network drops mid-operation, cached data freshness
- Image handling: missing images (broken URLs), loading placeholders, error fallbacks
- Form validation: client-side validation matches server-side, error messages helpful

**Deliverable:** Mobile findings report covering state management, navigation, UI/UX, and crash resilience.

### Squad 5: Infrastructure (1 agent)

**Agent Type:** DevOps Automator

- Railway deployment config: `railway.toml` and `nixpacks.toml` correctness, build/start commands, migration execution
- Environment variables: complete inventory of all required vs configured env vars, identify any missing or placeholder values
- Health check: `/health` endpoint reliability, what it actually checks, timeout behavior
- Redis failover: rate limiting behavior when Redis is unavailable, BullMQ job persistence, WebSocket pub/sub degradation
- BullMQ reliability: job persistence across deploys, failed job retry policy, dead letter queue configuration, stalled job handling
- Logging: Winston configuration completeness, log rotation, Sentry DSN configured, error context quality
- Monitoring: Sentry alert rules, UptimeRobot configuration, what ISN'T monitored that should be
- CI/CD pipeline: GitHub Actions workflow completeness, test coverage in CI, gitleaks running, missing checks (lint, type-check, build verification)
- Backup strategy: PostgreSQL backup frequency, restore procedure documented, tested?
- Secrets rotation: JWT_SECRET rotation procedure, API key rotation without downtime

**Deliverable:** Infrastructure findings report with operational readiness assessment.

---

## 4. Phase 2 — Integration & Cross-Cutting

Runs after all Phase 1 squads complete. Targets gaps that domain-specific squads cannot catch.

### Squad 6: E2E Flow Verification (2 agents)

**Agent Type:** Evidence Collector

**Agent 6A — Core Flows:**

Trace each flow through the full stack: mobile code -> Dio request -> route -> controller -> service -> database -> response -> state update -> UI render. Flag any broken chain link.

Flows to verify:
1. Registration (email + password) -> onboarding carousel -> genre picker -> home screen
2. Event discovery -> event detail -> RSVP
3. Check-in at event -> select bands -> rate bands -> rate venue -> add photo -> submit
4. Feed appears with friend check-ins -> tap to view detail
5. Badge awarded after qualifying check-in -> badge notification -> badge showcase
6. Profile stats update after check-in (counts, genre breakdown, concert cred)
7. Search for band/venue/event -> results -> detail screen

**Agent 6B — Secondary Flows:**

1. Social auth (Google) -> profile setup -> home
2. Social auth (Apple) -> profile setup -> home
3. Follow user -> their check-ins appear in feed
4. Push notification received -> tap -> navigates to correct screen
5. Share card generated -> share to external app
6. Wrapped data generates correctly for user with check-in history
7. Claim venue ownership -> verification flow -> claim status
8. Report user -> block user -> blocked user's content hidden
9. Subscription purchase (RevenueCat) -> Pro features unlocked
10. Password reset flow -> email sent -> token valid -> password changed

**Exit criteria:** Every flow either has evidence of working end-to-end or a filed blocker explaining where it breaks.

### Squad 7: Performance & Data Integrity (2 agents)

**Agent Type:** Performance Benchmarker

**Agent 7A — Query & Concurrency Analysis:**
- Catalog all database queries across all services
- Identify: missing indexes, N+1 patterns, unbound SELECTs, full table scans, queries that will degrade at 2,000+ users
- Concurrency analysis: checkin race conditions (duplicate check-ins), badge evaluation under concurrent triggers, WebSocket fan-out scaling
- Response time estimation: flag any endpoint likely to exceed 500ms at beta scale
- Connection pool sizing: PostgreSQL pool configuration vs expected concurrent connections
- Redis memory: rate limiting key accumulation, pub/sub channel cleanup

**Agent 7B — Data Integrity:**
- Denormalized count consistency: verify every `*_count` column matches its actual count (checkin_count, follower_count, etc.)
- Trigger correctness: test trigger logic for INSERT, UPDATE, DELETE, including edge cases (bulk operations, transaction rollbacks)
- Foreign key coverage: scan for tables/columns that reference other tables but lack FK constraints
- Orphan detection: identify data paths that could create orphaned records
- Migration rollback safety: verify every UP migration has a correct DOWN migration
- Seed data validity: seed script produces consistent, non-conflicting data

**Exit criteria:** No query without appropriate indexing, no race condition without mitigation, no denormalized count that can drift.

### Squad 8: Consolidated Findings (1 agent)

**Agent Type:** Reality Checker

Receives all findings from Phase 1 squads (5 reports) and Phase 2 squads 6-7 (4 reports). Produces a single consolidated report:

1. Deduplicate findings across squads (same issue found by multiple agents)
2. Validate severity assignments — no finding gets "Blocker" without concrete evidence
3. Cross-reference: does a security finding explain a backend logic issue? Does an API issue cause a mobile crash?
4. Categorize all findings:
   - **Blocker** — must fix before beta (data loss, auth bypass, crash on core flow, security vulnerability)
   - **High** — fix within first beta week (degraded core experience, error handling gaps, missing validation)
   - **Medium** — fix during beta period (edge case bugs, UI inconsistencies, non-critical features)
   - **Low** — backlog (polish, minor UX, code quality)
5. Summary statistics: total findings by severity, by domain, by phase

**Deliverable:** Consolidated findings report — the single source of truth for Phase 3.

---

## 5. Phase 3 — Resolution & Certification

Iterative phase that loops until the Reality Checker certifies beta readiness.

### Step 3A: Triage & Fix Planning

**Agent:** Backend Architect

- Takes consolidated findings report
- Groups blockers by domain (backend, mobile, infra, security)
- For each blocker, writes a fix specification:
  - Root cause analysis
  - Proposed fix (specific files, specific changes)
  - Risk of regression
  - Dependencies on other fixes
- Produces prioritized fix plan ordered by dependency (fixes that unblock other fixes go first)

**Output:** Fix plan document with every blocker assigned a fix spec.

### Step 3B: Parallel Fix Implementation

Fix agents work in isolated git worktrees to avoid conflicts. Each agent handles blockers from their domain only.

| Agent Type | Scope |
|---|---|
| Senior Developer | Backend blockers — service logic, controller fixes, migration patches, job reliability |
| Senior Developer | Mobile blockers — provider fixes, UI crash paths, state management corrections, navigation |
| Security Engineer | Security blockers — auth gaps, injection vectors, data exposure, header/CORS fixes |
| DevOps Automator | Infrastructure blockers — env var completeness, deployment config, monitoring, CI pipeline |

**Constraints:**
- Each agent works ONLY on blockers from the findings report
- Every fix references the finding ID it resolves
- No scope creep — no "while I'm here" improvements
- Each fix on its own branch in a worktree

### Step 3C: Fix Verification

**Agent:** Evidence Collector

For every fix merged:
1. Re-run the specific check that originally flagged the issue
2. Collect before/after evidence
3. Verify no regression in adjacent functionality
4. Run full test suite: `npm test` (backend) + `flutter test` + `flutter analyze` (mobile)
5. Report any new failures

### Step 3D: Certification Loop

**Agent:** Reality Checker

Reviews all fix verification evidence. For each original blocker:
1. Fix was implemented (code change exists)
2. Fix was verified with evidence (test passes, behavior confirmed)
3. No regressions introduced (test suite green, adjacent features stable)

**If any blocker remains unresolved or verification is insufficient:** loop back to Step 3B for that specific finding.

**Loop exit criteria — ALL must be true:**
- Zero open blockers
- All fixes have verification evidence
- Full test suite passes (backend + mobile)
- No new blocker-severity findings introduced by fixes
- Security agent confirms no new vulnerabilities from fix code

### Step 3E: Beta Readiness Report

**Agent:** Reality Checker

Produces the final GO/NO-GO document:
- Executive summary
- Total findings by severity (before and after fixes)
- All blockers resolved with evidence links
- Remaining High/Medium/Low findings with recommended timeline
- Known limitations for beta
- Operational checklist (env vars, monitoring, alerting, backup)
- Explicit **GO** or **NO-GO** recommendation with reasoning

**Output:** `docs/superpowers/specs/beta-readiness-report.md`

---

## 6. Agent Roster Summary

| Phase | Squad | Agent Type | Count | Execution |
|---|---|---|---|---|
| 1 | Security | Security Engineer | 2 | Parallel |
| 1 | Backend | Backend Architect | 2 | Parallel |
| 1 | API Surface | API Tester | 2 | Parallel |
| 1 | Mobile | Frontend Developer | 2 | Parallel |
| 1 | Infrastructure | DevOps Automator | 1 | Parallel |
| 2 | E2E Flows | Evidence Collector | 2 | Parallel |
| 2 | Performance | Performance Benchmarker | 2 | Parallel |
| 2 | Consolidation | Reality Checker | 1 | Sequential |
| 3 | Fix Planning | Backend Architect | 1 | Sequential |
| 3 | Fix Implementation | Senior Dev ×2, Security, DevOps | 4 | Parallel (worktrees) |
| 3 | Verification | Evidence Collector | 1 | Sequential |
| 3 | Certification | Reality Checker | 1 | Sequential (loop) |
| | | **Total** | **21** | |

---

## 7. Severity Definitions

| Severity | Definition | Examples | Beta Impact |
|---|---|---|---|
| **Blocker** | Data loss, auth bypass, crash on core flow, security vulnerability | SQL injection, missing auth on protected route, check-in loses data | Must fix before launch |
| **High** | Degraded core experience, error handling gaps, missing validation | Unhandled API error crashes screen, missing input validation | Fix within first beta week |
| **Medium** | Edge case bugs, UI inconsistencies, non-critical features | Rare pagination bug, dark mode contrast issue | Fix during beta period |
| **Low** | Polish, minor UX, code quality | Missing loading skeleton, verbose console logs | Backlog |

---

## 8. Scope Boundaries

### In Scope

- All source code in `backend/` and `mobile/` directories
- All 39 database migrations and seed scripts
- All 6 external API integrations (Ticketmaster, Foursquare, MusicBrainz, SetlistFM, Firebase, R2)
- Deployment configuration (Railway, GitHub Actions CI)
- Authentication (JWT, Google OAuth, Apple Sign-In)
- Real-time features (WebSocket, push notifications)
- Subscription/payment flow (RevenueCat)
- All 19 mobile feature modules
- All 37 badge definitions and evaluation logic

### Out of Scope

- Penetration testing against live production infrastructure
- App Store / Play Store submission review process
- Legal/compliance review (GDPR, CCPA — separate workstream)
- Load testing with live traffic generation against production
- Third-party service SLA evaluation
- Marketing copy and content review
- Web application (mobile-only for v1)

---

## 9. Deliverables

| Deliverable | Producer | Timing |
|---|---|---|
| Security findings report | Squad 1 | End of Phase 1 |
| Backend findings report | Squad 2 | End of Phase 1 |
| API surface findings report | Squad 3 | End of Phase 1 |
| Mobile findings report | Squad 4 | End of Phase 1 |
| Infrastructure findings report | Squad 5 | End of Phase 1 |
| E2E flow trace evidence | Squad 6 | End of Phase 2 |
| Performance analysis report | Squad 7 | End of Phase 2 |
| **Consolidated findings report** | Squad 8 (Reality Checker) | End of Phase 2 |
| Fix plan (prioritized) | Phase 3A | Start of Phase 3 |
| Fix verification evidence | Phase 3C | Per fix |
| **Beta Readiness Report (GO/NO-GO)** | Phase 3E (Reality Checker) | End of Phase 3 |
