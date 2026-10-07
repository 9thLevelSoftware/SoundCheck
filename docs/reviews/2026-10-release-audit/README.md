# SoundCheck release-readiness audit (2026-10-07)

**Verdict: NO-GO for App Store and Play Store release.**

The backend and Flutter suites that can run on a clean Linux VM are green when they are executed in CI order (generate code, migrate, then test). A fresh PostgreSQL database accepts all 63 migrations, and the core HTTP happy path can register, create a venue, band, event, and check-in. The app is not store-ready. Live requests showed a shared rate-limit bucket that locks login after ordinary reads, other users' profiles 404, and the GDPR export and consent routes never run. A third-party API key is committed in `CHANGELOG.md`. Store screenshots, signing, Firebase, and purchase configuration are still human setup.

This run does not change application behavior. No harness or CI edit was required to make the suites runnable.

## Counts

| Severity | Meaning | Count |
| --- | --- | --- |
| P0 | Release blocker | 4 |
| P1 | Must-fix before store submission | 11 |
| P2 | Should-fix during the release waves | 11 |
| P3 | Polish | 6 |

Actionable rows are in [findings.md](findings.md). Machine-readable rows, plus the status of every March 2026 consolidated finding and every `Bug_Report.md` ID, are in [findings.json](findings.json).

## Top 10 blockers

1. **RA-001** One Redis key, `rate_limit:<ip>`, is shared by every IP limiter, so five ordinary reads make the next login return 429.
2. **RA-002** Friend, feed, and notification profiles call `GET /api/users/<uuid>`, which looks the user up by username and 404s.
3. **RA-003** `GET /api/users/export` and `/api/users/consents` are swallowed by `/:username` and return "User not found".
4. **RA-004** `CHANGELOG.md` contains a setlist.fm API key. Rotate it and remove it from git history before release.
5. **RA-005** A wrong password returns HTTP 500 in production instead of 401.
6. **RA-006** Missing check-ins and events return HTTP 500.
7. **RA-007** Manual check-in sends a rating that the API discards and stores as 0.
8. **RA-008** Account deletion anonymizes the profile and keeps check-in note text.
9. **RA-009 / RA-010** Privacy policy, the iOS privacy manifest, Android notification permission, and store screenshots do not match what the app collects and what the stores require.
10. **RA-011 / RA-012** Production `npm audit` reports a critical `proxy-addr` advisory, and `.env.example` still tells operators to set `JWT_EXPIRES_IN=7d`.

## What was run

Host tools installed for this run only: Node 24.21.0 (the image shipped Node 22; `engines` requires 24), Flutter 3.41.9, PostgreSQL 16.15, Redis 7.0.15. No Docker. No real secrets. Third-party credentials were left unset except a fake RevenueCat webhook secret. One discover smoke call reached the public MusicBrainz API with no key and returned a live artist row; that call was not repeated.

