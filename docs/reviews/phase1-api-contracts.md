# Phase 1: API Contract Validation Audit

**Auditor:** API Tester Agent
**Date:** 2026-03-18
**Scope:** All 25 controllers, route files, validation schemas, error handling, pagination
**Target:** Pre-beta readiness (500-2,000 users)

---

## Executive Summary

Reviewed 25 controllers (26 files including WishlistController), 28 route files, the centralized validation middleware, and the Zod schema library. The codebase has a solid foundation -- consistent ApiResponse envelope, Sentry integration, rate limiting on sensitive endpoints, and good use of AppError hierarchy. However, the audit uncovered **5 Blocker**, **8 High**, **14 Medium**, and **7 Low** severity issues that should be addressed before public beta.

Critical themes:
1. **20 of 25 controllers have zero Zod middleware validation** -- input is validated ad-hoc in controller bodies, or not at all.
2. Several `parseInt` calls accept NaN without bounds-checking, enabling SQL injection of nonsensical values or server crashes.
3. The `AdminController` has no route file and no `requireAdmin` middleware wired, meaning its endpoints are either dead code or will be registered without authorization.
4. Error response format is inconsistent: the validation middleware uses `{ success, error, data: { details } }` while controllers use `{ success, error }` and the global handler uses `{ success, error, stack? }`.

---

## Findings

---

### [API-001]: AdminController has no route file -- endpoints unreachable or unprotected
**Severity:** Blocker
**File(s):** `backend/src/controllers/AdminController.ts:1`, `backend/src/index.ts:199-227`
**Description:** `AdminController` defines 6 admin endpoints (getStats, getTopVenues, getUserActivity, clearCache, getDatabaseHealth, moderateContent) but no route file imports it. It is not registered in `index.ts`. The controller comment at line 12 says "All routes should be protected with admin middleware" but no route file exists to enforce this. If these endpoints are intended for beta, they are dead code. If they were previously wired via a now-deleted route file, an attacker who discovers the pattern could attempt to access them.
**Evidence:** `grep -r "AdminController" backend/src/routes/` returns zero matches. `backend/src/index.ts` has no `/api/admin/stats` or `/api/admin` mount point (only `/api/admin/moderation` and `/api/admin/claims`).
**Recommended Fix:** Create `backend/src/routes/adminRoutes.ts` with `authenticateToken` + `requireAdmin()` middleware on every route. Register it in `index.ts` as `app.use('/api/admin', adminRoutes)`. Alternatively, if these endpoints are not needed for beta, delete the controller to reduce attack surface.

---

### [API-002]: AdminController.moderateContent accepts arbitrary action/targetType with no Zod validation
**Severity:** Blocker
**File(s):** `backend/src/controllers/AdminController.ts:267-323`
**Description:** The `moderateContent` endpoint destructures `{ action, targetType, targetId, reason }` directly from `req.body` with only a truthy check. `targetType` is not validated at all -- it is accepted but unused beyond being echo'd back in the response. `targetId` is interpolated into SQL via parameterized query ($1) which is safe, but `action` only checks two string values via a switch. There is no validation that `targetId` is a UUID, meaning a malformed string could cause a DB error that surfaces as a generic 500.
**Evidence:**
```typescript
const { action, targetType, targetId, reason } = req.body;
if (!action || !targetType || !targetId) { ... }
// targetType is never validated against an allowlist
// targetId is never validated as UUID
```
**Recommended Fix:** Add a Zod schema: `action: z.enum(['ban_user', 'delete_venue'])`, `targetType: z.enum(['user', 'venue'])`, `targetId: z.string().uuid()`, `reason: z.string().max(500).optional()`. Apply via `validate()` middleware in the route file.

---

### [API-003]: AdminController.getTopVenues and getUserActivity have no upper-bound on `limit` query parameter
**Severity:** Blocker
**File(s):** `backend/src/controllers/AdminController.ts:82`, `backend/src/controllers/AdminController.ts:124`
**Description:** `getTopVenues` parses `limit` via `parseInt(req.query.limit as string) || 10` with no upper bound. An attacker (or misconfigured client) can pass `?limit=999999999` causing the database to attempt to return all rows. `getUserActivity` has no limit at all on the recent checkins sub-query (hardcoded to 10), but the `userId` query parameter is not validated as UUID format.
**Evidence:**
```typescript
const limit = parseInt(req.query.limit as string) || 10;
// No Math.min() -- unbounded
```
**Recommended Fix:** Cap limit: `const limit = Math.min(Math.max(parseInt(...) || 10, 1), 100)`. Validate `userId` as UUID format.

