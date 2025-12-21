# Critical Fixes and Tech Debt Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical API mismatches, security vulnerabilities, and technical debt to prepare PitPulse for production deployment.

**Architecture:** Fix backend/mobile API contract mismatches by aligning field names and response shapes. Harden security by requiring environment variables and tightening CORS. Replace placeholder implementations with working code.

**Tech Stack:** Node.js/Express/TypeScript backend, Flutter/Dart mobile, PostgreSQL database

---

## Phase 1: Critical Issues (Blocking Production)

### Task 1: Fix AdminController PostgreSQL Syntax

**Files:**
- Modify: `backend/src/controllers/AdminController.ts`

**Step 1: Fix query result destructuring**

Replace MySQL-style array destructuring with PostgreSQL `rows` access:

```typescript
// Line 24-28: Replace
const [userCount] = await db.query('SELECT COUNT(*) as count FROM users');
const [venueCount] = await db.query('SELECT COUNT(*) as count FROM venues');
const [bandCount] = await db.query('SELECT COUNT(*) as count FROM bands');
const [reviewCount] = await db.query('SELECT COUNT(*) as count FROM reviews');
const [checkinCount] = await db.query('SELECT COUNT(*) as count FROM checkins');

// With
const userCountResult = await db.query('SELECT COUNT(*) as count FROM users');
const venueCountResult = await db.query('SELECT COUNT(*) as count FROM venues');
const bandCountResult = await db.query('SELECT COUNT(*) as count FROM bands');
const reviewCountResult = await db.query('SELECT COUNT(*) as count FROM reviews');
const checkinCountResult = await db.query('SELECT COUNT(*) as count FROM checkins');
```

**Step 2: Fix INTERVAL syntax for PostgreSQL**

```typescript
// Line 31-38: Replace MySQL INTERVAL syntax
'SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL 24 HOUR'

// With PostgreSQL syntax
'SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL \'24 hours\''
```

Apply same fix to lines 34-35 and 37-38 for reviews and checkins.

**Step 3: Fix placeholder syntax**

```typescript
// Line 106: Replace MySQL placeholder
LIMIT ?

// With PostgreSQL placeholder
LIMIT $1
```

**Step 4: Update data access patterns**

```typescript
// Line 51-55: Replace
counts: {
  users: userCount[0].count,
  venues: venueCount[0].count,
  ...
}

// With
counts: {
  users: userCountResult.rows[0].count,
  venues: venueCountResult.rows[0].count,
  bands: bandCountResult.rows[0].count,
  reviews: reviewCountResult.rows[0].count,
  checkins: checkinCountResult.rows[0].count,
}
```

Apply similar fixes for:
- Lines 59-61 (recent24h stats)
- Lines 91-109 (getTopVenues - fix placeholder and result access)
- Lines 149-177 (getUserActivity - fix placeholder and result access)
- Lines 161-164 (activity counts)
- Lines 167-178 (recentReviews)
- Lines 294-305 (moderateContent queries)

**Step 5: Run backend tests**

Run: `cd backend && npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add backend/src/controllers/AdminController.ts
git commit -m "fix(admin): convert MySQL syntax to PostgreSQL

- Fix array destructuring to use .rows accessor
- Convert INTERVAL 24 HOUR to INTERVAL '24 hours'
- Replace ? placeholders with $1, $2 format"
```

---

### Task 2: Fix Auth Contract - Backend Returns Token on Register

**Files:**
- Modify: `backend/src/controllers/UserController.ts`
- Modify: `backend/src/services/UserService.ts`

**Step 1: Update UserService.createUser to return AuthResponse**

```typescript
// In UserService.ts, change createUser return type and implementation
// Line 12: Change signature
async createUser(userData: CreateUserRequest): Promise<AuthResponse> {

// After line 44 (after getting user from INSERT), add token generation:
    const user = mapDbUserToUser(result.rows[0]);

    // Generate JWT token for new user
    const token = AuthUtils.generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    return {
      user,
      token,
    };
```

**Step 2: Update UserController.register to return AuthResponse**