| Check | Result |
| --- | --- |
| `npm run harness:check` | Pass |
| Backend `npm ci` (Node 24) | Pass. `npm audit --omit=dev` then reported 9 advisories |
| Backend ESLint | Pass. 0 errors, 308 warnings (`no-explicit-any` backlog) |
| Backend Prettier | Pass |
| Backend `tsc --noEmit` | Pass |
| `test:dependency-compatibility` | 4/4 pass |
| `npm run test:coverage` with `RUN_INTEGRATION_TESTS=true` on an empty database | **Fail.** 80 suites passed, 1 failed. 1088 passed, 19 failed, 1107 total. All 19 failures are `CheckinService.integration.test.ts` (`relation "users" does not exist`). Coverage still cleared the gate: statements 66.59%, branches 58.06%, functions 66.89%, lines 66.88% (thresholds 60/50/50/60) |
| Same integration file after `migrate:deploy` | **Pass.** 19/19. Jest printed open handles and was force-exited. The separate CI `test:postgres:integration` command was not run again |
| `npm run build` | Pass. Runtime assets validated |
| `migrate:deploy` on empty `soundcheck_audit` | Pass. Bootstrap plus migrations 001–063 |
| `test:migrations:integration` on `soundcheck_phase30` | Pass. 5/5 scenarios, including interrupted recovery |
| HTTP contract gate | Pass. 156 active routes, 3 deliberately removed |
| Async contract gate | Pass. 9 contracts, 17 WebSocket events consumed by mobile |
| Unhealthy startup gate | Pass. Process exit 1, listener/websocket/workers/scheduler stayed down |
| Built runtime asset smoke | 6/6 pass |
| Production license check | Pass. 752 packages |
| `flutter pub get` | Pass |
| `flutter analyze` before `build_runner` | **Fail.** 2042 issues, almost all missing generated Dart (`*.g.dart` / `*.freezed.dart` are gitignored). This is not a product defect |
| `build_runner` | Pass. 109 outputs |
| `flutter analyze` after codegen | Pass. No issues |
| `dart format --set-exit-if-changed lib test` | Pass. 257 files, 0 changed |
| `flutter test` | Pass. 307 tests |
| `npm run build:web` | Pass. 8 pages. Validator warning: Android `assetlinks.json` is unpublished until a signing fingerprint exists |
| `node scripts/check-fastlane-store-assets.mjs` | **Fail.** Screenshot inventory status is `pending-signed-release-capture`; curated Android and iOS screenshots are missing |
| API boot `NODE_ENV=production` on migrated Postgres + Redis | Pass. `GET /health` returned database connected, Redis connected, push disabled, WebSocket disabled |
| Route smoke | See below |

`flutter test --coverage` was not run. `flutter test` had already passed 307 tests, and the owner asked not to rerun a passing suite. The 40% global / 70% critical-journey coverage gate is therefore unverified in this run.

## API smoke (real requests)

Server: `node dist/index.js` on port 3000, production mode, local Postgres, local Redis, WebSocket off, no Firebase/R2/Ticketmaster/setlist/Sentry/Resend keys.

Proven with two registered users:

- Register validation returns 400. Register returns 201. The user object does **not** include `isAdmin` or `isPremium`.
- Wrong password returns **500** `INTERNAL_ERROR` (production hides the message).
- Six successful `GET /api/venues` calls, then login, returns **429**. Redis key was `rate_limit:::ffff:127.0.0.1`.
- `GET /api/users/<other-user-uuid>` returns **404** User not found. `GET /api/users/<username>` returns 200.
- `GET /api/users/export` and `GET /api/users/consents` with a valid token return **404** User not found.
- Non-admin `GET /api/admin/stats` and `POST /api/admin/moderate` return 403. Unauthenticated admin returns 401.
- Venue, band, event, and check-in create return 201 after the rate-limit key is cleared. The other user deleting that check-in returns 403. Deleting the other user's venue returns 403.
- Create check-in with `rating: 4.5` and `comment: "Great set"` persists `rating: 0`, `comment: "Great set"`, and `noteText: "Great set"`.
- `GET /api/checkins/<missing-uuid>` and `GET /api/events/<missing-uuid>` return **500**.
- `PUT /api/users/me` with `{}` returns **500** (`No valid fields to update` is an untyped `Error`).
- Discover without a token returns 401. With a token and no setlist key, MusicBrainz search returned a public artist payload.
- `GET /health` and `GET /health/queues` are unauthenticated and include BullMQ job counts.
- RevenueCat webhook with a bad secret returns **HTTP 200** and body message `Unauthorized`.

Happy paths also returned 200/201 for feeds, notifications, badges, search, follow, block, wishlist list, RSVP list, onboarding status, subscription status, wrapped year, and claims list. Some write calls in the first pass returned 429 because of RA-001 and were retried only after deleting that Redis key.

## Coverage map

