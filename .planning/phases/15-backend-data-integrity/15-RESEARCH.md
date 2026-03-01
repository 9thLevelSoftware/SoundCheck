# Phase 15: Backend Data Integrity & Logging - Research

**Researched:** 2026-03-01
**Domain:** Backend data correctness, idempotency, structured logging
**Confidence:** HIGH

## Summary

This phase addresses four discrete backend integrity issues: blocked-user content leaking into Wrapped stats (BETA-16), a semantic mismatch between database column name and API field name for venue/band review counts (BETA-17), a missing idempotency guard on owner review responses (BETA-18), and 455 unstructured console statements bypassing an existing winston logger (BETA-19).

All four issues are well-scoped with clear existing patterns to follow. The codebase already has a `BlockService.getBlockFilterSQL()` pattern used in 4 other services, an established winston logger utility at `backend/src/utils/logger.ts` with convenience wrappers, and the `respondToReview` method is a straightforward 40-line function with a clear place to add the guard. The semantic mismatch (BETA-17) is the most sensitive because it affects the mobile app UI, existing tests, and multiple services -- but the fix is mechanical once the direction is decided.

**Primary recommendation:** Tackle BETA-16, BETA-17, and BETA-18 as surgical, scoped fixes. BETA-19 (console migration) is a bulk mechanical change best done file-by-file with a clear mapping of console.log -> logger.info, console.error -> logger.error, console.warn -> logger.warn.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BETA-16 | Add block filter to WrappedService.getFriendOverlap() | BlockService.getBlockFilterSQL() pattern documented; exact SQL insertion point identified at line 271 of WrappedService.ts |
| BETA-17 | Fix VenueService semantic mismatch (total_reviews -> totalCheckins) | Full mapping chain documented: DB column `total_reviews` -> mapper reads `row.total_reviews` -> sets `totalCheckins` on API type. 4 affected mapper functions, 3 external services, mobile UI labels it "Check-ins" |
| BETA-18 | Add idempotency guard to ReviewService.respondToReview | Current implementation at lines 502-541 of ReviewService.ts documented; no existing guard; two fix options analyzed |
| BETA-19 | Replace console.log/error/warn with structured winston logger | 455 statements across 69 files catalogued; existing logger utility fully documented; 16 files already import logger |
</phase_requirements>

---

## BETA-16: Block Filter in WrappedService.getFriendOverlap()

### Current Implementation

**File:** `backend/src/services/WrappedService.ts`, lines 262-285

```typescript
private async getFriendOverlap(userId: string, year: number): Promise<FriendOverlapEntry[]> {
    const result = await this.db.query(
      `SELECT f_user.id as friend_id, f_user.username as friend_username,
              f_user.profile_image_url as friend_profile_image_url,
              COUNT(DISTINCT c2.event_id)::int as shared_shows
       FROM checkins c1
       JOIN checkins c2 ON c1.event_id = c2.event_id AND c1.user_id != c2.user_id
       JOIN user_followers uf ON uf.follower_id = $1 AND uf.following_id = c2.user_id
       JOIN users f_user ON f_user.id = c2.user_id
       WHERE c1.user_id = $1 AND c1.is_hidden IS NOT TRUE AND c2.is_hidden IS NOT TRUE
         AND EXTRACT(YEAR FROM c1.created_at) = $2
         AND EXTRACT(YEAR FROM c2.created_at) = $2
       GROUP BY f_user.id, f_user.username, f_user.profile_image_url
       ORDER BY shared_shows DESC LIMIT 10`,
      [userId, year]
    );
    // ... mapping
}
```

**Problem:** No block filter. If User A blocks User B but still follows them (or the unfollow failed), User B's checkins appear in User A's Wrapped friend overlap stats. Even after unfollowing, if the block occurred after Wrapped data was generated, historical data still leaks.

**Note:** `BlockService.blockUser()` does auto-unfollow, so in theory blocked users should no longer be in `user_followers`. However, the block filter is still needed as defense-in-depth: the unfollow could fail silently, or the follow could be re-established through a race condition.

### Existing Pattern: BlockService.getBlockFilterSQL()