---

### [API-004]: AdminController.clearCache accepts arbitrary `pattern` string for cache deletion
**Severity:** Blocker
**File(s):** `backend/src/controllers/AdminController.ts:201-231`
**Description:** The `clearCache` endpoint accepts `req.body.pattern` and passes it directly to `cache.delPattern(pattern)`. If the cache implementation uses glob/regex matching (common in Redis), a malicious admin could craft a pattern like `*` to wipe all cache, or exploit ReDoS if the pattern is used in a regex. There is no validation on the pattern format.
**Evidence:**
```typescript
const pattern = req.body.pattern as string | undefined;
if (pattern) {
  await cache.delPattern(pattern);
}
```
**Recommended Fix:** Validate that `pattern` matches an allowlist of known cache key prefixes (e.g., `feed:*`, `badge:*`, `user:*`). Reject arbitrary patterns.

---

### [API-005]: SubscriptionController.getStatus uses `req.user!.id` (non-null assertion) without auth guard
**Severity:** Blocker
**File(s):** `backend/src/controllers/SubscriptionController.ts:57`
**Description:** `getStatus` uses `req.user!.id` (TypeScript non-null assertion). While the route does have `authenticateToken` middleware, if the middleware ever fails silently or is accidentally removed, this will throw an unhandled TypeError crashing the request. Every other controller in the codebase checks `if (!req.user)` defensively. The `WrappedController` has the same pattern at lines 17, 33, 48, 80.
**Evidence:**
```typescript
const userId = req.user!.id; // Crashes if req.user is undefined
```
**Recommended Fix:** Replace with defensive check pattern used everywhere else:
```typescript
const userId = req.user?.id;
if (!userId) { res.status(401).json({...}); return; }
```
Apply to `SubscriptionController.getStatus` (line 57) and all `WrappedController` methods (lines 17, 33, 48, 80).

---

### [API-006]: 20 of 25 controllers have no Zod middleware validation on input-accepting endpoints
**Severity:** High
**File(s):** Multiple (see table below)
**Description:** Only 5 route files use the `validate()` middleware with Zod schemas: `userRoutes` (register, login, updateProfile, checkEmail, checkUsername), `reportRoutes` (createReport), `moderationRoutes` (reviewItem), `onboardingRoutes` (saveGenres), `rsvpRoutes` (toggle, getFriendsGoing), and `passwordResetRoutes` (forgotPassword, resetPassword). The remaining 20 controllers perform ad-hoc validation in controller method bodies or have no validation at all.

| Controller | Input Endpoints | Zod Middleware | Status |
|---|---|---|---|
| AdminController | 6 | None | No route file exists |
| BadgeController | 0 input | N/A | OK (read-only) |
| BandController | createBand, updateBand, importBand | None | Ad-hoc only |
| BlockController | blockUser (userId param) | None | No UUID validation on param |
| CheckinController | createCheckin, addComment, updateRatings, photos | None | Ad-hoc in controller |
| ClaimController | submitClaim, reviewClaim | None | reviewClaim has ad-hoc |
| ConsentController | updateConsent | None | Ad-hoc in controller |
| DiscoveryController | searchVenues, searchBands | None | Ad-hoc in controller |
| EventController | createEvent | None | Ad-hoc in controller |
| FeedController | markRead | None | Ad-hoc in controller |
| FollowController | follow/unfollow (userId param) | None | Controller validates UUID |
| NotificationController | markAsRead, delete (id param) | None | Controller validates UUID |
| SearchController | search | None | Ad-hoc in controller |
| ShareController | generateCheckinCard, generateBadgeCard | None | No validation on params |
| SubscriptionController | handleWebhook | None | Manual auth check |
| TrendingController | getTrending | None | Ad-hoc in controller |
| UserController | searchUsers, uploadProfileImage | None | Ad-hoc in controller |
| UserDiscoveryController | getSuggestions | None | Limit only |
| VenueController | createVenue, updateVenue, importVenue | None | Ad-hoc only |
| WishlistController | addToWishlist, updateNotifyPref | None | Ad-hoc in controller |
| WrappedController | getWrapped, cards | None | Year validated ad-hoc |