```typescript
// In UserController.ts, line 20-24: Change
const user = await this.userService.createUser(userData);

const response: ApiResponse = {
  success: true,
  data: user,

// To
const authResponse = await this.userService.createUser(userData);

const response: ApiResponse = {
  success: true,
  data: authResponse,
```

**Step 3: Run backend tests**

Run: `cd backend && npm test`
Expected: All tests pass (may need to update registration tests)

**Step 4: Commit**

```bash
git add backend/src/controllers/UserController.ts backend/src/services/UserService.ts
git commit -m "fix(auth): return token with user on registration

Mobile expects AuthResponse with token on register, matching login behavior"
```

---

### Task 3: Fix Auth Contract - Mobile getMe/updateProfile Wrapper Parsing

**Files:**
- Modify: `mobile/lib/src/features/auth/data/auth_repository.dart`

**Step 1: Fix getMe to unwrap API response**

```dart
// Line 106-113: Replace
Future<User> getMe() async {
  try {
    final response = await _dioClient.get('${ApiConfig.auth}/me');
    return User.fromJson(response.data);

// With
Future<User> getMe() async {
  try {
    final response = await _dioClient.get('${ApiConfig.auth}/me');
    // Extract data from API wrapper: {success, data, message}
    final data = response.data['data'] as Map<String, dynamic>;
    return User.fromJson(data);
```

**Step 2: Fix updateProfile to unwrap API response**

```dart
// Line 116-123: Replace
Future<User> updateProfile(Map<String, dynamic> updates) async {
  try {
    final response = await _dioClient.put(
      '${ApiConfig.auth}/me',
      data: updates,
    );

    final user = User.fromJson(response.data);

// With
Future<User> updateProfile(Map<String, dynamic> updates) async {
  try {
    final response = await _dioClient.put(
      '${ApiConfig.auth}/me',
      data: updates,
    );

    // Extract data from API wrapper: {success, data, message}
    final data = response.data['data'] as Map<String, dynamic>;
    final user = User.fromJson(data);
```

**Step 3: Run Flutter tests**

Run: `cd mobile && flutter test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add mobile/lib/src/features/auth/data/auth_repository.dart
git commit -m "fix(mobile/auth): unwrap API response in getMe and updateProfile

Backend wraps all responses in {success, data, message} format"
```

---

### Task 4: Fix Check-in Contract Mismatch

**Files:**
- Modify: `mobile/lib/src/features/checkins/data/checkin_repository.dart`
- Modify: `mobile/lib/src/core/api/api_config.dart`

**Step 1: Fix CreateCheckInRequest to match backend**

```dart
// Lines 9-34: Replace CreateCheckInRequest class
class CreateCheckInRequest {
  final String bandId;
  final String venueId;
  final String eventDate;  // Changed from rating
  final double? venueRating;  // Renamed and made optional
  final double? bandRating;   // Added
  final String? reviewText;   // Renamed from comment
  final List<String>? imageUrls;  // Renamed from photoUrl, now a list
  final List<String>? vibeTagIds;

  CreateCheckInRequest({
    required this.bandId,
    required this.venueId,
    required this.eventDate,
    this.venueRating,
    this.bandRating,
    this.reviewText,
    this.imageUrls,
    this.vibeTagIds,
  });

  Map<String, dynamic> toJson() => {
        'bandId': bandId,
        'venueId': venueId,
        'eventDate': eventDate,
        if (venueRating != null) 'venueRating': venueRating,
        if (bandRating != null) 'bandRating': bandRating,
        if (reviewText != null) 'reviewText': reviewText,
        if (imageUrls != null) 'imageUrls': imageUrls,
        if (vibeTagIds != null) 'vibeTagIds': vibeTagIds,
      };
}
```

**Step 2: Fix feed endpoint in ApiConfig**

```dart
// In api_config.dart, line 53: Replace
static const String feed = '/feed';

// With - use checkins/feed route
static const String feed = '/checkins/feed';
```

**Step 3: Fix getFeed to use correct endpoint**