**File:** `backend/src/services/BlockService.ts`, lines 130-138

```typescript
getBlockFilterSQL(userId: string, userColumn: string): string {
    this.validateUUID(userId);
    return `AND NOT EXISTS (
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = '${userId}' AND blocked_id = ${userColumn})
         OR (blocker_id = ${userColumn} AND blocked_id = '${userId}')
    )`;
}
```

### Usage in Other Services (5 call sites)

| File | Line | Column Arg |
|------|------|------------|
| `backend/src/services/FeedService.ts` | 119 | `'c.user_id'` |
| `backend/src/services/FeedService.ts` | 260 | `'c.user_id'` |
| `backend/src/services/TrendingService.ts` | 85 | `'c.user_id'` |
| `backend/src/services/TrendingService.ts` | 93 | `'er.user_id'` |
| `backend/src/services/checkin/CheckinQueryService.ts` | 159 | `'c.user_id'` |

### How Each Service Injects BlockService

All services use the same pattern:
```typescript
import { BlockService } from './BlockService';
// ...
private blockService = new BlockService();
```

### Fix Strategy

1. Import `BlockService` in `WrappedService.ts`
2. Add `private blockService = new BlockService();` to the class
3. Append block filter SQL to the WHERE clause in `getFriendOverlap()`:
   ```sql
   WHERE c1.user_id = $1 AND c1.is_hidden IS NOT TRUE AND c2.is_hidden IS NOT TRUE
     AND EXTRACT(YEAR FROM c1.created_at) = $2
     AND EXTRACT(YEAR FROM c2.created_at) = $2
     ${this.blockService.getBlockFilterSQL(userId, 'c2.user_id')}
   ```
   Note: the column is `c2.user_id` (the friend's checkin), NOT `c1.user_id` (the requesting user's checkin).

**Confidence:** HIGH -- established pattern, straightforward SQL append.

---

## BETA-17: VenueService Semantic Mismatch (total_reviews vs totalCheckins)

### The Full Mapping Chain

```
DB Schema (database-schema.sql):  total_checkins INTEGER DEFAULT 0    -- original column name
DB Actual (used in all queries):  total_reviews                       -- column was renamed/replaced at some point
SQL UPDATE (updateVenueRating):   total_reviews = (SELECT COUNT(*) FROM reviews WHERE venue_id = $1)
SQL SELECT (getVenueById etc):    SELECT ... total_reviews ... FROM venues
Mapper (mapDbVenueToVenue):       totalCheckins: parseInt(row.total_reviews || 0)
TypeScript Type (Venue):          totalCheckins: number
Mobile UI (venue_detail_screen):  label: 'Check-ins'    -- displays review count labeled as "Check-ins"
```

**The bug:** The DB column `total_reviews` stores a count of reviews, but it is mapped to `totalCheckins` in the API response, and the mobile app displays it labeled as "Check-ins". Users see review counts labeled as check-in counts.

### All Affected Mapper Locations

| File | Line | Code |
|------|------|------|
| `backend/src/services/VenueService.ts` | 413 | `totalCheckins: parseInt(row.total_reviews \|\| 0)` |
| `backend/src/services/BandService.ts` | 405 | `totalCheckins: parseInt(row.total_reviews \|\| 0)` |
| `backend/src/services/SearchService.ts` | 192 | `totalCheckins: parseInt(row.total_reviews \|\| 0)` |
| `backend/src/services/SearchService.ts` | 222 | `totalCheckins: parseInt(row.total_reviews \|\| 0)` |

### Services That Map Correctly (using different field name)

| File | Line | Code |
|------|------|------|
| `backend/src/services/FoursquareService.ts` | 301 | `totalReviews: parseInt(row.total_reviews \|\| 0)` |
| `backend/src/services/MusicBrainzService.ts` | 249 | `totalReviews: parseInt(row.total_reviews \|\| 0)` |
| `backend/src/services/SetlistFmService.ts` | 368 | `totalReviews: parseInt(row.total_reviews \|\| 0)` |

### Services That Use Correct checkin-based Counts (from JOIN queries)