**Recommended Fix:** Create Zod schemas for every input-accepting endpoint and apply via `validate()` in route files. Priority: all POST/PUT/PATCH/DELETE endpoints that accept body or significant params.

---

### [API-007]: BandController.createBand and VenueController.createVenue only validate `name` field
**Severity:** High
**File(s):** `backend/src/controllers/BandController.ts:19-51`, `backend/src/controllers/VenueController.ts:19-51`
**Description:** Both `createBand` and `createVenue` cast `req.body` to their respective TypeScript interfaces and only check `if (!bandData.name)`. All other fields (genre, URLs, capacity, coordinates, etc.) are passed through to the service layer unvalidated. A client could send `{ name: "X", capacity: -999, formedYear: 99999, websiteUrl: "not-a-url" }` and it would be accepted. The TypeScript interfaces provide no runtime protection.
**Evidence:**
```typescript
const bandData: CreateBandRequest = req.body;
if (!bandData.name) { ... } // Only check
const band = await this.bandService.createBand(bandData);
```
**Recommended Fix:** Create comprehensive Zod schemas:
- Band: `name: z.string().min(1).max(200)`, `genre: z.string().max(100).optional()`, `formedYear: z.number().int().min(1900).max(currentYear).optional()`, `websiteUrl: z.string().url().optional()`, etc.
- Venue: `name: z.string().min(1).max(200)`, `capacity: z.number().int().min(1).optional()`, `latitude: z.number().min(-90).max(90).optional()`, `longitude: z.number().min(-180).max(180).optional()`, etc.

---

### [API-008]: BandController.updateBand and VenueController.updateVenue pass `req.body` directly with zero validation
**Severity:** High
**File(s):** `backend/src/controllers/BandController.ts:156`, `backend/src/controllers/VenueController.ts:157`
**Description:** Both update endpoints do `const updateData = req.body` and pass it directly to the service layer. There is no field allowlist, no type checking, and no length limits. A client could inject unexpected fields (e.g., `is_active`, `claimed_by_user_id`, `id`) that might be used in a dynamic UPDATE query, potentially allowing privilege escalation or data corruption.
**Evidence:**
```typescript
const updateData = req.body;
const band = await this.bandService.updateBand(id, updateData);
```
**Recommended Fix:** Define an explicit Zod schema for allowed update fields. Use `.pick()` or `.partial()` on the create schema to ensure only permitted fields are forwarded.

---

### [API-009]: EventController.createEvent has no Zod validation -- complex nested lineup not validated
**Severity:** High
**File(s):** `backend/src/controllers/EventController.ts:26-115`
**Description:** `createEvent` accepts a complex body with `venueId`, `eventDate`, optional `lineup` array with nested `bandId`/`bandName`/`setOrder`/`isHeadliner`. None of this is validated via Zod middleware. The controller does ad-hoc checks for `venueId` and `eventDate`, but the `lineup` array entries are only partially validated in a loop. `bandId` is not checked as UUID format. `setOrder` is not checked as a positive integer. The `CreateUserEventRequest` TypeScript interface exists but provides zero runtime validation.
**Evidence:**
```typescript
const { venueId, bandId, eventDate, eventName, description, doorsTime, startTime, ticketUrl, lineup } = req.body;
if (!venueId) { ... }
if (!eventDate || isNaN(new Date(eventDate).getTime())) { ... }
// lineup entries: only checks if bandId or bandName exists, no type/format validation
```
**Recommended Fix:** Create Zod schema with `z.array(z.object({ bandId: z.string().uuid().optional(), bandName: z.string().min(1).max(200).optional(), setOrder: z.number().int().min(0).optional(), isHeadliner: z.boolean().optional() }).refine(d => d.bandId || d.bandName))`.

