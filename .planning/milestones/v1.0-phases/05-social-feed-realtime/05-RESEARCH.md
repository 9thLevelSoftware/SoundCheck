# Phase 5: Social Feed & Real-time - Research

**Researched:** 2026-02-03
**Domain:** Social feed redesign (tabbed feeds, Redis caching, cursor pagination), real-time WebSocket overlay (Pub/Sub fan-out), push notifications (FCM)
**Confidence:** HIGH

## Summary

Phase 5 transforms the existing simple activity feed into a FOMO-driven social experience with three feed tabs (Friends, Event, Happening Now), real-time WebSocket push for friend check-ins, and Firebase Cloud Messaging push notifications. The codebase is well-positioned: WebSocket infrastructure exists (authenticated connections, rooms, sendToUser, broadcastToRoom), Redis/ioredis is installed and used for caching and BullMQ, the FollowService has the social graph queries, and firebase_core is already in the Flutter app.

The current feed is a single endpoint (`GET /api/feed?filter=friends|nearby|global`) backed by a direct PostgreSQL query with offset-based pagination and no caching. This needs to be redesigned to:

1. **Three distinct feed endpoints** (friends, event, happening-now) with Redis-cached responses and cursor-based pagination
2. **Real-time WebSocket overlay** using Redis Pub/Sub for multi-instance fan-out of check-in events
3. **Push notifications** via Firebase Cloud Messaging with BullMQ-based batching for busy nights

The existing WebSocket server is a good foundation but runs single-instance only (in-process client map). Redis Pub/Sub adds the multi-instance fan-out needed for production scaling. The existing BullMQ infrastructure (queue pattern, worker pattern, Redis connection factory) provides the template for the notification batching queue.

**Primary recommendation:** Build three feed services (FriendsFeed, EventFeed, HappeningNow) as separate query+cache layers. Add a Redis Pub/Sub channel (`checkin:new`) that the CheckinService publishes to on every new check-in. The WebSocket server subscribes to this channel and fans out to connected clients. Push notifications use a BullMQ delayed job with Redis-backed aggregation per user for time-window batching.

## Standard Stack

The established libraries/tools for this domain:

### Core Backend (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ioredis | 5.9.0 | Redis client for Pub/Sub, caching, feed storage | Already installed; supports Pub/Sub with separate subscriber connections |
| bullmq | 5.67.2 | Notification batching queue | Already installed; delayed jobs + deduplication for batching window |
| ws | 8.19.0 | WebSocket server | Already installed; room-based messaging already implemented |
| pg | 8.16.3 | PostgreSQL queries for feed data | Already installed; cursor-based pagination uses row-value comparisons |
| zod | 3.25.76 | Request validation | Already installed; validate cursor tokens, feed params |

### New Backend Dependencies
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| firebase-admin | ^13.6.0 | FCM push notification sending | Send push notifications from backend to mobile devices |

### Core Mobile (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| flutter_riverpod | 3.1.0 | State management | Feed state, unseen counts, tab badges |
| web_socket_channel | 3.0.1 | WebSocket client | Already connected; add new_checkin event handler |
| freezed_annotation | 3.1.0 | Immutable models | Feed item models, HappeningNow grouped models |
| cached_network_image | 3.4.0 | Image caching | User avatars, photo thumbnails in feed cards |
| firebase_core | 4.3.0 | Firebase initialization | Already installed; required by firebase_messaging |

### New Mobile Dependencies
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| firebase_messaging | ^16.1.1 | FCM push notification client | Receive push notifications, manage device token |
| flutter_local_notifications | ^20.0.0 | Foreground notification display | Show notifications when app is in foreground (FCM blocks by default) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Redis Pub/Sub | Redis Streams | Streams add durability but are overkill for ephemeral WebSocket fan-out; Pub/Sub is fire-and-forget which matches the use case |
| BullMQ batching | Simple setTimeout | BullMQ provides persistence across restarts, dedup by jobId, and retry; setTimeout loses state on crash |
| flutter_local_notifications | Just firebase_messaging | FCM blocks foreground display by default on Android; flutter_local_notifications is the standard solution |

**Installation:**
```bash
# Backend
cd backend && npm install firebase-admin

# Mobile
cd mobile && flutter pub add firebase_messaging flutter_local_notifications
```

## Architecture Patterns