| File | Line | Code |
|------|------|------|
| `backend/src/services/VenueService.ts` | 379 | `totalCheckins: parseInt(row.total_checkins \|\| '0')` (in `getVenueStats`) |
| `backend/src/services/BandService.ts` | 376 | `totalCheckins: parseInt(row.total_checkins \|\| '0')` (in `getBandStats`) |
| `backend/src/services/EventService.ts` | 893 | `totalCheckins: parseInt(row.total_checkins \|\| '0')` |
| `backend/src/services/WishlistService.ts` | 251 | `totalCheckins: parseInt(row.b_total_checkins) \|\| 0` |

### TypeScript Type Definitions

**Venue type** (`backend/src/types/index.ts`, line 65):
```typescript
totalCheckins: number;
```

**Band type** (`backend/src/types/index.ts`, line 105):
```typescript
totalCheckins: number;
```

**User type** (`backend/src/types/index.ts`, line 20):
```typescript
totalCheckins?: number;  // This one is correctly populated from checkins count in UserService
```

### Mobile App Impact

The mobile Dart models use `totalCheckins` and display it as "Check-ins":
- `mobile/lib/src/features/venues/domain/venue.dart:52` -- `@Default(0) int totalCheckins`
- `mobile/lib/src/features/venues/presentation/venue_detail_screen.dart:453-454` -- `value: venue.totalCheckins, label: 'Check-ins'`
- `mobile/lib/src/features/bands/domain/band.dart:28` -- `@Default(0) int totalCheckins`
- `mobile/lib/src/features/bands/presentation/band_detail_screen.dart:386` -- `value: band.totalCheckins, label: 'Check-ins'`

### Affected Tests

| File | Lines | What |
|------|-------|------|
| `backend/src/__tests__/routes/userStats.test.ts` | 118, 236 | Expects `totalCheckins` field |
| `backend/src/__tests__/services/UserService.stats.test.ts` | 49, 122, 150 | Expects `totalCheckins` field |
| `backend/src/__tests__/integration/auth.test.ts` | 242 | Expects `totalCheckins` field |

Note: The User model's `totalCheckins` is correctly populated from actual checkin counts (in `UserService.ts` line 334: `totalCheckins: parseInt(stats.checkin_count, 10)`), so user tests are NOT affected by this venue/band bug.

### Fix Options

**Option A (Recommended): Rename API field from `totalCheckins` to `totalReviews`**
- Rename in TypeScript types: `Venue.totalCheckins` -> `Venue.totalReviews`, `Band.totalCheckins` -> `Band.totalReviews`
- Update all 4 mapper functions to use `totalReviews`
- Update mobile Dart models and UI labels (change "Check-ins" to "Reviews")
- Update tests
- Impact: Breaking API change for mobile, but the data was always wrong, so better to fix the label

**Option B: Keep API field name `totalCheckins` but populate from actual checkin counts**
- Change the DB column back to `total_checkins` or add a new `total_checkins` column
- Change `updateVenueRating` to also maintain a real checkin count
- This is more complex and changes what the field represents

**Option C (Minimum viable): Document the mismatch and rename the API field**
- Just rename the TypeScript field and mobile labels to `totalReviews` / "Reviews"
- No DB changes needed
- The data is accurate (it IS review count), just mislabeled

**Confidence:** HIGH -- the mismatch is clear and mechanical to fix.

---

## BETA-18: Idempotency Guard on ReviewService.respondToReview()

### Current Implementation

**File:** `backend/src/services/ReviewService.ts`, lines 502-541

```typescript
async respondToReview(reviewId: string, userId: string, response: string): Promise<Review> {
    // Fetch the review to determine target entity
    const review = await this.getReviewById(reviewId, false);
    if (!review) {
      throw new NotFoundError('Review not found');
    }

    // Determine entity and check claimed ownership
    let isOwner = false;
    if (review.venueId) {
      const result = await this.db.query(
        'SELECT 1 FROM venues WHERE id = $1 AND claimed_by_user_id = $2',
        [review.venueId, userId]
      );
      isOwner = result.rows.length > 0;
    } else if (review.bandId) {
      const result = await this.db.query(
        'SELECT 1 FROM bands WHERE id = $1 AND claimed_by_user_id = $2',
        [review.bandId, userId]
      );
      isOwner = result.rows.length > 0;
    }

    if (!isOwner) {
      throw new ForbiddenError('Only the claimed owner can respond to reviews');
    }

    // Update review with owner response -- NO GUARD against overwrite
    const updateResult = await this.db.query(
      `UPDATE reviews
       SET owner_response = $1, owner_response_at = NOW(), updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, user_id, venue_id, band_id, rating, title, content, event_date,
                 image_urls, is_verified, helpful_count, owner_response, owner_response_at,
                 created_at, updated_at`,
      [response, reviewId]
    );

    return this.mapDbReviewToReview(updateResult.rows[0]);
}
```