---

### [API-010]: CheckinController.addComment has no maximum length check on commentText
**Severity:** High
**File(s):** `backend/src/controllers/CheckinController.ts:283-293`
**Description:** The `addComment` endpoint checks that `commentText` is not empty, but has no maximum length validation. A malicious user could submit a 10MB comment, consuming database storage and causing rendering issues on all clients viewing the checkin. The `updateProfileSchema` caps bio at 500 chars, but comments have no cap.
**Evidence:**
```typescript
if (!commentText || commentText.trim() === '') {
  // reject
}
// No maximum length check -- accepts megabytes of text
const comment = await this.checkinService.addComment(userId, id, commentText);
```
**Recommended Fix:** Add `z.string().min(1).max(2000)` validation for commentText. Also check in the Zod schema that it's trimmed.

---

### [API-011]: ClaimController.submitClaim passes unvalidated req.body to service
**Severity:** High
**File(s):** `backend/src/controllers/ClaimController.ts:25`
**Description:** `submitClaim` passes `req.body` directly to `this.claimService.submitClaim()` with no validation. The `CreateClaimRequest` type expects `entityType` (should be 'venue' or 'band'), `entityId` (should be UUID), `evidenceText`, and `evidenceUrl`. None of these are validated at the controller or route level. Invalid `entityType` values could cause unexpected behavior in the service layer.
**Evidence:**
```typescript
const claim = await this.claimService.submitClaim(req.user.id, req.body);
```
**Recommended Fix:** Create a Zod schema: `entityType: z.enum(['venue', 'band'])`, `entityId: z.string().uuid()`, `evidenceText: z.string().max(2000).optional()`, `evidenceUrl: z.string().url().max(500).optional()`.

---

### [API-012]: BlockController uses `req.user!.id` non-null assertion
**Severity:** High
**File(s):** `backend/src/controllers/BlockController.ts:19,46,75,101`
**Description:** All four BlockController methods use `req.user!.id` with a non-null assertion. While the route file applies `authenticateToken`, this is the same crash risk as API-005. If `authenticateToken` ever fails to set `req.user` and still calls `next()`, all four endpoints will throw an unhandled TypeError.
**Evidence:**
```typescript
const blockerId = req.user!.id; // line 19
```
**Recommended Fix:** Use the defensive pattern: `const userId = req.user?.id; if (!userId) { res.status(401)... }`.

---

