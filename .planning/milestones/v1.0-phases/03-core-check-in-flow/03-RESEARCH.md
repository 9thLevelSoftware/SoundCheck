# Phase 3: Core Check-in Flow - Research

**Researched:** 2026-02-02
**Domain:** Event-based check-in system (backend API redesign + Flutter mobile UX + cloud photo storage)
**Confidence:** HIGH

## Summary

Phase 3 redesigns the check-in experience from a band+venue selection flow into an event-first quick-tap flow. The current codebase has a working CheckinService with dual-write columns (old + new) and a Flutter check-in screen that follows a band-search-first pattern. The redesign must flip this to event-first with GPS auto-suggest, make check-in a single tap with optional enrichment afterward, add per-set band ratings, location verification, and cloud photo upload via Cloudflare R2.

The backend already has the schema infrastructure from Phase 1 (events table, event_lineup, checkin_band_ratings, venue_rating column, image_urls array, is_verified flag) and Phase 2 (events populated from Ticketmaster + user-created events). The main work is: (1) rewriting CheckinService to be event-centric with validation logic, (2) adding a nearby-events endpoint using existing venue lat/lon data with Haversine, (3) building the R2 presigned URL upload pipeline, and (4) completely redesigning the Flutter check-in screen from band-search-first to event-suggest-first.

**Primary recommendation:** Build the backend check-in redesign first (event-centric create, nearby events endpoint, per-set ratings, location verification, time window validation, uniqueness enforcement), then the photo upload pipeline (R2 presigned URLs), then the Flutter mobile redesign (event auto-suggest, quick tap, enrichment bottom sheets).

## Standard Stack

The established libraries/tools for this domain:

### Core (Backend)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @aws-sdk/client-s3 | ^3.x | Cloudflare R2 S3-compatible client | Official Cloudflare recommendation for Node.js |
| @aws-sdk/s3-request-presigner | ^3.x | Generate presigned upload/download URLs | Required companion for client-s3 presigned URLs |
| express (existing) | ^4.21 | HTTP routes for new endpoints | Already in stack |
| pg (existing) | ^8.16 | PostgreSQL queries with Haversine | Already in stack |
| zod (existing) | ^3.25 | Request body validation for new endpoints | Already in stack |
| multer (existing) | ^2.0 | NOT used for R2 uploads (presigned URLs instead) | Only for fallback local upload |

### Core (Mobile/Flutter)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| geolocator (existing) | ^14.0 | GPS position for nearby event auto-suggest | Already in pubspec |
| image_picker (existing) | ^1.1 | Camera/gallery photo selection | Already in pubspec |
| flutter_image_compress (existing) | ^2.4 | Client-side image compression before upload | Already in pubspec |
| dio (existing) | ^5.4 | HTTP client for presigned URL PUT upload | Already in pubspec |
| flutter_riverpod (existing) | ^3.1 | State management for check-in flow | Already in pubspec |
| flutter_rating_bar | ^4.0 | Half-star rating widget (0.5 increments) | Most popular Flutter rating package, supports allowHalfRating |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| path (Node.js built-in) | - | File extension extraction for upload keys | Presigned URL key generation |
| crypto (Node.js built-in) | - | Random filename generation for uploads | Already used in upload.ts middleware |
| uuid (existing) | - | UUID generation via PostgreSQL uuid_generate_v4() | Checkin IDs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @aws-sdk/client-s3 | aws4fetch | Lighter but only for Workers/edge; Node.js on Railway should use full SDK |
| flutter_rating_bar | Custom widget | Existing _RatingSelector already has stars, but lacks half-star tap detection; package is more reliable |
| Cloudflare R2 | AWS S3 | R2 has zero egress fees, S3-compatible API; R2 is specified in PLSH-05 |

**Installation (backend):**
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**Installation (mobile):**
```bash
flutter pub add flutter_rating_bar
```

## Architecture Patterns

### Backend: New Endpoint Structure

```
POST   /api/checkins                    # Redesigned: event_id required, bandId/venueId optional
PATCH  /api/checkins/:id/ratings        # NEW: add/update per-set band ratings + venue rating
POST   /api/checkins/:id/photos         # NEW: request presigned upload URL(s)
GET    /api/events/nearby               # NEW: events near GPS coords, today/tonight, with lineup
GET    /api/uploads/presign             # NEW: generic presigned URL endpoint for R2
```

### Backend: CheckinService Redesign

The current `createCheckin` takes `{venueId, bandId, rating, ...}` and derives event_id internally. The redesign flips this:

**Current flow (Phase 1 dual-write):**
```
Client sends: {venueId, bandId, rating}
Server: findOrCreateEvent(venueId, bandId, date) -> eventId
Server: INSERT checkins with both old + new columns
```

**New flow (Phase 3 event-first):**
```
Client sends: {eventId, locationLat, locationLon}
Server: validate event exists and is active
Server: validate time window (doors_time - end_time + buffer)
Server: validate uniqueness (one per user per event)
Server: verify location (Haversine distance to venue, non-blocking)
Server: INSERT checkin with event_id, is_verified based on location
Server: return checkin (client can then add ratings/photos via PATCH)
```

### Backend: Nearby Events Query Pattern

The VenueService already has `getVenuesNear()` with Haversine formula. The new `getNearbyEvents` endpoint should follow the same pattern but join through events:

```sql
SELECT e.*, v.name as venue_name, v.latitude, v.longitude,
       (6371 * acos(cos(radians($1)) * cos(radians(v.latitude)) *
        cos(radians(v.longitude) - radians($2)) +
        sin(radians($1)) * sin(radians(v.latitude)))) AS distance
FROM events e
JOIN venues v ON e.venue_id = v.id
WHERE e.event_date = CURRENT_DATE
  AND e.is_cancelled = FALSE
  AND v.latitude IS NOT NULL
  AND v.longitude IS NOT NULL
HAVING distance <= $3
ORDER BY distance ASC
LIMIT $4
```

### Backend: Location Verification Logic

Non-blocking check comparing user's GPS to venue coordinates:

```typescript
function verifyLocation(
  userLat: number, userLon: number,
  venueLat: number, venueLon: number,
  venueType: string
): boolean {
  const radiusKm = getRadiusForVenueType(venueType);
  const distanceKm = haversineDistance(userLat, userLon, venueLat, venueLon);
  return distanceKm <= radiusKm;
}

function getRadiusForVenueType(venueType: string): number {
  // Configurable per venue type
  switch (venueType) {
    case 'stadium': case 'arena': return 2.0;    // Large venues
    case 'outdoor': return 1.5;                   // Outdoor festivals
    case 'concert_hall': case 'theater': return 0.5;
    case 'club': case 'bar': return 0.3;          // Small venues
    default: return 1.0;
  }
}
```

### Backend: Time Window Validation

Check-in must be within event time window. Events have `doors_time`, `start_time`, `end_time` as TIME columns, and `event_date` as DATE:

```typescript
function isWithinTimeWindow(event: Event, bufferMinutes: number = 60): boolean {
  const now = new Date();
  const eventDate = new Date(event.eventDate);

  // Same day check
  if (now.toDateString() !== eventDate.toDateString()) return false;

  // If doors_time exists, allow from doors_time
  // If only start_time, allow from 2h before start
  // Allow until end_time + buffer (or 4h after start if no end_time)
  const windowStart = event.doorsTime
    ? combineDateTime(eventDate, event.doorsTime)
    : subtractHours(combineDateTime(eventDate, event.startTime || '18:00'), 2);

  const windowEnd = event.endTime
    ? addMinutes(combineDateTime(eventDate, event.endTime), bufferMinutes)
    : addHours(combineDateTime(eventDate, event.startTime || '18:00'), 6);

  return now >= windowStart && now <= windowEnd;
}
```

### Backend: Photo Upload Pipeline (Presigned URLs)

```
Mobile App                    Backend (Railway)              Cloudflare R2
    |                              |                              |
    |-- POST /api/uploads/presign->|                              |
    |   {contentType, count}       |                              |
    |                              |-- getSignedUrl(PutObject) -->|
    |                              |<-- presigned URL ------------|
    |<-- {uploadUrl, objectKey} ---|                              |
    |                              |                              |
    |-- PUT uploadUrl ------------>|                              |
    |   (direct to R2)            |                              |
    |                              |                              |
    |-- PATCH /api/checkins/:id/photos -->|                       |
    |   {photoKeys: [...]}         |-- UPDATE image_urls -------->|
    |<-- success ------------------|                              |
```

### Mobile: Redesigned Check-in Flow

```
App Open -> Auto-fetch GPS location
         -> GET /api/events/nearby?lat=X&lng=Y
         -> Display event cards sorted by distance

User taps event -> POST /api/checkins {eventId, lat, lon}
               -> Check-in confirmed (single tap!)
               -> Show success with enrichment options

Optional enrichment (bottom sheets):
  - Rate bands (per-set): half-star rating for each band in lineup
  - Rate venue: half-star rating
  - Add photo: camera/gallery -> compress -> presigned URL -> R2
  - Add comment: text field
```