**Problem:** The UPDATE statement unconditionally overwrites `owner_response` and `owner_response_at`. If an owner has already responded, calling this endpoint again silently replaces the previous response with no warning.

### Controller Context

**File:** `backend/src/controllers/ClaimController.ts`, lines 164-196

```typescript
respondToReview = async (req: Request, res: Response): Promise<void> => {
    try {
      // ... auth check, validation ...
      const review = await this.reviewService.respondToReview(reviewId, req.user.id, ownerResponse.trim());
      res.status(200).json({
        success: true,
        data: review,
        message: 'Response posted successfully',
      } as ApiResponse);
    } catch (error) {
      console.error('Respond to review error:', error);
      // ...
    }
};
```

**Route:** `POST /api/claims/reviews/:reviewId/respond` (`backend/src/routes/claimRoutes.ts`, line 36)

### DB Schema

**Migration 036** (`backend/migrations/036_review-owner-response.ts`):
```sql
ALTER TABLE reviews ADD COLUMN owner_response TEXT;
ALTER TABLE reviews ADD COLUMN owner_response_at TIMESTAMPTZ;
```

Both columns are nullable. `owner_response IS NULL` means no response yet.

### Review Type

**File:** `backend/src/types/index.ts`, lines 125-145:
```typescript
export interface Review {
  // ...
  ownerResponse?: string;
  ownerResponseAt?: string;
  // ...
}
```

### Fix Options

**Option A (Recommended): Add WHERE guard + return 409 Conflict**

In `ReviewService.respondToReview()`, change the UPDATE to:
```sql
UPDATE reviews
SET owner_response = $1, owner_response_at = NOW(), updated_at = CURRENT_TIMESTAMP
WHERE id = $2 AND owner_response IS NULL
RETURNING ...
```

If `updateResult.rowCount === 0`, check if the review exists (it does, we already fetched it), so the only reason for 0 rows is that `owner_response IS NOT NULL`. Throw a `ConflictError` (409).

**Option B: Check before update (race-condition prone)**
```typescript
if (review.ownerResponse) {
  throw new ConflictError('A response already exists for this review');
}
```
This has a TOCTOU race condition -- two concurrent requests could both see `null` and both proceed to update. Option A avoids this by using the database as the source of truth.

**Option C: Allow overwrites but track history**
Add a `previous_owner_response` column or an audit trail. More complex, probably overkill.

### Error Utilities

**File:** `backend/src/utils/errors.ts`, line 64 -- `ConflictError` already exists:

```typescript
export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists', internalMessage?: string) {
    super(message, 409, internalMessage);
  }
}
```

Import: `import { ConflictError } from '../utils/errors';` (ReviewService already imports `NotFoundError` and `ForbiddenError` from the same file).

**Confidence:** HIGH -- straightforward SQL guard, ConflictError ready to use.

---

## BETA-19: Console-to-Winston Logger Migration

### Current State

| Metric | Count |
|--------|-------|
| Total `console.log` statements | 147 |
| Total `console.error` statements | 280 |
| Total `console.warn` statements | 28 |
| **Total console statements** | **455** |
| Files with console statements | 69 |
| Files already importing logger | 16 |
| Files with BOTH logger import AND console | 2 (`ShareController.ts`, `index.ts`) |

### Existing Logger Utility

**File:** `backend/src/utils/logger.ts` (97 lines)