### [API-013]: Inconsistent error response format between validation middleware and controllers
**Severity:** High
**File(s):** `backend/src/middleware/validate.ts:24-29`, multiple controllers
**Description:** The Zod validation middleware returns errors as:
```json
{ "success": false, "error": "Validation failed", "data": { "details": ["body.email: Invalid email"] } }
```
But all controllers return errors as:
```json
{ "success": false, "error": "Human-readable message" }
```
And the global error handler returns:
```json
{ "success": false, "error": "Internal server error" }
```
Mobile clients consuming this API must handle three different error shapes. The validation middleware nests structured details under `data.details`, while the `ApiResponse` type defines `error` as a simple string. This violates the contract defined in the `ApiResponse` interface.
**Recommended Fix:** Standardize all error responses to:
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "details": [...] } }
```
Or, at minimum, ensure validation errors use the same flat `error` string format as everything else (concatenating details into the error string).

---

### [API-014]: parseInt without NaN handling on multiple limit/page/offset parameters
**Severity:** Medium
**File(s):** Multiple controllers (see evidence)
**Description:** Many controllers parse `limit`, `page`, and `offset` query params using `parseInt(req.query.X as string)` or the `||` fallback pattern. However, some do NOT use `||` fallback and do not check for `NaN`. When `parseInt("abc")` returns `NaN`, it gets passed to SQL queries. While PostgreSQL parameterized queries will reject NaN gracefully (returning empty results), the behavior is undefined and inconsistent across endpoints.

Endpoints with no NaN/bounds protection:
- `AdminController.getTopVenues` -- no upper bound
- `BandController.getBands` -- no upper bound on limit
- `VenueController.getVenues` -- no upper bound on limit
- `EventController` -- 8 endpoints parse limit with no upper bound
- `CheckinController.getActivityFeed` -- limit and offset unbounded
- `CheckinController.getCheckins` -- limit unbounded
- `DiscoveryController` -- limit unbounded

Endpoints WITH proper bounds (good examples to follow):
- `FeedController` -- `Math.max(1, Math.min(50, isNaN(rawLimit) ? 20 : rawLimit))`
- `NotificationController` -- `Math.min(Math.max(..., 1), 100)`
- `FollowController.getFollowers` -- `Math.max(1, Math.min(..., 100))`
- `ReportController.getModerationQueue` -- `Math.min(..., 100)`

**Evidence:**
```typescript
// No bounds (bad):
const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
// With bounds (good):
const limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 20 : rawLimit));
```
**Recommended Fix:** Apply the bounded pattern consistently across all endpoints: `Math.max(1, Math.min(MAX, isNaN(parsed) ? DEFAULT : parsed))`. Maximum should be 100 for list endpoints, 50 for search/feed.

---

### [API-015]: Feed cursor pagination does not return error on malformed cursor -- silently returns first page
**Severity:** Medium
**File(s):** `backend/src/services/FeedService.ts:55-64`, `backend/src/controllers/FeedController.ts:25,57,89`
**Description:** When a malformed cursor is passed (e.g., `?cursor=garbage`), `decodeCursor()` returns `null`, and the feed query silently falls back to returning the first page. This is a design choice, but it can mask client bugs: a client that mangles cursors will appear to work (it gets data) but will re-fetch the same first page indefinitely, causing confusion and wasted bandwidth.
**Evidence:**
```typescript
export function decodeCursor(encoded: string): FeedCursor | null {
  try { ... } catch { return null; }
}
// In getFriendsFeed:
const cursorData = cursor ? decodeCursor(cursor) : null;
// null cursorData = no cursor clause = first page
```
**Recommended Fix:** When a cursor is provided but fails to decode, return a 400 error rather than silently ignoring it:
```typescript
if (cursor && !cursorData) {
  throw new BadRequestError('Invalid cursor format');
}
```

---

### [API-016]: CheckinController.getCheckinById returns 404 for ALL errors, masking server errors
**Severity:** Medium
**File(s):** `backend/src/controllers/CheckinController.ts:91-113`
**Description:** The `getCheckinById` catch block unconditionally returns 404 with "Check-in not found". If the service throws due to a database connection error, query timeout, or any other server-side failure, the client receives a 404 instead of a 500. This makes debugging production issues extremely difficult.
**Evidence:**
```typescript
} catch (error) {
  // ALL errors become 404
  res.status(404).json({ success: false, error: 'Check-in not found' });
}
```
**Recommended Fix:** Check if the error is a NotFoundError vs other error types:
```typescript
if (error instanceof NotFoundError) { res.status(404)... }
else { res.status(500)... }
```

---

### [API-017]: EventController.getEventById returns 404 for ALL errors, same issue as API-016
**Severity:** Medium
**File(s):** `backend/src/controllers/EventController.ts:121-143`
**Description:** Same pattern as API-016. All errors (including database failures) from `getEventById` return 404.
**Recommended Fix:** Same as API-016.

---

### [API-018]: CheckinController.createCheckin comment field has no length limit
**Severity:** Medium
**File(s):** `backend/src/controllers/CheckinController.ts:32-59`
**Description:** The `createCheckin` endpoint accepts a `comment` field in the body but never validates its length. Combined with API-010 (addComment), this means comments can be arbitrarily long both on checkin creation and as subsequent additions.
**Recommended Fix:** Add `comment: z.string().max(2000).optional()` to a Zod schema for checkin creation.

---

### [API-019]: PasswordResetController.forgotPassword does not validate email before passing to service
**Severity:** Medium
**File(s):** `backend/src/controllers/PasswordResetController.ts:24-46`
**Description:** While the route file has Zod validation via `forgotPasswordSchema`, the controller itself does not validate. If the middleware were bypassed (e.g., route misconfiguration), `this.passwordResetService.requestReset(email)` would receive `undefined`. However, the real issue is that the controller returns 200 even on success (anti-enumeration), which is correct, but the error path returns 500 with a generic message that could leak timing information about whether the email exists.
**Recommended Fix:** Ensure the service always takes the same execution time regardless of whether the email exists (constant-time response). The Zod middleware correctly handles validation, but add a defensive `if (!email)` check in the controller as defense-in-depth.

---

### [API-020]: Multiple controllers expose raw error.message to clients in non-development environments
**Severity:** Medium
**File(s):** Multiple controllers
**Description:** Several controllers return `error instanceof Error ? error.message : 'fallback'` in their error responses. While the global error handler properly hides messages in production (for 5xx), controller-level catch blocks bypass the global handler and may expose internal error messages directly. Examples:
- `BandController.createBand` (line 47): returns raw error.message as 400
- `BandController.updateBand` (line 171): returns raw error.message as 400
- `VenueController.createVenue` (line 47): returns raw error.message as 400
- `CheckinController.createCheckin` (line 76): returns raw error.message
- `EventController.createEvent` (line 110): returns raw error.message as 500

If the service layer throws a PostgreSQL error like "duplicate key value violates unique constraint", this internal detail is sent directly to the client.
**Evidence:**
```typescript
error: error instanceof Error ? error.message : 'Failed to create band',
```
**Recommended Fix:** Only expose known operational error messages (from AppError subclasses). For unknown errors, always use a generic message. Pattern:
```typescript
error: error instanceof AppError ? error.message : 'Failed to create band',
```

---

### [API-021]: VenueController.getVenuesNear validates coordinate bounds but other geo endpoints do not
**Severity:** Medium
**File(s):** `backend/src/controllers/VenueController.ts:254-261`, `backend/src/controllers/EventController.ts:362-396`, `backend/src/controllers/TrendingController.ts:30-40`
**Description:** `getVenuesNear` correctly validates `latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180`. However, `EventController.getNearbyEvents`, `EventController.getNearbyUpcoming`, `EventController.getTrendingEvents`, and `TrendingController.getTrending` all parse lat/lon but only check for NaN, not range bounds. Passing `lat=9999` would not be rejected and could cause unexpected database behavior.
**Evidence:**
```typescript
// VenueController (good):
if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) { ... }
// EventController.getNearbyEvents (missing):
if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) { ... }
// No range check
```
**Recommended Fix:** Add coordinate range validation to all geo endpoints.

---

### [API-022]: EventController.getTrendingEvents radius parameter not bounded
**Severity:** Medium
**File(s):** `backend/src/controllers/EventController.ts:244`
**Description:** The `radius` parameter defaults to 50 if not provided but has no upper bound. A client sending `?radius=999999` would query for events within ~1M km, effectively querying the entire database.
**Evidence:**
```typescript
const radius = req.query.radius ? parseFloat(req.query.radius as string) : 50;
```
**Recommended Fix:** Cap radius: `Math.min(parseFloat(...) || 50, 500)` (500km reasonable max).

---

### [API-023]: Discovery endpoints (searchVenues, searchSetlists, searchBands) are fully public with no rate limiting
**Severity:** Medium
**File(s):** `backend/src/routes/discoveryRoutes.ts:12-20`
**Description:** Four discovery endpoints that proxy to external APIs (setlist.fm, MusicBrainz) have no authentication requirement and no rate limiting. An attacker could flood these endpoints to exhaust the external API quotas, effectively causing a denial-of-service for the discovery feature. Only the `/users/suggestions` endpoint has rate limiting.
**Evidence:**
```typescript
router.get('/venues', discoveryController.searchVenues);       // No auth, no rate limit
router.get('/setlists', discoveryController.searchSetlists);   // No auth, no rate limit
router.get('/bands', discoveryController.searchBands);         // No auth, no rate limit
router.get('/bands/genre', discoveryController.searchBandsByGenre); // No auth, no rate limit
```
**Recommended Fix:** Add rate limiting to all discovery endpoints. Consider requiring authentication.

---

### [API-024]: DiscoveryController.searchSetlists accepts all parameters with no validation
**Severity:** Medium
**File(s):** `backend/src/controllers/DiscoveryController.ts:60-96`
**Description:** `searchSetlists` accepts 7 query parameters (artist, mbid, venue, city, date, year, page) with no validation on any of them. Unlike `searchVenues` (which requires name or city) and `searchBands` (which requires q), `searchSetlists` allows a request with zero parameters. The `date` parameter expects DD-MM-YYYY format but is not validated. The `year` parameter is parsed as int but not range-checked.
**Recommended Fix:** Require at least one search parameter. Validate date format with regex or Zod. Bound year to reasonable range.

---

### [API-025]: Event routes have no rate limiting on POST /api/events (create)
**Severity:** Medium
**File(s):** `backend/src/routes/eventRoutes.ts:35`
**Description:** Creating events requires authentication but has no rate limit. A malicious authenticated user could create thousands of spam events. Compare with band/venue routes which have `createRateLimit` (10 per 15 min).
**Evidence:**
```typescript
router.post('/', authenticateToken, eventController.createEvent);
// vs bandRoutes:
router.post('/', authenticateToken, createRateLimit, bandController.createBand);
```
**Recommended Fix:** Add `createRateLimit` to the event creation route.

---

### [API-026]: Event routes have no rate limiting on DELETE /api/events/:id
**Severity:** Medium
**File(s):** `backend/src/routes/eventRoutes.ts:41`
**Description:** Event deletion requires auth but has no rate limit and no ownership check in the route. The controller calls `eventService.deleteEvent(id)` without checking if the authenticated user owns the event or is an admin.
**Recommended Fix:** Add rate limiting and an ownership/admin check before allowing deletion.

---

### [API-027]: WrappedController.renderWrappedLanding does not validate userId or year params
**Severity:** Medium
**File(s):** `backend/src/controllers/WrappedController.ts:121-139`
**Description:** The public landing page endpoint accepts `userId` and `year` params but does not validate either. `userId` is used in URL construction (`/wrapped/${userId}/${year}`) without HTML escaping or UUID validation. While the page URL is not directly injected into HTML attributes (the template uses `{{PAGE_URL}}`), if `userId` contains special characters it could cause issues.
**Evidence:**
```typescript
const { userId, year } = req.params;
// userId not validated as UUID, year not validated
html = html.replace(/\{\{PAGE_URL\}\}/g, `${process.env.BASE_URL || ''}/wrapped/${userId}/${year}`);
```
**Recommended Fix:** Validate `userId` as UUID and `year` as integer in range. Use `escapeHtml` on the constructed URL (the `ShareController` does this correctly with `escapeHtml(pageUrl)`).

---

### [API-028]: FollowController.followUser returns 200 instead of 201 on successful follow creation
**Severity:** Low
**File(s):** `backend/src/controllers/FollowController.ts:63`
**Description:** Following a user is a resource creation operation but returns 200 instead of 201. Similarly, `WishlistController.addToWishlist` (line 68) returns 200 for creation. Compare with `CheckinController.createCheckin` which correctly returns 201.
**Recommended Fix:** Return 201 for follow creation and wishlist addition.

---

### [API-029]: CheckinController.deleteCheckin returns 500 for all errors including "not your checkin"
**Severity:** Low
**File(s):** `backend/src/controllers/CheckinController.ts:369-401`
**Description:** The `deleteCheckin` catch block returns 500 for all errors. If the service throws "You can only delete your own check-ins", the client gets a 500 instead of a 403.
**Recommended Fix:** Use the AppError pattern: if `error instanceof AppError`, use its statusCode.

---

### [API-030]: Inconsistent UUID validation across controllers
**Severity:** Low
**File(s):** Multiple controllers
**Description:** UUID validation is inconsistent:
- `FollowController`, `NotificationController`, `UserController`, `WishlistController`: Use `UUID_REGEX` to validate params
- `BlockController`: No UUID validation on `req.params.userId`
- `BadgeController`: No UUID validation on `req.params.userId` or `req.params.id`
- `CheckinController`: No UUID validation on `req.params.id`
- `EventController`: No UUID validation on `req.params.id`
- `ShareController`: No UUID validation on `req.params.checkinId` or `req.params.badgeAwardId`
- `ClaimController`: No UUID validation on `req.params.id`, `req.params.entityId`

Two different UUID regex patterns are used:
- `FollowController`: `/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i` (UUID v1-5)
- `NotificationController`: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i` (UUID v4 only)