### Recommended Project Structure (New Files)

```
backend/src/
  services/
    CheckinService.ts         # REWRITE: event-first, validation logic
    R2Service.ts              # NEW: Cloudflare R2 presigned URL generation
  routes/
    checkinRoutes.ts          # UPDATE: add PATCH /ratings, POST /photos
    uploadRoutes.ts           # NEW: presigned URL endpoint (or extend existing)
  migrations/
    018_add-checkin-indexes.ts # NEW: indexes for nearby events, time windows

mobile/lib/src/
  features/checkins/
    presentation/
      checkin_screen.dart       # REWRITE: event-first quick tap
      rating_bottom_sheet.dart  # NEW: per-set band + venue rating
      photo_upload_sheet.dart   # NEW: camera/gallery -> R2 upload
    data/
      checkin_repository.dart   # UPDATE: new endpoints
      upload_repository.dart    # NEW: presigned URL + R2 direct upload
    domain/
      checkin.dart              # UPDATE: add per-set ratings, photo URLs
      nearby_event.dart         # NEW: event with distance for auto-suggest
```

### Anti-Patterns to Avoid
- **Proxying photo uploads through backend:** Use presigned URLs for direct mobile-to-R2 upload. Never proxy large files through Railway.
- **Blocking on location verification:** Location check must be non-blocking. Set is_verified flag but never reject a check-in due to GPS failure.
- **Rating required at check-in time:** Check-in must be a single tap. All enrichment (ratings, photos, comments) is optional and added afterward.
- **Client-side time window enforcement:** The server must validate time windows, not the client. Client can hide expired events from UI but server is the authority.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Half-star rating widget | Custom star touch detection | `flutter_rating_bar` package | Half-star gesture detection (left half = 0.5, right half = 1.0) is tricky with touch targets; package handles it correctly |
| S3-compatible presigned URLs | Custom HMAC-SHA256 signing | `@aws-sdk/s3-request-presigner` | AWS Signature V4 is complex with exact header canonicalization; one wrong step = 403 |
| Haversine distance calculation | Custom formula per query | Extract into a SQL function or reuse VenueService pattern | Already proven in VenueService.getVenuesNear(); copy the pattern exactly |
| Image compression before upload | Server-side resize | `flutter_image_compress` (already in pubspec) | Compress on device before upload saves bandwidth and R2 storage; already a dependency |
| GPS permissions flow | Custom permission UI | Existing `LocationService` + `geolocator` | Already handles all permission states, service disabled, denied forever, etc. |

**Key insight:** The biggest "don't hand-roll" risk in this phase is the presigned URL signing. Use the official AWS SDK v3 packages. They handle the complex signature calculation, URL encoding, and header canonicalization that R2 requires. Custom signing code is the #1 cause of 403 errors with S3-compatible APIs.

## Common Pitfalls

### Pitfall 1: DECIMAL(2,1) Rating Overflow
**What goes wrong:** DECIMAL(2,1) allows values from -9.9 to 9.9 but CHECK constraint limits to 0.5-5.0. If rating = 5.0, that's stored correctly. But note DECIMAL(2,1) means "2 total digits, 1 decimal" = max 9.9. A rating of 5.0 = "2 digits total" which fits. However, be careful with SUM/AVG aggregations that could produce values > 9.9.
**Why it happens:** Confusion between DECIMAL precision and scale.
**How to avoid:** The existing CHECK constraint (`rating >= 0.5 AND rating <= 5.0`) on checkin_band_ratings is correct. Use the same constraint for venue_rating. For aggregations, cast to DECIMAL(3,2) or NUMERIC.
**Warning signs:** Rating insert fails with "numeric field overflow."

### Pitfall 2: Time Window Validation Without Timezone
**What goes wrong:** Event has `event_date` (DATE) and `doors_time`/`start_time`/`end_time` (TIME). Server runs in UTC. Comparing `new Date()` (UTC) against doors_time (local venue time) gives wrong results.
**Why it happens:** TIME columns don't carry timezone info. Venues have a `timezone` column (IANA format) from migration 006.
**How to avoid:** When validating time windows, combine event_date + doors_time in the venue's timezone, then compare against UTC now. Use `AT TIME ZONE venue.timezone` in SQL or a Node.js timezone library.
**Warning signs:** Check-ins rejected as "outside time window" when user is at the venue.