```typescript
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  levels: { error: 0, warn: 1, info: 2, http: 3, debug: 4 },
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  transports,
  exitOnError: false,
});

export default logger;

// Convenience methods
export const logError = (message: string, meta?: any) => { logger.error(message, meta); };
export const logWarn = (message: string, meta?: any) => { logger.warn(message, meta); };
export const logInfo = (message: string, meta?: any) => { logger.info(message, meta); };
export const logHttp = (message: string, meta?: any) => { logger.http(message, meta); };
export const logDebug = (message: string, meta?: any) => { logger.debug(message, meta); };
```

**Dependencies:** `winston@^3.18.3`, `winston-daily-rotate-file@^5.0.0` (already installed)

**Transports:**
- Development: Colorized console output
- Production: Daily-rotated JSON files (`soundcheck-%DATE%.log` + `soundcheck-error-%DATE%.log`)
  - General logs: 20MB max, 14-day retention
  - Error logs: 20MB max, 30-day retention

### Migration Mapping

| Console Call | Logger Replacement |
|---|---|
| `console.log('message')` | `logger.info('message')` or `logInfo('message')` |
| `console.log('message', data)` | `logger.info('message', { data })` |
| `console.error('message', error)` | `logger.error('message', { error })` or `logError('message', error)` |
| `console.warn('message')` | `logger.warn('message')` or `logWarn('message')` |

### Files by Category (Top 30 by Console Statement Count)

**Scripts (can use console for CLI output -- consider keeping or using logger):**
| File | Count | Notes |
|------|-------|-------|
| `backend/src/scripts/seed-demo.ts` | 35 | CLI script, console acceptable |
| `backend/src/scripts/migrate-events-model.ts` | 28 | CLI migration script |
| `backend/src/scripts/seed.ts` | 20 | CLI script |
| `backend/src/scripts/retentionJob.ts` | 16 | Background job -- should use logger |
| `backend/src/scripts/migrate.ts` | 16 | CLI script, console acceptable |

**Services (MUST migrate):**
| File | Count |
|------|-------|
| `backend/src/services/checkin/CheckinCreatorService.ts` | 26 |
| `backend/src/services/EventService.ts` | 16 |
| `backend/src/services/AuditService.ts` | 12 |
| `backend/src/services/SetlistFmService.ts` | 11 |
| `backend/src/services/FoursquareService.ts` | 11 |
| `backend/src/services/PushNotificationService.ts` | 9 |
| `backend/src/services/checkin/CheckinToastService.ts` | 6 |
| `backend/src/services/SocialAuthService.ts` | 6 |
| `backend/src/services/NotificationService.ts` | 6 |
| `backend/src/services/ShareCardService.ts` | 5 |

**Controllers (MUST migrate):**
| File | Count |
|------|-------|
| `backend/src/controllers/CheckinController.ts` | 15 |
| `backend/src/controllers/EventController.ts` | 13 |
| `backend/src/controllers/UserController.ts` | 12 |
| `backend/src/controllers/ReviewController.ts` | 10 |
| `backend/src/controllers/BandController.ts` | 10 |
| `backend/src/controllers/VenueController.ts` | 8 |
| `backend/src/controllers/ClaimController.ts` | 8 |
| `backend/src/controllers/BadgeController.ts` | 8 |

**Infrastructure (MUST migrate):**
| File | Count |
|------|-------|
| `backend/src/utils/websocket.ts` | 14 |
| `backend/src/utils/redisRateLimiter.ts` | 12 |
| `backend/src/config/database.ts` | 10 |
| `backend/src/utils/cache.ts` | 7 |
| `backend/src/index.ts` | mixed (already imports logger but still has console calls) |

**Jobs (MUST migrate):**
| File | Count |
|------|-------|
| `backend/src/jobs/badgeWorker.ts` | uses console |
| `backend/src/jobs/moderationWorker.ts` | uses console |
| `backend/src/jobs/notificationWorker.ts` | uses console |
| `backend/src/jobs/eventSyncWorker.ts` | uses console |
| `backend/src/jobs/syncScheduler.ts` | uses console |
| `backend/src/jobs/queue.ts` | uses console |
| `backend/src/jobs/badgeQueue.ts` | uses console |
| `backend/src/jobs/moderationQueue.ts` | uses console |
| `backend/src/jobs/notificationQueue.ts` | uses console |