**Recommended Fix:** Create a shared `isValidUUID()` utility and use it consistently, or validate all UUID params via Zod `z.string().uuid()` in route middleware.

---

### [API-031]: SubscriptionController.handleWebhook has inconsistent error response format
**Severity:** Low
**File(s):** `backend/src/controllers/SubscriptionController.ts:12-49`
**Description:** The webhook handler returns `{ error: 'Unauthorized' }` on auth failure (line 25) and `{ message: '...' }` on success/skip (lines 19, 33, 43, 48) instead of the standard `{ success: boolean, error?: string }` ApiResponse format. While this endpoint is consumed by RevenueCat (not the mobile app), it breaks the consistent API contract.
**Recommended Fix:** Use ApiResponse format for consistency, or at minimum document that this endpoint has a different response format.

---

### [API-032]: SubscriptionController.getStatus omits explicit status code -- uses default 200 via `res.json()`
**Severity:** Low
**File(s):** `backend/src/controllers/SubscriptionController.ts:59`
**Description:** `getStatus` uses `res.json()` instead of `res.status(200).json()`. While Express defaults to 200, this is inconsistent with every other controller in the codebase which explicitly sets `res.status(200).json()`.
**Recommended Fix:** Use explicit `res.status(200).json()` for consistency.

---

### [API-033]: UserController.getUserStats and getConcertCred use `res.json()` instead of `res.status(200).json()`
**Severity:** Low
**File(s):** `backend/src/controllers/UserController.ts:366,401`
**Description:** Same as API-032. These two endpoints use `res.json(response)` without explicit status code.
**Recommended Fix:** Use explicit status codes.