### Recommended Backend Structure (New/Modified Files)
```
backend/src/
  services/
    FeedService.ts          # NEW: Redis-cached feed queries (friends, event, happening-now)
    PushNotificationService.ts  # NEW: FCM sending, token management
  controllers/
    FeedController.ts       # NEW: Three feed endpoints + happening-now
  routes/
    feedRoutes.ts           # MODIFIED: Three feed endpoints with cursor pagination
  jobs/
    notificationQueue.ts    # NEW: BullMQ queue for batched push notifications
    notificationWorker.ts   # NEW: BullMQ worker processes batched notifications
  utils/
    websocket.ts            # MODIFIED: Add Redis Pub/Sub subscription for fan-out
    cache.ts                # EXISTING: Already has getCache/setCache/delPattern
  config/
    redis.ts                # MODIFIED: Add Pub/Sub connection factory
  migrations/
    020_add-device-tokens.ts     # NEW: FCM device token storage
    021_add-feed-read-cursors.ts # NEW: Per-user last-read cursor per feed tab
```

### Recommended Mobile Structure (New/Modified Files)
```
mobile/lib/src/
  features/
    feed/
      domain/
        feed_item.dart           # NEW: Freezed model for feed card data
        happening_now_group.dart # NEW: Freezed model for grouped happening-now card
      data/
        feed_repository.dart     # NEW: API calls to three feed endpoints
      presentation/
        feed_screen.dart         # MODIFIED: TabBar with three tabs, badge counts
        widgets/
          feed_card.dart         # NEW: Untappd-style balanced card
          happening_now_card.dart # NEW: Grouped avatars + event card
          new_checkins_banner.dart # NEW: "N new check-ins" tap-to-load banner
        providers/
          feed_providers.dart    # NEW: Per-tab feed state, unseen counts, WebSocket listener
  core/
    services/
      websocket_service.dart  # MODIFIED: Add new_checkin stream, feed event handler
      push_notification_service.dart # NEW: FCM init, token management, foreground handling
```

### Pattern 1: Redis-Cached Feed with Cursor Pagination
**What:** Each feed query first checks Redis for a cached result. On cache miss, queries PostgreSQL, stores in Redis with short TTL, returns to client.
**When to use:** All three feed endpoints (friends, event, happening-now).

```typescript
// FeedService.ts - Cache-aside pattern with cursor pagination
async getFriendsFeed(userId: string, cursor?: string, limit: number = 20) {
  const cacheKey = `feed:friends:${userId}:${cursor || 'head'}`;

  // Check cache first
  const cached = await getCache<FeedPage>(cacheKey);
  if (cached) return cached;

  // Decode cursor: { createdAt: ISO string, id: UUID }
  const cursorData = cursor ? decodeCursor(cursor) : null;

  // Query with row-value comparison for stable pagination
  const query = `
    SELECT c.*, u.username, u.profile_image_url, ...
    FROM checkins c
    JOIN user_followers uf ON c.user_id = uf.following_id
    WHERE uf.follower_id = $1
      ${cursorData ? 'AND (c.created_at, c.id) < ($3, $4)' : ''}
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT $2
  `;

  const params = cursorData
    ? [userId, limit + 1, cursorData.createdAt, cursorData.id]
    : [userId, limit + 1];

  const rows = await db.query(query, params);

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  const nextCursor = rows.length > 0
    ? encodeCursor({ createdAt: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id })
    : null;

  const result = { items: rows.map(mapToFeedItem), nextCursor, hasMore };

  // Cache for 60 seconds (SHORT TTL - feeds are dynamic)
  await setCache(cacheKey, result, 60);

  return result;
}
```

### Pattern 2: Redis Pub/Sub for WebSocket Fan-Out
**What:** When a check-in is created, publish to a Redis Pub/Sub channel. Each server instance subscribes and pushes to local WebSocket clients.
**When to use:** Real-time feed updates across multiple server instances.

```typescript
// Redis Pub/Sub setup - SEPARATE connection from cache/rate-limiter
// ioredis requires a dedicated connection for subscribe mode

// Publisher (in CheckinService or CheckinController after create)
import { getRedis } from '../utils/redisRateLimiter';
const publisher = getRedis(); // reuse existing non-subscriber connection

function publishCheckinEvent(checkin: any, followerIds: string[]) {
  const payload = JSON.stringify({
    type: 'new_checkin',
    checkin: mapToFeedItem(checkin),
    followerIds,  // who should receive this
  });
  publisher?.publish('checkin:new', payload);
}

// Subscriber (in websocket.ts init, one per server instance)
import IORedis from 'ioredis';
const subscriber = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

subscriber.subscribe('checkin:new');
subscriber.on('message', (channel, message) => {
  if (channel === 'checkin:new') {
    const data = JSON.parse(message);
    // Fan out to local WebSocket clients who are followers
    for (const followerId of data.followerIds) {
      sendToUser(followerId, 'new_checkin', data.checkin);
    }
  }
});
```