### Pitfall 3: Partial Unique Index for One-Per-Event
**What goes wrong:** Migration 004 created `idx_unique_user_event_checkin` as a PARTIAL index with `WHERE event_id IS NOT NULL`. This means old check-ins without event_id are excluded. But new check-ins MUST have event_id, so the partial index works correctly for Phase 3 forward.
**Why it happens:** Phase 1 made event_id nullable for backward compat.
**How to avoid:** The new CheckinService must require event_id. The existing partial unique index correctly enforces one-per-user-per-event for all new check-ins. No schema change needed.
**Warning signs:** Duplicate check-ins for the same user+event.

### Pitfall 4: Presigned URL Content-Type Mismatch
**What goes wrong:** Server generates presigned URL with `ContentType: 'image/jpeg'`, client uploads with `Content-Type: 'image/png'`. R2 returns 403 SignatureDoesNotMatch.
**Why it happens:** Presigned URL signature includes Content-Type. Mismatches invalidate the signature.
**How to avoid:** Client sends the actual content type when requesting the presigned URL. Server includes that exact content type in the PutObjectCommand. Client must send the matching Content-Type header on the PUT upload.
**Warning signs:** 403 errors on direct upload to R2 despite valid presigned URL.

### Pitfall 5: Photo Upload Before Check-in Exists
**What goes wrong:** User takes a photo during check-in flow but the check-in hasn't been created yet. Where do we store the photo URL?
**Why it happens:** In the new flow, check-in is created first (single tap), then photos are added. But the old flow tried to do everything at once.
**How to avoid:** Two-step flow: (1) Create check-in with POST, get checkin_id back, (2) Upload photos via presigned URL, (3) PATCH checkin with photo keys. Photos are always attached to an existing check-in.
**Warning signs:** Orphaned photos in R2 with no associated check-in.

### Pitfall 6: Railway Ephemeral Filesystem
**What goes wrong:** Saving uploaded photos to Railway's local filesystem (`uploads/` directory). Files disappear on next deploy.
**Why it happens:** Railway uses ephemeral containers. The existing `upload.ts` middleware saves to `uploads/profiles/` which is volatile.
**How to avoid:** Use Cloudflare R2 with presigned URLs for ALL photo storage. Never write user uploads to the local filesystem. This is explicitly called out in PLSH-05.
**Warning signs:** Profile images or check-in photos disappear after deploy.

### Pitfall 7: Missing Location Data on Venues
**What goes wrong:** Nearby events query returns zero results because venue records have NULL latitude/longitude.
**Why it happens:** User-created venues or venues from Foursquare without coordinates.
**How to avoid:** The nearby events query already filters `WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL`. This correctly excludes venues without coordinates. Events at those venues simply won't appear in "nearby" suggestions but can still be found via search.
**Warning signs:** User is at a venue but doesn't see the event in nearby suggestions.

### Pitfall 8: Dual-Write Backward Compatibility
**What goes wrong:** Phase 3 stops writing to old columns (band_id, venue_id, rating, comment, photo_url, event_date) but old mobile clients still expect them.
**Why it happens:** Breaking change in API response format.
**How to avoid:** Continue populating backward-compat fields in the response mapper (bandId, band, showDate from headliner). The existing `mapDbCheckinToCheckin` already does this. New mobile code reads from event/lineup data; old mobile code reads from compat fields.
**Warning signs:** Old mobile versions show blank check-in details.

## Code Examples

Verified patterns from the existing codebase and official sources:

### Nearby Events Query (Backend)
```typescript
// Source: Adapted from VenueService.getVenuesNear() pattern
async getNearbyEvents(lat: number, lon: number, radiusKm: number = 10, limit: number = 20) {
  const query = `
    SELECT e.*, v.name as venue_name, v.city as venue_city, v.state as venue_state,
           v.latitude as venue_lat, v.longitude as venue_lon, v.venue_type,
           (6371 * acos(cos(radians($1)) * cos(radians(v.latitude)) *
            cos(radians(v.longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(v.latitude)))) AS distance_km
    FROM events e
    JOIN venues v ON e.venue_id = v.id
    WHERE e.event_date = CURRENT_DATE
      AND e.is_cancelled = FALSE
      AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
      AND (6371 * acos(cos(radians($1)) * cos(radians(v.latitude)) *
           cos(radians(v.longitude) - radians($2)) +
           sin(radians($1)) * sin(radians(v.latitude)))) <= $3
    ORDER BY distance_km ASC
    LIMIT $4
  `;
  return this.db.query(query, [lat, lon, radiusKm, limit]);
}
```

### R2 Presigned URL Service (Backend)
```typescript
// Source: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

export class R2Service {
  private s3: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    this.bucket = process.env.R2_BUCKET_NAME || 'soundcheck-photos';
    this.publicUrl = process.env.R2_PUBLIC_URL || '';
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    });
  }

  async getPresignedUploadUrl(contentType: string, prefix: string = 'checkins'): Promise<{
    uploadUrl: string;
    objectKey: string;
    publicUrl: string;
  }> {
    const ext = contentType.split('/')[1] || 'jpg';
    const objectKey = `${prefix}/${crypto.randomBytes(16).toString('hex')}.${ext}`;

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn: 600 } // 10 minutes
    );

    return {
      uploadUrl,
      objectKey,
      publicUrl: `${this.publicUrl}/${objectKey}`,
    };
  }
}
```

### Flutter Half-Star Rating Widget
```dart
// Source: flutter_rating_bar package (pub.dev/packages/flutter_rating_bar)
// Add to pubspec.yaml: flutter_rating_bar: ^4.0.1
import 'package:flutter_rating_bar/flutter_rating_bar.dart';

RatingBar.builder(
  initialRating: 0,
  minRating: 0.5,
  direction: Axis.horizontal,
  allowHalfRating: true,  // Enables 0.5 increments
  itemCount: 5,
  itemSize: 40,
  unratedColor: AppTheme.ratingInactive,
  itemBuilder: (context, _) => const Icon(
    Icons.star,
    color: AppTheme.electricPurple,
  ),
  onRatingUpdate: (rating) {
    // rating is 0.5, 1.0, 1.5, ... 5.0
    setState(() => _bandRating = rating);
  },
)
```

### Flutter Direct-to-R2 Upload
```dart
// Source: Standard Dio PUT to presigned URL pattern
Future<String?> uploadPhotoToR2(XFile photo) async {
  // 1. Compress image
  final compressed = await FlutterImageCompress.compressWithFile(
    photo.path,
    quality: 85,
    minWidth: 1920,
    minHeight: 1080,
  );
  if (compressed == null) return null;

  // 2. Get presigned URL from backend
  final contentType = photo.mimeType ?? 'image/jpeg';
  final presignResponse = await _dioClient.post(
    '/uploads/presign',
    data: {'contentType': contentType},
  );
  final uploadUrl = presignResponse.data['data']['uploadUrl'];
  final publicUrl = presignResponse.data['data']['publicUrl'];

  // 3. PUT directly to R2 via presigned URL
  await Dio().put(
    uploadUrl,
    data: Stream.fromIterable([compressed]),
    options: Options(
      headers: {
        'Content-Type': contentType,
        'Content-Length': compressed.length,
      },
    ),
  );

  return publicUrl;
}
```

### Unique Check-in Enforcement (Backend)
```typescript
// The partial unique index from migration 004 handles this at DB level:
// CREATE UNIQUE INDEX idx_unique_user_event_checkin ON checkins(user_id, event_id)
// WHERE event_id IS NOT NULL;
//
// Catch the unique constraint violation in service layer:
try {
  const result = await this.db.query(insertQuery, params);
  return result.rows[0];
} catch (error: any) {
  if (error.code === '23505' && error.constraint === 'idx_unique_user_event_checkin') {
    throw new Error('You have already checked in to this event');
  }
  throw error;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Band+venue check-in | Event-first check-in | Phase 3 (now) | Client sends eventId not bandId+venueId |
| Single rating | Dual rating (band + venue) + per-set | Phase 1 schema | Schema ready, service needs rewrite |
| Local filesystem uploads | Presigned URL direct-to-R2 | Phase 3 (now) | Railway ephemeral filesystem is unreliable |
| multer disk storage | @aws-sdk presigned URLs | Phase 3 (now) | Server never touches the file bytes |
| Band search first | GPS event auto-suggest first | Phase 3 (now) | 10-second check-in target requires event suggestion |
| Rating required for check-in | Check-in first, rate later | Phase 3 (now) | Single-tap check-in, enrichment optional |

**Deprecated/outdated:**
- `CreateCheckinRequest.bandId` + `venueId` as required fields: These become optional (derived from event)
- `upload.ts` multer middleware for profile images: Should migrate to R2 in Phase 8 polish; for now, focus on check-in photos
- Vibe tags in check-in form: Still supported but de-emphasized in new quick-tap flow
- Hardcoded venue list in `_VenueSearchSheet`: Must be replaced with real API-backed venue search

## Open Questions

Things that couldn't be fully resolved:

1. **R2 Public URL Configuration**
   - What we know: R2 supports custom domains for public access, or you can use the R2.dev URL
   - What's unclear: Whether to use a custom domain (cdn.soundcheck.app) or R2.dev subdomain for photo URLs stored in image_urls column
   - Recommendation: Use environment variable `R2_PUBLIC_URL` so it can be changed without code. Start with R2.dev for dev, custom domain for prod.

2. **Backward Compat for Old Mobile Clients**
   - What we know: Current mobile app sends `{bandId, venueId, rating}` to POST /api/checkins. New flow sends `{eventId, lat, lon}`.
   - What's unclear: Whether old mobile clients are still in the wild (App Store version).
   - Recommendation: Support both request formats in the new CheckinService. If `eventId` is present, use new flow. If `bandId + venueId` is present, fall back to findOrCreateEvent (existing dual-write behavior). This is low-cost insurance.

3. **Event Time Window for Events Without Times**
   - What we know: User-created events may not have doors_time/start_time/end_time. Ticketmaster events usually have at least start_time.
   - What's unclear: What time window to use for events with no time data.
   - Recommendation: Default to all-day window (00:00 to 23:59 on event_date) for events without time data. This is the most permissive approach and avoids rejecting legitimate check-ins.

4. **CORS Configuration for R2**
   - What we know: Native mobile apps (iOS/Android via Flutter) do NOT enforce CORS like browsers do. Direct PUT to R2 from a native app should work without CORS configuration.
   - What's unclear: Whether any Flutter HTTP client implementation adds Origin headers that would trigger CORS checks on R2.
   - Recommendation: Configure R2 CORS policy with `AllowedOrigins: ["*"]` and `AllowedMethods: ["PUT", "GET"]` as a safety net. It costs nothing and prevents unexpected issues.

5. **Rate Limiting for Presigned URL Endpoint**
   - What we know: Each presigned URL request generates a unique upload URL. A bad actor could spam this endpoint to generate thousands of R2 keys.
   - What's unclear: Whether existing rate limiting middleware is sufficient or if a more aggressive per-user limit is needed.
   - Recommendation: Apply existing rate limiter plus a per-user limit (e.g., max 10 presigned URLs per hour per user). This matches the 4-photo limit on check-ins.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: CheckinService.ts, EventService.ts, CheckinController.ts, EventController.ts, VenueService.ts
- Codebase analysis: migrations 002-006 (events table, checkin columns, band ratings, venue timezone)
- Codebase analysis: Flutter checkin_screen.dart, checkin.dart domain model, checkin_repository.dart, providers
- Codebase analysis: LocationService.dart, providers.dart (location providers)
- [Cloudflare R2 aws-sdk-js-v3 docs](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) - Presigned URL patterns
- [Cloudflare R2 Presigned URL docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) - Signing requirements
- [Cloudflare R2 CORS docs](https://developers.cloudflare.com/r2/buckets/cors/) - CORS configuration

### Secondary (MEDIUM confidence)
- [flutter_rating_bar on pub.dev](https://pub.dev/packages/flutter_rating_bar) - Half-star rating widget
- [geolocator on pub.dev](https://pub.dev/packages/geolocator) - GPS position API
- [Ruan Martinelli R2 presigned URL guide](https://ruanmartinelli.com/blog/cloudflare-r2-pre-signed-urls/) - Implementation walkthrough
- [Railway vs Cloudflare architecture](https://blog.railway.com/p/railway-vs-cloudflare-how-their-architectures-differ-and-when-to-use-each)

### Tertiary (LOW confidence)
- WebSearch results for "Flutter nearby events GPS auto-suggest" - No specific pattern found; will use standard geolocator + API pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All core libraries are either already in the project or are official Cloudflare recommendations
- Architecture: HIGH - Patterns derived directly from existing codebase (VenueService Haversine, CheckinService dual-write) and official R2 docs
- Pitfalls: HIGH - Most pitfalls identified from direct codebase analysis (DECIMAL types, timezone handling, ephemeral filesystem)
- Photo upload (R2): HIGH - Official Cloudflare documentation with exact code examples
- Mobile UX flow: MEDIUM - Based on requirements analysis and existing screen structure; flutter_rating_bar package needs version verification at install time

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (30 days - stable domain, established libraries)