### Complete File List (69 files with console statements)

**Files to migrate (non-test, non-CLI-script): ~58 files**

```
backend/src/config/database.ts
backend/src/controllers/BadgeController.ts
backend/src/controllers/BandController.ts
backend/src/controllers/CheckinController.ts
backend/src/controllers/ClaimController.ts
backend/src/controllers/DiscoveryController.ts
backend/src/controllers/EventController.ts
backend/src/controllers/FeedController.ts
backend/src/controllers/NotificationController.ts
backend/src/controllers/ReviewController.ts
backend/src/controllers/SearchController.ts
backend/src/controllers/ShareController.ts          (already imports logger)
backend/src/controllers/SubscriptionController.ts
backend/src/controllers/TrendingController.ts
backend/src/controllers/UserController.ts
backend/src/controllers/VenueController.ts
backend/src/controllers/WrappedController.ts
backend/src/index.ts                                (already imports logger)
backend/src/jobs/badgeQueue.ts
backend/src/jobs/badgeWorker.ts
backend/src/jobs/eventSyncWorker.ts
backend/src/jobs/moderationQueue.ts
backend/src/jobs/moderationWorker.ts
backend/src/jobs/notificationQueue.ts
backend/src/jobs/notificationWorker.ts
backend/src/jobs/queue.ts
backend/src/jobs/syncScheduler.ts
backend/src/middleware/auth.ts
backend/src/middleware/checkinRateLimit.ts
backend/src/middleware/perUserRateLimit.ts
backend/src/middleware/validate.ts
backend/src/routes/tokenRoutes.ts
backend/src/scripts/retentionJob.ts                 (background job, MUST migrate)
backend/src/services/AuditService.ts
backend/src/services/BadgeService.ts
backend/src/services/BlockService.ts
backend/src/services/CheckinService.ts
backend/src/services/DataRetentionService.ts
backend/src/services/DiscoveryService.ts
backend/src/services/EventService.ts
backend/src/services/EventSyncService.ts
backend/src/services/FeedService.ts
backend/src/services/FoursquareService.ts
backend/src/services/MusicBrainzService.ts
backend/src/services/NotificationService.ts
backend/src/services/PushNotificationService.ts
backend/src/services/R2Service.ts
backend/src/services/ReviewService.ts
backend/src/services/SetlistFmService.ts
backend/src/services/ShareCardService.ts
backend/src/services/SocialAuthService.ts
backend/src/services/SubscriptionService.ts
backend/src/services/TicketmasterAdapter.ts
backend/src/services/UserService.ts
backend/src/services/checkin/CheckinCreatorService.ts
backend/src/services/checkin/CheckinQueryService.ts
backend/src/services/checkin/CheckinRatingService.ts
backend/src/services/checkin/CheckinToastService.ts
backend/src/utils/auth.ts
backend/src/utils/cache.ts
backend/src/utils/redisRateLimiter.ts
backend/src/utils/sentry.ts
backend/src/utils/websocket.ts
```

**Files to SKIP (test files and CLI scripts): ~11 files**

```
backend/src/__tests__/middleware/auth.test.ts
backend/src/__tests__/services/CheckinService.integration.test.ts
backend/src/scripts/seed-demo.ts
backend/src/scripts/migrate-events-model.ts
backend/src/scripts/seed.ts
backend/src/scripts/migrate.ts
```

### Files Already Using Logger (16 files -- clean up residual console only)

These files already import and use the logger. However, 2 of them (`ShareController.ts`, `index.ts`) also still have residual console statements that should be cleaned up.

```
backend/src/index.ts (MIXED -- has both)
backend/src/controllers/AdminController.ts
backend/src/controllers/ConsentController.ts
backend/src/controllers/FollowController.ts
backend/src/controllers/OnboardingController.ts
backend/src/controllers/PasswordResetController.ts
backend/src/controllers/ReportController.ts
backend/src/controllers/RsvpController.ts
backend/src/controllers/ShareController.ts (MIXED -- has both)
backend/src/controllers/WishlistController.ts
backend/src/routes/socialAuthRoutes.ts
backend/src/services/EmailService.ts
backend/src/services/ImageModerationService.ts
backend/src/services/ModerationService.ts
backend/src/services/PasswordResetService.ts
backend/src/services/ReportService.ts
```