| Feature | Mobile surface | Mobile tests | API | API tests | Gap |
| --- | --- | --- | --- | --- | --- |
| Onboarding / auth / password reset | Login, register, forgot/reset, onboarding, genre picker | Widget + auth state + Dio tests | `/api/users/register`, `/login`, `/api/auth/*`, `/api/auth/social/*`, `/api/onboarding/*` | Auth, social, password-reset unit tests | No onboarding screen widget test. Social sign-in not exercised live |
| Discovery / search / filters | Discover, search, discover-users | Browse-filter test targets **unrouted** `BandsScreen` / `VenuesScreen` | `/api/discover/*`, `/api/search`, `/api/trending`, `/api/events/*` | Discovery/search behavior tests | Discover UI swallows errors. Live setlist/Ticketmaster not stubbed |
| Venue / band / event pages | Detail screens. List screens exist but are not routed | Card widget tests only | CRUD under `/api/venues`, `/api/bands`, `/api/events` | Service + catalog contract tests | No detail-screen tests. Venue "shows" list is a TODO |
| Check-in, ratings, notes, photos | Check-in, detail, rating sheet, photo sheet | Screen, provider, repository, upload tests | `/api/checkins` including ratings and photo confirm | Creator, query, photo, integration (needs migrated DB) | Manual rating is dropped (RA-007). Photo confirm needs R2 |
| Badges | Badge collection | None | `/api/badges` | Badge service/concurrency tests | No mobile badge tests |
| Friends / follow / activity | Discover-users follow. Feed | Feed screen, providers, repository | `/api/follow`, `/api/feed/*` | Follow security, feed behavior/cache | Public profile route is broken (RA-002). Feed "Events" tab calls the global feed |
| Profile / settings / blocks / claims | Profile, edit, other user, settings, blocked users, claims | Account repository only | `/api/users/me`, blocks, claims | User controller, claim security | Other-user profile broken. Settings toggles are local SharedPreferences |
| Notifications / push | Notifications list and detail | Push service unit tests only | `/api/notifications`, device tokens, BullMQ notification worker | Notification service + worker tests | No list/detail widget tests. Firebase absent, so push delivery was not live |
| Subscriptions / paywall | Pro screen, paywall sheet | Subscription unit/widget tests | `/api/subscription/status`, webhook | Subscription service + webhook contract tests | No store sandbox. Webhook ack is HTTP 200 even when rejected |
| Account deletion / privacy / export | Settings delete dialog | Account repository test | `POST /api/users/me/delete-account`, export, consents | Data retention + export unit tests | Export and consents are unreachable (RA-003). No in-app export UI |
| Wrapped / sharing / wishlist / RSVP | Wrapped story/detail, celebration, band wishlist, event RSVP | Sharing + celebration tests. Wrapped/wishlist/RSVP untested on device | Matching `/api/wrapped`, `/api/share`, `/api/wishlist`, `/api/rsvp` | Wrapped behavior, share contract, share security | Wrapped detail is premium-gated. Public landing is unrated |
| Admin / moderation | No mobile admin UI | None | `/api/admin`, `/api/admin/moderation`, `/api/admin/claims` | Admin cache test, report security | Destructive admin API is live behind `requireAdmin` |
| Web | Marketing, support, privacy, terms, child safety, delete-account, reset-password | Build validation only | Static. Reset page is the HTTPS fallback | `npm run build:web` | No browser e2e. `assetlinks.json` withheld until signing |
| Jobs | n/a | n/a | event-sync (4h), cancellations (daily), retention (daily), badge-eval, notification-batch, image-moderation | Async worker tests | Workers booted against local Redis. No Ticketmaster sync executed |

## What could not be verified

- **On-device Flutter e2e.** There is no `mobile/integration_test/` suite. Needs an Android emulator or iOS simulator, the generated Dart already produced by `build_runner`, and a reachable API.
- **Signed store builds, IAP, and push.** Needs Apple/Google accounts, keystores, `google-services.json`, `GoogleService-Info.plist`, RevenueCat public SDK keys, and a sandbox Apple ID / Play license tester. Fastlane metadata check already fails closed on missing screenshots.
- **Universal links / App Links.** iOS entitlements name `applinks:soundcheck.app`, and the web build refuses to publish `assetlinks.json` until a signing fingerprint exists.
- **Live Ticketmaster, setlist.fm, Foursquare, Resend, R2, Sentry, and Firebase.** Left unconfigured on purpose. MusicBrainz answered one public search.
- **Accessibility with VoiceOver or TalkBack.** No automated semantics suite. Docs in `docs/ACCESSIBILITY_TESTING.md` still need a device pass.
- **Load, multi-instance Railway, and Redis eviction.** Single local Redis only.
- **Gitleaks.** The CI action was not runnable here (no `gitleaks` binary, no `GITHUB_TOKEN`). RA-004 was found by reading `CHANGELOG.md`.
- **Mobile coverage thresholds.** Not rerun after the passing `flutter test`.