---

### [API-034]: Global error handler leaks stack traces in development mode
**Severity:** Low
**File(s):** `backend/src/index.ts:299-302`
**Description:** The global error handler includes `error.stack` in the response when `NODE_ENV === 'development'`. This is acceptable for local development but could be dangerous if a staging/QA environment is accidentally set to `development` mode. Stack traces reveal internal file paths, library versions, and code structure.
**Evidence:**
```typescript
if (process.env.NODE_ENV === 'development' && error.stack) {
  (response as any).stack = error.stack;
}
```
**Recommended Fix:** Consider using a more explicit flag like `EXPOSE_STACK_TRACES=true` rather than tying it to NODE_ENV, to prevent accidental exposure in non-local environments.

---

## Summary by Severity

| Severity | Count | IDs |
|---|---|---|
| **Blocker** | 5 | API-001, API-002, API-003, API-004, API-005 |
| **High** | 8 | API-006, API-007, API-008, API-009, API-010, API-011, API-012, API-013 |
| **Medium** | 14 | API-014 through API-027 |
| **Low** | 7 | API-028 through API-034 |
| **Total** | **34** | |

## Recommended Remediation Priority

### Before Beta Launch (Blockers + High)
1. **API-001**: Create AdminController route file with requireAdmin or delete dead code
2. **API-005, API-012**: Replace all `req.user!.id` non-null assertions with defensive checks (SubscriptionController, BlockController, WrappedController)
3. **API-006**: Create Zod schemas for the 20 controllers missing validation middleware -- prioritize: CheckinController, EventController, BandController, VenueController, ClaimController
4. **API-007, API-008, API-009, API-011**: Add comprehensive Zod schemas for create/update endpoints
5. **API-010**: Add max length on comment text
6. **API-013**: Standardize error response format
7. **API-002, API-003, API-004**: Validate AdminController inputs (once route file exists)

### Before Scale (Medium)
8. **API-014**: Apply consistent limit/offset bounds across all controllers
9. **API-020**: Stop leaking raw error.message to clients
10. **API-023, API-025, API-026**: Add rate limiting to unprotected endpoints
11. **API-016, API-017**: Fix catch-all 404 masking server errors
12. **API-021, API-022**: Add coordinate range validation and radius bounds
13. **API-015**: Return 400 for malformed cursors

### Polish (Low)
14. **API-028 through API-034**: Status code consistency, UUID validation, response format cleanup