### Pattern 3: BullMQ Notification Batching
**What:** Instead of sending a push notification for every single friend check-in immediately, accumulate events in Redis for a time window, then send a batched summary.
**When to use:** Push notification trigger for friend check-ins.

```typescript
// Batching pattern:
// 1. On new check-in, RPUSH to user-specific Redis list
// 2. Create a delayed BullMQ job (2-minute window) with jobId dedup
// 3. When job fires, LRANGE + DEL the list, compose summary, send FCM

// Step 1+2: On check-in create
async function enqueueNotificationBatch(followerId: string, checkinData: any) {
  const redis = getRedis();
  const listKey = `notif:batch:${followerId}`;

  // Append to user's pending notifications
  await redis?.rpush(listKey, JSON.stringify(checkinData));
  await redis?.expire(listKey, 300); // 5min safety TTL

  // Enqueue delayed job (dedup: only one per user per window)
  await notificationQueue?.add(
    'send-batch',
    { userId: followerId },
    {
      delay: 120_000, // 2-minute batching window
      jobId: `notif-batch:${followerId}`, // dedup: one job per user
    }
  );
}

// Step 3: Worker processes batch
async function processBatch(job: Job) {
  const { userId } = job.data;
  const redis = getRedis();
  const listKey = `notif:batch:${userId}`;

  const items = await redis?.lrange(listKey, 0, -1);
  await redis?.del(listKey);

  if (!items || items.length === 0) return;

  const checkins = items.map(i => JSON.parse(i));

  if (checkins.length === 1) {
    // Single check-in: direct notification
    await sendFCM(userId, {
      title: `${checkins[0].username} checked in!`,
      body: `At ${checkins[0].eventName} @ ${checkins[0].venueName}`,
    });
  } else {
    // Batched: summary notification
    await sendFCM(userId, {
      title: `${checkins.length} friends checked in!`,
      body: `${checkins[0].username} and ${checkins.length - 1} others are at shows tonight`,
    });
  }
}
```

### Pattern 4: "Happening Now" with Event-Based Expiry
**What:** Query friends who have checked in to events happening today, grouped by event. Use the event's end_time (or start_time + 4h fallback) for auto-expiry.
**When to use:** The "Happening Now" tab.

```typescript
// Happening Now query - grouped by event with friend count
const query = `
  SELECT
    e.id as event_id, e.event_name, e.event_date, e.end_time, e.start_time,
    v.id as venue_id, v.name as venue_name,
    json_agg(json_build_object(
      'userId', u.id,
      'username', u.username,
      'profileImageUrl', u.profile_image_url,
      'checkinId', c.id,
      'checkedInAt', c.created_at
    ) ORDER BY c.created_at DESC) as friends,
    COUNT(c.id) as friend_count
  FROM checkins c
  JOIN events e ON c.event_id = e.id
  JOIN venues v ON e.venue_id = v.id
  JOIN users u ON c.user_id = u.id
  JOIN user_followers uf ON c.user_id = uf.following_id AND uf.follower_id = $1
  WHERE e.event_date = CURRENT_DATE
    AND c.created_at >= CURRENT_DATE
    -- Expiry: end_time if available, else start_time+4h, else midnight
    AND CURRENT_TIME <= COALESCE(
      e.end_time + INTERVAL '1 hour',
      e.start_time + INTERVAL '4 hours',
      TIME '23:59'
    )
  GROUP BY e.id, v.id
  ORDER BY MAX(c.created_at) DESC
`;
```