## Historical findings

`docs/reviews/beta-readiness-report.md` (2026-03-18) says all 173 consolidated findings were fixed and recommends an unconditional beta GO. That report is stale for a store release. Re-inspection on this tree:

- `Bug_Report.md`: BUG-001 not applicable (reviews tables were dropped). BUG-002, BUG-003, BUG-004, and BUG-005 are fixed in current code.
- March blockers that stayed fixed include auth-flag stripping, delete authorization, check-in transactions, delete stat triggers, Dio refresh, feed invalidation, logout cleanup, discovery auth, base-table migrations, WebSocket header auth, Railway healthcheck, and non-fatal pool errors.
- `findings.json` records 235 ID rows (consolidated IDs plus the original medium/low IDs, so this is not a count of 173 unique bugs): 186 fixed, 23 open, 23 drifted, 3 not applicable. Open and drifted IDs are folded into the RA backlog (for example CFR-032, CFR-MOB-005, CFR-034, API-016, API-017, API-059, SEC-007). RA-001 is the current form of the rate-limit work, and it is worse than the old in-memory note: the Redis key ignores the route.

## Wave plan

Fixes should land as separate reviewable PRs. Do not mix a P0 with store-metadata work.

| Wave | Scope | Depends on |
| --- | --- | --- |
| 1 | RA-001 rate-limit key per route class. RA-002 profile-by-id contract and mobile parser. RA-003 mount `/export` and `/consents` before `/:username`. RA-004 redact and rotate the setlist.fm key | None. Four independent PRs |
| 2 | RA-005 login 401. RA-006 not-found 404. RA-007 persist manual ratings. RA-013 empty profile update 400 | Wave 1 if tests share an IP limiter |
| 3 | RA-008 deletion of note text. RA-009 policy/manifest/settings. RA-010 notification permission and store listing (human screenshots and fingerprints). RA-011 dependency bumps. RA-012 token lifetime docs and access-token revocation (CFR-032). RA-014 upload size limit. RA-015 webhook misconfiguration visibility | Store accounts for RA-010 only |
| 4 | P2 product gaps: discover errors, settings that actually control push, feed events stub, unrated public reads, profile-image access, post-midnight check-in window, shutdown timeout, Redis eviction | Waves 1–2 |
| 5 | P3 polish: naming leftovers, image widgets, bio validator, changelog accuracy, version bump when the owner chooses a store version | None |

## Human-only setup

- Rotate the setlist.fm key in the provider dashboard, then replace `SETLISTFM_API_KEY` on Railway.
- Railway production: `DATABASE_URL`, `JWT_SECRET` (32+ chars), `JWT_EXPIRES_IN` (do not copy `7d` from the example), `CORS_ORIGIN`, `REDIS_URL`, `SENTRY_DSN`, `BASE_URL`, `PASSWORD_RESET_BASE_URL`.
- Firebase project, service account JSON, and the mobile plist/json files. Confirm push on a physical Android 13+ device and an iPhone.
- RevenueCat project, App Store and Play products, `RC_GOOGLE_KEY` / `RC_APPLE_KEY`, `REVENUECAT_WEBHOOK_AUTH`, and `REVENUECAT_WEBHOOK_ENVIRONMENT`.
- Apple Developer and Play Console apps, signing keys, and a decision on the bundle IDs (`com.9thlevelsoftware.soundcheck` on iOS, `com.soundcheck.app` on Android).
- Resend (or other) email domain, R2 bucket, Ticketmaster key.
- Signed-release screenshots for the five fastlane journeys, then set the screenshot inventory to ready.
- Apple/Google privacy nutrition labels consistent with location, photos, purchases, crash reports, and device tokens.
- Privacy policy postal address is still a placeholder.
- Device pass: VoiceOver, TalkBack, offline, and a purchase/restore in sandbox.