```dart
// In checkin_repository.dart, lines 43-61: Update getFeed
Future<List<CheckIn>> getFeed({
  String filter = 'friends',  // friends, nearby, global
  int limit = 50,
  int offset = 0,
}) async {
  try {
    final response = await _dioClient.get(
      ApiConfig.feed,
      queryParameters: {
        'filter': filter,
        'limit': limit,
        'offset': offset,
      },
    );

    final List<dynamic> data = response.data['data'] as List<dynamic>;
    return data.map((json) => CheckIn.fromJson(json)).toList();
  } catch (e) {
    rethrow;
  }
}
```

**Step 4: Fix addComment to send commentText**

```dart
// Lines 178-189: Replace
Future<CheckInComment> addComment(String checkInId, String comment) async {
  try {
    final response = await _dioClient.post(
      '${ApiConfig.checkins}/$checkInId/comments',
      data: {'comment': comment},  // Wrong field name

// With
Future<CheckInComment> addComment(String checkInId, String comment) async {
  try {
    final response = await _dioClient.post(
      '${ApiConfig.checkins}/$checkInId/comments',
      data: {'commentText': comment},  // Correct field name
```

**Step 5: Run Flutter tests**

Run: `cd mobile && flutter test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add mobile/lib/src/features/checkins/data/checkin_repository.dart mobile/lib/src/core/api/api_config.dart
git commit -m "fix(mobile/checkins): align request/response with backend contract

- CreateCheckInRequest: eventDate instead of rating, reviewText instead of comment
- Feed endpoint: /checkins/feed instead of /feed
- Comments: send commentText instead of comment"
```

---

### Task 5: Fix Venue API Mismatch

**Files:**
- Modify: `mobile/lib/src/features/venues/data/venue_repository.dart`

**Step 1: Fix getNearbyVenues parameter names**

```dart
// Lines 79-94: Replace
Future<List<Venue>> getNearbyVenues({
  required double latitude,
  required double longitude,
  double radius = 50,
  int limit = 20,
}) async {
  try {
    final response = await _dioClient.get(
      '${ApiConfig.venues}/near',
      queryParameters: {
        'latitude': latitude,
        'longitude': longitude,

// With - use lat/lng to match backend
Future<List<Venue>> getNearbyVenues({
  required double latitude,
  required double longitude,
  double radius = 50,
  int limit = 20,
}) async {
  try {
    final response = await _dioClient.get(
      '${ApiConfig.venues}/near',
      queryParameters: {
        'lat': latitude,
        'lng': longitude,
```

**Step 2: Fix getVenues rating parameter**

```dart
// Lines 21-34: In queryParams, replace
if (minRating != null) queryParams['minRating'] = minRating;

// With - backend expects 'rating' not 'minRating'
if (minRating != null) queryParams['rating'] = minRating;
```

**Step 3: Run Flutter tests**

Run: `cd mobile && flutter test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add mobile/lib/src/features/venues/data/venue_repository.dart
git commit -m "fix(mobile/venues): align query params with backend API

- Nearby: use lat/lng instead of latitude/longitude
- Search: use rating instead of minRating"
```

---

### Task 6: Fix Band API Mismatch

**Files:**
- Modify: `mobile/lib/src/features/bands/data/band_repository.dart`

**Step 1: Fix getBands to handle paginated response**

```dart
// Lines 11-42: Replace getBands implementation
Future<List<Band>> getBands({
  String? search,
  String? genre,
  String? hometown,
  double? minRating,
  String? sortBy,
  int page = 1,
  int limit = 20,
}) async {
  try {
    final queryParams = <String, dynamic>{
      'page': page,
      'limit': limit,
    };

    if (search != null) queryParams['q'] = search;
    if (genre != null) queryParams['genre'] = genre;
    if (hometown != null) queryParams['hometown'] = hometown;
    if (minRating != null) queryParams['rating'] = minRating;
    if (sortBy != null) queryParams['sort'] = sortBy;

    final response = await _dioClient.get(
      ApiConfig.bands,
      queryParameters: queryParams,
    );

    // Backend returns paginated object: { bands: [...], total, page, totalPages }
    final responseData = response.data['data'] as Map<String, dynamic>;
    final List<dynamic> bands = responseData['bands'] as List<dynamic>;
    return bands.map((json) => Band.fromJson(json)).toList();
  } catch (e) {
    rethrow;
  }
}
```