**Expiry Strategy (Claude's Discretion recommendation):**
- Use `event.end_time + 1 hour` buffer if end_time is available (Ticketmaster events often have this)
- Fall back to `event.start_time + 4 hours` if only start_time is available
- Fall back to midnight (end of event_date) if no time data at all
- This aligns with the existing time window logic in CheckinService.isWithinTimeWindow()

### Anti-Patterns to Avoid
- **Fan-out on write to Redis sorted sets**: Overkill for this app's scale. A pull-based query with short-TTL cache is simpler and sufficient. Fan-out on write is for Twitter-scale (millions of followers).
- **Polling for real-time**: The app already has WebSocket infrastructure. Do not add HTTP polling for feed updates.
- **Offset-based pagination for feeds**: Offset pagination causes duplicate/skipped items when new check-ins arrive. Cursor-based pagination with (created_at, id) is required for stable feed ordering.
- **Storing full feed items in Redis**: Cache the serialized query result, not individual items. Individual item caching leads to cache consistency nightmares.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Push notifications | Raw HTTP to FCM API | firebase-admin SDK | Handles auth, token refresh, error codes, multicast batching |
| Notification batching | setTimeout/setInterval | BullMQ delayed jobs + Redis lists | Survives restarts, deduplicates per user, retries on failure |
| Multi-instance fan-out | Shared in-memory state | Redis Pub/Sub via ioredis | Already installed; built for this exact use case |
| Cursor encoding | Custom format | Base64 JSON of {createdAt, id} | Opaque to client, easy to decode, supports composite cursors |
| Foreground notifications | Custom overlay | flutter_local_notifications | Handles platform-specific notification channels, sounds, grouping |
| WebSocket reconnection | Custom retry logic | Already implemented | WebSocketService already has _scheduleReconnect with 5s delay |
| Feed cache invalidation | Complex event-driven | Short TTL (60s) + delete on write | Simple, sufficient for feed freshness at this scale |

**Key insight:** The temptation is to build a sophisticated fan-out-on-write feed system. At SoundCheck's scale (friends, not followers; concerts, not tweets), a simple query-with-cache approach delivers the 200ms target while keeping complexity low. The real-time layer is an overlay on top, not a replacement for the pull-based feed.

## Common Pitfalls

### Pitfall 1: ioredis Pub/Sub Connection Reuse
**What goes wrong:** Using the same ioredis connection for Pub/Sub subscribe AND regular get/set commands. Once a connection enters subscriber mode, it can only run subscribe/unsubscribe/psubscribe/punsubscribe.
**Why it happens:** Developers assume one Redis connection can do everything.
**How to avoid:** Create a DEDICATED ioredis connection for the Pub/Sub subscriber, separate from the cache/rate-limiter connection. The project already has `createBullMQConnection()` as a pattern for dedicated connections.
**Warning signs:** "ReplyError: ERR only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context"

### Pitfall 2: WebSocket State Lost on Reconnect
**What goes wrong:** Client reconnects after network interruption but doesn't know what feed items it missed during disconnection.
**Why it happens:** WebSocket is fire-and-forget; missed messages are lost.
**How to avoid:** On reconnect, the mobile app should re-fetch the feed (or use the "N new check-ins" banner count). Store a lastSeenTimestamp client-side. On reconnect, query for items newer than lastSeenTimestamp.
**Warning signs:** Users report "missing" check-ins that only appear after manual refresh.

### Pitfall 3: FCM Token Lifecycle
**What goes wrong:** Push notifications stop working because device tokens expire or change and the backend still uses stale tokens.
**Why it happens:** FCM tokens can change on app reinstall, data clear, or token refresh. Backend stores a token once and never updates it.
**How to avoid:** Send the FCM token to the backend on every app launch (not just first login). Store token with a `last_updated` timestamp. Handle `messaging/registration-token-not-registered` error by deleting the stale token.
**Warning signs:** Push notifications work initially but stop after a few weeks for some users.

### Pitfall 4: Feed Cache Invalidation Race
**What goes wrong:** User creates a check-in, immediately opens the friends feed, and doesn't see their own check-in because the cache hasn't been invalidated yet.
**Why it happens:** Cache invalidation happens async; the feed query might hit old cached data.
**How to avoid:** On check-in creation, immediately delete the feed cache keys for the creating user AND invalidate affected followers' caches. Also, the mobile app should optimistically add the new check-in to the local feed state.
**Warning signs:** "I just checked in but I don't see it in my feed."

### Pitfall 5: N+1 in Happening Now Grouping
**What goes wrong:** Fetching happening-now events, then for each event fetching friends who checked in, creating an N+1 query pattern.
**Why it happens:** Thinking of it as "for each event, get friends" instead of "one query, group in SQL."
**How to avoid:** Use a single query with `json_agg()` and `GROUP BY event_id` to get all events with their friends in one round trip (as shown in Pattern 4).
**Warning signs:** Happening Now tab takes >500ms with only a few events.

### Pitfall 6: Same-Event Detection Performance
**What goes wrong:** The "Alex is here too!" feature requires checking if the current user is checked in at the same event as a friend -- this can be expensive if done per-feed-item.
**Why it happens:** Naive implementation checks each incoming check-in against all of the current user's active check-ins.
**How to avoid:** On app launch, cache the current user's active event IDs (events they checked into today). When a new_checkin WebSocket event arrives, check against this local set. This is O(1) per event.
**Warning signs:** Feed updates cause visible lag or jank.

### Pitfall 7: Notification Batching Edge Cases
**What goes wrong:** A user gets no notification at all because the batching job fires and finds an empty list (race condition), or gets duplicate notifications because deduplication fails.
**Why it happens:** BullMQ jobId dedup means a second event within the window won't create a new job -- but the first job might already be processing.
**How to avoid:** The worker should always check the Redis list at execution time (not rely on job data). If the list is empty, no-op gracefully. Use LRANGE + DEL in a pipeline for atomicity.
**Warning signs:** Users report getting 0 notifications or duplicate notifications on busy nights.

## Code Examples

### Cursor Encoding/Decoding (Backend)
```typescript
// Source: Standard cursor pagination pattern for PostgreSQL
interface FeedCursor {
  createdAt: string; // ISO 8601
  id: string;        // UUID
}

export function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(encoded: string): FeedCursor | null {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed.createdAt && parsed.id) return parsed;
    return null;
  } catch {
    return null;
  }
}
```

### Feed Card Freezed Model (Mobile)
```dart
// Source: Matches the redesigned feed endpoint response shape
@freezed
sealed class FeedItem with _$FeedItem {
  const factory FeedItem({
    required String id,
    required String checkinId,
    required String userId,
    required String username,
    String? userAvatarUrl,
    required String eventId,
    required String eventName,
    required String venueName,
    String? photoUrl,
    required String createdAt,
    @Default(false) bool hasBadgeEarned,
    @Default(0) int toastCount,
    @Default(0) int commentCount,
    @Default(false) bool hasUserToasted,
  }) = _FeedItem;

  factory FeedItem.fromJson(Map<String, dynamic> json) =>
      _$FeedItemFromJson(json);
}

@freezed
sealed class HappeningNowGroup with _$HappeningNowGroup {
  const factory HappeningNowGroup({
    required String eventId,
    required String eventName,
    required String venueName,
    required List<HappeningNowFriend> friends,
    required int totalFriendCount,
    required String lastCheckinAt,
  }) = _HappeningNowGroup;

  factory HappeningNowGroup.fromJson(Map<String, dynamic> json) =>
      _$HappeningNowGroupFromJson(json);
}

@freezed
sealed class HappeningNowFriend with _$HappeningNowFriend {
  const factory HappeningNowFriend({
    required String userId,
    required String username,
    String? profileImageUrl,
  }) = _HappeningNowFriend;

  factory HappeningNowFriend.fromJson(Map<String, dynamic> json) =>
      _$HappeningNowFriendFromJson(json);
}
```

### WebSocket New Checkin Handler (Mobile)
```dart
// Source: Extends existing WebSocketService pattern from Phase 4 (badge_earned)
// Add to WebSocketService:
final _newCheckinController = StreamController<Map<String, dynamic>>.broadcast();
Stream<Map<String, dynamic>> get newCheckinStream => _newCheckinController.stream;

// In _handleMessage switch:
case 'new_checkin':
  _newCheckinController.add(message.payload);
  break;

case 'same_event_checkin':
  // "Alex is here too!" - special handling
  _sameEventController.add(message.payload);
  break;
```

### FCM Initialization (Mobile)
```dart
// Source: firebase_messaging official setup
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

// Top-level background handler (must be top-level function, not method)
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // Handle background message (e.g., update badge count)
}

class PushNotificationService {
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  Future<void> initialize() async {
    // Request permission
    await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    // Get device token
    final token = await FirebaseMessaging.instance.getToken();
    // Send token to backend: POST /api/users/device-token

    // Listen for token refresh
    FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
      // Update token on backend
    });

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      // Show local notification (FCM blocks foreground display on Android)
      _showLocalNotification(message);
    });

    // Handle notification taps (background -> foreground)
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      // Navigate to relevant screen
    });

    // Handle notification taps (terminated -> open)
    final initialMessage = await FirebaseMessaging.instance.getInitialMessage();
    if (initialMessage != null) {
      // Navigate to relevant screen
    }
  }
}
```

### FCM Sending (Backend)
```typescript
// Source: firebase-admin official SDK pattern
import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging, Message } from 'firebase-admin/messaging';

// Initialize once at app startup
const firebaseApp = initializeApp({
  credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
});

export class PushNotificationService {
  async sendToUser(userId: string, notification: { title: string; body: string; data?: Record<string, string> }) {
    // Get user's device tokens from DB
    const tokens = await this.getDeviceTokens(userId);
    if (tokens.length === 0) return;

    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      tokens,
    };

    const response = await getMessaging().sendEachForMulticast(message);

    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
          tokensToRemove.push(tokens[idx]);
        }
      });
      if (tokensToRemove.length > 0) {
        await this.removeDeviceTokens(userId, tokensToRemove);
      }
    }
  }
}
```

### Database Migration: Device Tokens
```typescript
// Migration 020: Add device_tokens table for FCM push notifications
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('device_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    token: { type: 'text', notNull: true },
    platform: { type: 'varchar(20)', notNull: true }, // 'android', 'ios'
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
    updated_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });

  // Unique constraint: one token per user per platform
  pgm.addConstraint('device_tokens', 'unique_user_token', {
    unique: ['user_id', 'token'],
  });

  pgm.createIndex('device_tokens', 'user_id');
}
```

### Database Migration: Feed Read Cursors
```typescript
// Migration 021: Track per-user last-read position per feed tab
// Used for unseen count badges on tabs and bottom nav
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('feed_read_cursors', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    feed_type: { type: 'varchar(20)', notNull: true }, // 'friends', 'event', 'happening_now'
    last_seen_at: { type: 'timestamptz', notNull: true },
    last_seen_checkin_id: { type: 'uuid' },
    updated_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });

  pgm.addConstraint('feed_read_cursors', 'unique_user_feed', {
    unique: ['user_id', 'feed_type'],
  });
}
```

## Discretion Recommendations

Items marked as Claude's Discretion in CONTEXT.md:

### "Happening Now" Expiry Strategy
**Recommendation:** Use event end_time + 1h buffer when available, fall back to start_time + 4h, fall back to midnight. This aligns with the existing time window logic in `CheckinService.isWithinTimeWindow()` which already uses the same cascade. Concert events typically last 2-4 hours; the buffer accounts for encores and post-show socializing.

### Batching Window Duration for Notifications
**Recommendation:** 2-minute window. Short enough that notifications feel timely (FOMO requires urgency), long enough to batch a burst of friends checking in at the same event. On a busy Friday night where 5 friends check in to the same event within 10 minutes, the user gets 2-3 batched notifications instead of 5 individual ones. Badge-earned notifications bypass batching entirely (sent immediately).

### Feed Card Tap/Detail View
**Recommendation:** Tap navigates to existing `CheckinDetailScreen` (already built in Phase 3). The detail view shows ratings, badges earned, full photo, comments, and toasts. This avoids building a new screen.

### Animation and Transition Details
**Recommendation:** Keep animations minimal and performant:
- "N new check-ins" banner: SlideTransition from top with 300ms duration
- Happening Now cards appearing/disappearing: AnimatedList with fadeIn/fadeOut (200ms)
- Tab badge count: implicit animation via AnimatedSwitcher
- No complex animations that could cause jank on the feed scroll

### Error and Loading States
**Recommendation:** Follow existing patterns:
- Loading: Shimmer skeleton cards (already have shimmer package installed)
- Error: Existing ErrorStateWidget with retry button
- Empty friends feed: "Follow friends to see their check-ins here!"
- Empty happening now: "None of your friends are at shows right now"
- WebSocket disconnected: silent reconnect (existing pattern), feeds still work via pull

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Offset pagination (LIMIT/OFFSET) | Cursor pagination (keyset) | Industry standard since ~2020 | Stable pagination when new items are added; required for real-time feeds |
| FCM Legacy HTTP API | FCM HTTP v1 API | 2024 (legacy deprecated) | Must use firebase-admin v13+ with service account credentials |
| Custom WebSocket scaling | Redis Pub/Sub for fan-out | Standard pattern | Enables horizontal scaling without sticky sessions |
| Immediate push per event | Time-window batched push | UX best practice | Prevents notification fatigue on busy nights |

**Deprecated/outdated:**
- FCM Legacy API: Deprecated, must use HTTP v1 API via firebase-admin SDK
- `sendMulticast()` in firebase-admin: Replaced by `sendEachForMulticast()` in v12+
- Offset-based pagination for social feeds: Causes duplicate/missed items; cursor-based is required

## Open Questions

Things that couldn't be fully resolved:

1. **Firebase project configuration files**
   - What we know: firebase_core is already installed, firebase_analytics is configured. The google-services.json and GoogleService-Info.plist files are likely gitignored.
   - What's unclear: Whether the existing Firebase project has Cloud Messaging enabled, whether the Firebase service account key exists for the backend.
   - Recommendation: Plan should include a user setup step for Firebase service account key. Check if existing Firebase project has FCM enabled. The flutter_local_notifications Android compileSdk requirement (API 35) may need a build.gradle update.

2. **Event feed scope**
   - What we know: CONTEXT.md specifies "Event feed" as a separate tab showing all check-ins for a specific event.
   - What's unclear: How does the user select which event to view? Is it a tab that lists events, or does tapping an event name in the friends feed navigate to the event feed?
   - Recommendation: Implement as a tab that shows check-ins at events the user has checked into (shared experiences), plus allow navigation to any event's feed by tapping event name in friends feed.

3. **flutter_local_notifications v20 compileSdk requirement**
   - What we know: v20.0.0 requires Android compileSdk 35. The current project may be on a lower compileSdk.
   - What's unclear: Current compileSdk version in build.gradle.
   - Recommendation: Check and update compileSdk in the plan's implementation steps. If v20 is too aggressive, v19.x may work with lower compileSdk.

## Sources

### Primary (HIGH confidence)
- **Existing codebase** - WebSocket implementation (backend/src/utils/websocket.ts), cache utility (backend/src/utils/cache.ts), Redis config (backend/src/config/redis.ts), BullMQ queue/worker patterns (backend/src/jobs/), FollowService (backend/src/services/FollowService.ts), CheckinService.getActivityFeed, mobile WebSocketService, mobile feed_screen.dart, mobile checkin_providers.dart
- **[Firebase Admin SDK docs](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk)** - FCM send message patterns, multicast API
- **[firebase_messaging on pub.dev](https://pub.dev/packages/firebase_messaging)** - v16.1.1, requires firebase_core ^4.4.0
- **[firebase-admin on npm](https://www.npmjs.com/package/firebase-admin)** - v13.6.0, Node.js 18+
- **[flutter_local_notifications on pub.dev](https://pub.dev/packages/flutter_local_notifications)** - v20.0.0

### Secondary (MEDIUM confidence)
- **[BullMQ delayed jobs docs](https://docs.bullmq.io/guide/jobs/delayed)** - Delayed job pattern for batching windows
- **[Firebase Cloud Messaging Flutter setup](https://firebase.google.com/docs/cloud-messaging/flutter/get-started)** - Official Flutter FCM setup guide
- **Cursor-based pagination patterns** - Standard PostgreSQL row-value comparison technique, well-documented in multiple sources

### Tertiary (LOW confidence)
- **Notification batching window duration (2 minutes)** - Based on general UX best practices for social apps; may need tuning based on real usage patterns
- **flutter_local_notifications v20 compileSdk requirement** - Reported as API 35; needs verification against current project build.gradle

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All core libraries already installed except firebase-admin and firebase_messaging; versions verified
- Architecture: HIGH - Patterns directly follow existing codebase conventions (BullMQ worker, Redis cache, WebSocket sendToUser)
- Feed queries: HIGH - Cursor pagination is well-understood; existing query patterns in CheckinService provide the template
- Real-time (Pub/Sub): HIGH - ioredis Pub/Sub is well-documented; pattern is standard for WebSocket fan-out
- Push notifications: MEDIUM - firebase-admin and firebase_messaging are standard, but Firebase project setup status is unclear
- Notification batching: MEDIUM - BullMQ delayed jobs + Redis lists is a sound pattern, but batching window duration needs real-world tuning
- Pitfalls: HIGH - Documented from well-known patterns and codebase-specific analysis

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (30 days - stable domain, no fast-moving dependencies)