### Migration Strategy

1. **Import pattern**: `import logger from '../utils/logger';` or `import { logError, logInfo, logWarn } from '../utils/logger';`
2. **Test files** (`backend/src/__tests__/`): Exclude from migration -- test files may legitimately use console for debugging
3. **Script files** (`backend/src/scripts/`): Keep console in pure CLI scripts (`seed.ts`, `migrate.ts`, `seed-demo.ts`, `migrate-events-model.ts`); migrate `retentionJob.ts` since it runs as a background process
4. **All other files**: Migrate all console calls to logger equivalents

### Console Statement Patterns Observed

```typescript
// Pattern 1: Simple message (console.log -> logger.info)
console.log('Server running on port', port);

// Pattern 2: Error with object (console.error -> logger.error)
console.error('Failed to create checkin:', error);

// Pattern 3: Warning (console.warn -> logger.warn)
console.warn('Rate limit exceeded for user', userId);

// Pattern 4: Debug/verbose (console.log -> logger.debug)
console.log('Query result:', JSON.stringify(result));
```

### Pitfall: Structured vs Unstructured Arguments

Winston's `logger.error(message, meta)` expects the second argument to be an object for structured logging. Many console.error calls pass the Error object directly:

```typescript
// Current (console):
console.error('Something failed:', error);

// Wrong (winston ignores non-object second args in some cases):
logger.error('Something failed:', error);

// Correct (winston structured):
logger.error('Something failed', { error: error.message, stack: error.stack });
// Or using the convenience wrapper which handles this:
logError('Something failed', error);
```

The convenience wrappers (`logError`, `logInfo`, etc.) accept `any` as the meta parameter, making them safer for migration.

**Confidence:** HIGH -- mechanical change, existing utility, clear patterns.

---

## Common Pitfalls

### Pitfall 1: SQL Injection via Block Filter
**What goes wrong:** Passing unvalidated input to `getBlockFilterSQL()` could enable injection
**Why it happens:** The userId is string-interpolated into SQL
**How to avoid:** `getBlockFilterSQL()` already calls `validateUUID()` internally. Always pass authenticated user IDs only.
**Warning signs:** Passing user-supplied strings directly (not from `req.user.id`)

### Pitfall 2: TOCTOU Race in Idempotency Check
**What goes wrong:** Two concurrent requests both check `owner_response IS NULL`, both see null, both update
**Why it happens:** Check-then-act without atomic operation
**How to avoid:** Use `WHERE owner_response IS NULL` in the UPDATE statement itself (atomic), not a separate SELECT-then-UPDATE
**Warning signs:** Separate read check before write

### Pitfall 3: Winston Meta Argument Shape
**What goes wrong:** Passing non-object second argument to winston loses context
**Why it happens:** `console.error('msg', error)` works but `logger.error('msg', error)` may not serialize properly
**How to avoid:** Use the convenience wrappers (`logError`, etc.) which accept `any`, or always wrap in `{ error }`
**Warning signs:** Direct Error object as second arg to `logger.error()`

### Pitfall 4: Breaking Mobile API Contract (BETA-17)
**What goes wrong:** Renaming `totalCheckins` to `totalReviews` in the API response breaks the mobile app
**Why it happens:** Mobile Dart models use `totalCheckins` field name for JSON deserialization
**How to avoid:** Coordinate backend and mobile changes. Either rename both simultaneously, or keep both fields temporarily.
**Warning signs:** Mobile Freezed models expect exact JSON key names

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Block content filtering | Custom NOT IN subqueries | `BlockService.getBlockFilterSQL()` | Bilateral filtering, UUID validation, tested pattern |
| Structured logging | Custom log wrapper | `backend/src/utils/logger.ts` (winston) | Daily rotation, JSON format, level-based transports |
| HTTP error responses | Manual status codes | `NotFoundError`, `ForbiddenError`, `ConflictError` from `utils/errors.ts` | Consistent error handling pattern |
| Idempotency guards | Application-level locks | SQL WHERE clause guards | Database is the source of truth, atomic |