**Step 2: Run Flutter tests**

Run: `cd mobile && flutter test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add mobile/lib/src/features/bands/data/band_repository.dart
git commit -m "fix(mobile/bands): handle paginated response from backend

Backend returns {bands: [], total, page, totalPages} not a flat array"
```

---

### Task 7: Fix Security - Require JWT Secret

**Files:**
- Modify: `backend/src/utils/auth.ts`

**Step 1: Remove fallback JWT secret and require env var**

```typescript
// Line 5: Replace
const JWT_SECRET: string = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// With
const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is required');
  }
  if (secret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters');
  }
  return secret;
})();
```

**Step 2: Update .env.example if it exists (or create it)**

Create/update `backend/.env.example`:
```
# Required - minimum 32 characters
JWT_SECRET=your-super-secret-jwt-key-at-least-32-chars

# Optional
JWT_EXPIRES_IN=7d
```

**Step 3: Run backend to verify startup fails without secret**

Run: `cd backend && JWT_SECRET= npm start`
Expected: FATAL error about missing JWT_SECRET

**Step 4: Run backend tests with valid secret**

Run: `cd backend && JWT_SECRET=test-secret-at-least-32-characters npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add backend/src/utils/auth.ts backend/.env.example
git commit -m "fix(security): require JWT_SECRET environment variable

- Remove insecure fallback secret
- Enforce minimum 32 character length
- App fails fast on startup if missing"
```

---

### Task 8: Fix Security - Tighten CORS in Production

**Files:**
- Modify: `backend/src/index.ts`

**Step 1: Fix CORS to reject wildcards in production**

```typescript
// Lines 31-54: Replace CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // In development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // In production, require explicit CORS_ORIGIN configuration
    const corsOrigin = process.env.CORS_ORIGIN;
    if (!corsOrigin || corsOrigin === '*') {
      // Log warning but allow - mobile apps have no origin
      console.warn('CORS: No CORS_ORIGIN set, allowing request from:', origin);
      return callback(null, true);
    }

    const allowedOrigins = corsOrigin.split(',').map(o => o.trim());
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Reject unknown origins in production
    console.warn('CORS: Rejected origin:', origin);
    callback(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
};
```

**Step 2: Add startup warning for missing CORS_ORIGIN**

```typescript
// In startServer function, after line 163, add:
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  logWarn('CORS_ORIGIN not set - CORS will allow all origins. Set CORS_ORIGIN for web clients.');
}
```

**Step 3: Run backend tests**

Run: `cd backend && npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add backend/src/index.ts
git commit -m "fix(security): improve CORS handling in production

- Warn when CORS_ORIGIN is not set
- Log rejected origins for debugging
- Still allow mobile apps (no origin header)"
```

---

## Phase 2: Technical Debt

### Task 9: Remove Feed Placeholder Data in Mobile

**Files:**
- Modify: `mobile/lib/src/features/feed/presentation/feed_screen.dart`

**Step 1: Identify and replace placeholder data**

Read the file to find placeholder/mock data patterns and wire up to real CheckInRepository.

**Step 2: Run Flutter tests**

Run: `cd mobile && flutter test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add mobile/lib/src/features/feed/presentation/feed_screen.dart
git commit -m "fix(mobile/feed): wire up feed screen to real API data"
```

---

### Task 10: Remove Discover Placeholder Data in Mobile

**Files:**
- Modify: `mobile/lib/src/features/discover/presentation/discover_screen.dart`

**Step 1: Wire discover screen to real repositories**

Replace placeholder data with calls to VenueRepository and BandRepository.

**Step 2: Run Flutter tests**

Run: `cd mobile && flutter test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add mobile/lib/src/features/discover/presentation/discover_screen.dart
git commit -m "fix(mobile/discover): wire up discover screen to real API data"
```