---

## Architecture Patterns

### Pattern: SQL Fragment Injection for Block Filtering

The codebase uses a composable SQL fragment pattern where `getBlockFilterSQL()` returns an `AND ...` clause that can be appended to any WHERE clause:

```typescript
// In any service with user-generated content queries:
import { BlockService } from './BlockService';

class SomeService {
  private blockService = new BlockService();

  async getContent(userId: string) {
    const result = await this.db.query(`
      SELECT ... FROM content c
      WHERE c.is_active = true
        ${this.blockService.getBlockFilterSQL(userId, 'c.author_id')}
    `, [userId]);
  }
}
```

### Pattern: Convenience Logger Wrappers

The codebase provides both the raw logger instance and convenience functions:

```typescript
// Full logger (for transport-level control):
import logger from '../utils/logger';
logger.info('message', { key: 'value' });

// Convenience wrappers (for simple cases):
import { logError, logInfo, logWarn } from '../utils/logger';
logError('Something failed', error);
```

### Pattern: Atomic Idempotency via SQL WHERE

Instead of check-then-act, use the database UPDATE with a WHERE guard:

```typescript
const result = await this.db.query(
  `UPDATE table SET col = $1 WHERE id = $2 AND col IS NULL RETURNING *`,
  [value, id]
);
if (result.rowCount === 0) {
  throw new ConflictError('Already set');
}
```

---

## Open Questions

1. **BETA-17 direction: rename field or change what it counts?**
   - What we know: The DB column `total_reviews` counts reviews. The API field `totalCheckins` is mislabeled.
   - What's unclear: Whether the product intent is to show review count or actual checkin count on venue/band cards
   - Recommendation: Rename to `totalReviews` since that's what the data actually represents. If actual checkin counts are wanted, that's a separate feature.

2. **Script files in BETA-19 scope**
   - What we know: 5 script files have ~115 console statements total
   - What's unclear: Whether CLI scripts should use logger or keep console for terminal output
   - Recommendation: Keep console in pure CLI scripts (`seed.ts`, `migrate.ts`, `seed-demo.ts`, `migrate-events-model.ts`); migrate `retentionJob.ts` since it runs as a background process

---

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all referenced files
- `backend/src/services/WrappedService.ts` -- getFriendOverlap implementation (lines 262-285)
- `backend/src/services/BlockService.ts` -- getBlockFilterSQL pattern (lines 130-138)
- `backend/src/services/ReviewService.ts` -- respondToReview implementation (lines 502-541)
- `backend/src/services/VenueService.ts` -- mapDbVenueToVenue mismatch (line 413)
- `backend/src/services/BandService.ts` -- mapDbBandToBand mismatch (line 405)
- `backend/src/services/SearchService.ts` -- mapBand/mapVenue mismatches (lines 192, 222)
- `backend/src/utils/logger.ts` -- winston logger utility (119 lines)
- `backend/src/utils/errors.ts` -- error classes including ConflictError (line 64)
- `backend/src/types/index.ts` -- TypeScript type definitions (Venue line 65, Band line 105, Review lines 125-145)
- `backend/database-schema.sql` -- original schema (total_checkins column, lines 57, 81)
- `backend/migrations/036_review-owner-response.ts` -- owner_response schema
- `mobile/lib/src/features/venues/presentation/venue_detail_screen.dart` -- mobile UI labels (line 454)
- `mobile/lib/src/features/bands/presentation/band_detail_screen.dart` -- mobile UI labels (line 386)

## Metadata

**Confidence breakdown:**
- BETA-16 (Block filter): HIGH -- established pattern, exact insertion point identified
- BETA-17 (Semantic mismatch): HIGH -- full mapping chain documented, all affected files identified
- BETA-18 (Idempotency guard): HIGH -- clear implementation, ConflictError available, atomic fix designed
- BETA-19 (Console migration): HIGH -- full census of 455 statements across 69 files, existing utility documented

**Research date:** 2026-03-01
**Valid until:** 2026-03-31 (stable codebase, no expected dependency changes)