---

### Task 11: Remove Notifications Placeholder Data

**Files:**
- Modify: `mobile/lib/src/features/notifications/presentation/notifications_screen.dart`

**Step 1: Wire notifications or add "coming soon" UI**

Either connect to backend notifications (if route exists) or add a proper "Coming Soon" state.

**Step 2: Run Flutter tests**

Run: `cd mobile && flutter test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add mobile/lib/src/features/notifications/presentation/notifications_screen.dart
git commit -m "fix(mobile/notifications): replace placeholder with coming soon UI"
```

---

### Task 12: Fix Nearby Feed Filter (Placeholder WHERE 1=1)

**Files:**
- Modify: `backend/src/services/CheckinService.ts`

**Step 1: Add user location parameter to getActivityFeed**

```typescript
// Line 205-210: Update signature to accept location
async getActivityFeed(
  userId: string,
  filter: 'friends' | 'nearby' | 'global' = 'friends',
  options: {
    limit?: number;
    offset?: number;
    latitude?: number;
    longitude?: number;
  } = {}
): Promise<Checkin[]> {
```

**Step 2: Implement nearby filter with Haversine formula**

```typescript
// Line 223-229: Replace nearby placeholder
} else if (filter === 'nearby') {
  const { latitude, longitude } = options;
  if (latitude && longitude) {
    // Use Haversine formula for ~40 mile radius (64.4 km)
    whereClause = `
      WHERE (
        6371 * acos(
          cos(radians($2)) * cos(radians(v.latitude)) *
          cos(radians(v.longitude) - radians($3)) +
          sin(radians($2)) * sin(radians(v.latitude))
        )
      ) <= 64.4
    `;
    params.push(latitude, longitude);
  } else {
    // Fallback to global if no location provided
    whereClause = 'WHERE 1=1';
  }
}
```

**Step 3: Update controller to pass location**

Modify `CheckinController.getActivityFeed` to extract lat/lng from query params and pass to service.

**Step 4: Run backend tests**

Run: `cd backend && npm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add backend/src/services/CheckinService.ts backend/src/controllers/CheckinController.ts
git commit -m "feat(checkins): implement nearby feed filter with Haversine distance

Uses ~40 mile radius when user provides latitude/longitude"
```

---

### Task 13: Add Missing /feed Route (Standalone)

**Files:**
- Modify: `backend/src/index.ts`
- Create: `backend/src/routes/feedRoutes.ts`

**Step 1: Create feedRoutes.ts**

```typescript
import { Router } from 'express';
import { CheckinController } from '../controllers/CheckinController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const checkinController = new CheckinController();

// Alias /feed to /checkins/feed for backwards compatibility
router.use(authenticateToken);
router.get('/', checkinController.getActivityFeed);

export default router;
```

**Step 2: Register route in index.ts**

```typescript
// Add import
import feedRoutes from './routes/feedRoutes';

// Add route after line 101
app.use('/api/feed', feedRoutes);
```

**Step 3: Run backend tests**

Run: `cd backend && npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add backend/src/routes/feedRoutes.ts backend/src/index.ts
git commit -m "feat(api): add /feed route alias for backwards compatibility

Points to same controller as /checkins/feed"
```

---

## Verification

After completing all tasks:

1. **Backend Verification:**
   ```bash
   cd backend
   npm test
   npm run lint
   npm run build
   ```

2. **Mobile Verification:**
   ```bash
   cd mobile
   flutter analyze
   flutter test
   flutter build apk --debug
   ```

3. **Integration Test:**
   - Start backend with valid JWT_SECRET
   - Run mobile app against local backend
   - Test: Register, Login, Create Check-in, View Feed, Toast, Comment

---

## Summary

| Phase | Tasks | Impact |
|-------|-------|--------|
| Phase 1 (Critical) | Tasks 1-8 | Fixes blocking issues |
| Phase 2 (Tech Debt) | Tasks 9-13 | Improves UX and functionality |

**Total: 13 tasks**
