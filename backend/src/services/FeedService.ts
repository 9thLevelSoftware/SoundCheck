import Database from '../config/database';
import { getCache, setCache, cache, CacheTTL } from '../utils/cache';
import { BlockService } from './BlockService';

// ============================================
// Interfaces
// ============================================

export interface FeedItem {
  id: string;
  checkinId: string;
  userId: string;
  username: string;
  userAvatarUrl: string | null;
  eventId: string;
  eventName: string;
  venueName: string;
  photoUrl: string | null;
  createdAt: string;
  hasBadgeEarned: boolean;
  toastCount: number;
  commentCount: number;
  hasUserToasted: boolean;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface HappeningNowGroup {
  eventId: string;
  eventName: string;
  venueName: string;
  friends: { userId: string; username: string; profileImageUrl: string | null }[];
  totalFriendCount: number;
  lastCheckinAt: string;
}

interface FeedCursor {
  createdAt: string; // ISO 8601
  id: string;        // UUID
}

// ============================================
// Cursor helpers (module-level exports)
// ============================================

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

// ============================================
// FeedService
// ============================================

export class FeedService {
  private db = Database.getInstance();
  private blockService = new BlockService();

  /**
   * Get friends feed: check-ins from followed users with cursor pagination.
   * Uses cache-aside pattern with Redis (60s TTL).
   */
  async getFriendsFeed(userId: string, cursor?: string, limit: number = 20): Promise<FeedPage> {
    const cacheKey = `feed:friends:${userId}:${cursor || 'head'}`;

    const cached = await getCache<FeedPage>(cacheKey);
    if (cached) return cached;

    const cursorData = cursor ? decodeCursor(cursor) : null;

    const cursorClause = cursorData
      ? 'AND (c.created_at, c.id) < ($3::timestamptz, $4::uuid)'
      : '';

    const query = `
      SELECT
        c.id,
        c.user_id,
        c.event_id,
        c.created_at,
        c.photo_url,
        u.username,
        u.profile_image_url AS user_avatar_url,
        e.event_name,
        v.name AS venue_name,
        COUNT(DISTINCT t.id)::int AS toast_count,
        COUNT(DISTINCT cm.id)::int AS comment_count,
        EXISTS(
          SELECT 1 FROM user_badges ub
          WHERE ub.user_id = c.user_id
            AND ub.earned_at >= c.created_at - INTERVAL '1 minute'
            AND ub.earned_at <= c.created_at + INTERVAL '1 hour'
        ) AS has_badge_earned,
        EXISTS(
          SELECT 1 FROM toasts t2
          WHERE t2.checkin_id = c.id AND t2.user_id = $1
        ) AS has_user_toasted
      FROM checkins c
      JOIN user_followers uf ON c.user_id = uf.following_id
      JOIN users u ON c.user_id = u.id
      LEFT JOIN events e ON c.event_id = e.id
      LEFT JOIN venues v ON e.venue_id = v.id
      LEFT JOIN toasts t ON c.id = t.checkin_id
      LEFT JOIN checkin_comments cm ON c.id = cm.checkin_id
      WHERE uf.follower_id = $1
        ${this.blockService.getBlockFilterSQL(userId, 'c.user_id')}
        ${cursorClause}
      GROUP BY c.id, c.user_id, c.event_id, c.created_at, c.photo_url,
               u.username, u.profile_image_url, e.event_name, v.name
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $2
    `;

    const params: any[] = cursorData
      ? [userId, limit + 1, cursorData.createdAt, cursorData.id]
      : [userId, limit + 1];

    const result = await this.db.query(query, params);
    const rows = result.rows;

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    const items: FeedItem[] = rows.map((row: any) => this.mapRowToFeedItem(row));

    const nextCursor = items.length > 0
      ? encodeCursor({
          createdAt: rows[rows.length - 1].created_at instanceof Date
            ? rows[rows.length - 1].created_at.toISOString()
            : rows[rows.length - 1].created_at,
          id: rows[rows.length - 1].id,
        })
      : null;

    const feedPage: FeedPage = { items, nextCursor, hasMore };

    await setCache(cacheKey, feedPage, CacheTTL.SHORT);

    return feedPage;
  }

  /**
   * Get event feed: all check-ins for a specific event with cursor pagination.
   * Uses cache-aside pattern with Redis (60s TTL).
   */
  async getEventFeed(eventId: string, cursor?: string, limit: number = 20): Promise<FeedPage> {
    const cacheKey = `feed:event:${eventId}:${cursor || 'head'}`;

    const cached = await getCache<FeedPage>(cacheKey);
    if (cached) return cached;

    const cursorData = cursor ? decodeCursor(cursor) : null;

    const cursorClause = cursorData
      ? 'AND (c.created_at, c.id) < ($3::timestamptz, $4::uuid)'
      : '';

    const query = `
      SELECT
        c.id,
        c.user_id,
        c.event_id,
        c.created_at,
        c.photo_url,
        u.username,
        u.profile_image_url AS user_avatar_url,
        e.event_name,
        v.name AS venue_name,
        COUNT(DISTINCT t.id)::int AS toast_count,
        COUNT(DISTINCT cm.id)::int AS comment_count,
        EXISTS(
          SELECT 1 FROM user_badges ub
          WHERE ub.user_id = c.user_id
            AND ub.earned_at >= c.created_at - INTERVAL '1 minute'
            AND ub.earned_at <= c.created_at + INTERVAL '1 hour'
        ) AS has_badge_earned,
        false AS has_user_toasted
      FROM checkins c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN events e ON c.event_id = e.id
      LEFT JOIN venues v ON e.venue_id = v.id
      LEFT JOIN toasts t ON c.id = t.checkin_id
      LEFT JOIN checkin_comments cm ON c.id = cm.checkin_id
      WHERE c.event_id = $1
        ${cursorClause}
      GROUP BY c.id, c.user_id, c.event_id, c.created_at, c.photo_url,
               u.username, u.profile_image_url, e.event_name, v.name
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $2
    `;

    const params: any[] = cursorData
      ? [eventId, limit + 1, cursorData.createdAt, cursorData.id]
      : [eventId, limit + 1];

    const result = await this.db.query(query, params);
    const rows = result.rows;

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    const items: FeedItem[] = rows.map((row: any) => this.mapRowToFeedItem(row));

    const nextCursor = items.length > 0
      ? encodeCursor({
          createdAt: rows[rows.length - 1].created_at instanceof Date
            ? rows[rows.length - 1].created_at.toISOString()
            : rows[rows.length - 1].created_at,
          id: rows[rows.length - 1].id,
        })
      : null;

    const feedPage: FeedPage = { items, nextCursor, hasMore };

    await setCache(cacheKey, feedPage, CacheTTL.SHORT);

    return feedPage;
  }

  /**
   * Get "Happening Now": friends checked in to events happening today,
   * grouped by event. Uses event end_time / start_time + 4h / event_date + 1 day
   * for expiry. Cache 30s TTL (shorter for live data).
   */
  async getHappeningNow(userId: string): Promise<HappeningNowGroup[]> {
    const cacheKey = `feed:happening:${userId}`;

    const cached = await getCache<HappeningNowGroup[]>(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT
        e.id AS event_id,
        e.event_name,
        v.name AS venue_name,
        json_agg(
          json_build_object(
            'userId', u.id,
            'username', u.username,
            'profileImageUrl', u.profile_image_url
          ) ORDER BY c.created_at DESC
        ) AS friends,
        COUNT(c.id)::int AS total_friend_count,
        MAX(c.created_at) AS last_checkin_at
      FROM checkins c
      JOIN events e ON c.event_id = e.id
      JOIN venues v ON e.venue_id = v.id
      JOIN users u ON c.user_id = u.id
      JOIN user_followers uf ON c.user_id = uf.following_id AND uf.follower_id = $1
      WHERE e.event_date = CURRENT_DATE
        ${this.blockService.getBlockFilterSQL(userId, 'c.user_id')}
        AND c.created_at >= CURRENT_DATE::timestamptz
        AND NOW() < COALESCE(
          (e.event_date::date || ' ' || e.end_time)::timestamptz + INTERVAL '1 hour',
          (e.event_date::date || ' ' || e.start_time)::timestamptz + INTERVAL '4 hours',
          (e.event_date + INTERVAL '1 day')::timestamptz
        )
      GROUP BY e.id, e.event_name, v.name
      ORDER BY MAX(c.created_at) DESC
    `;

    const result = await this.db.query(query, [userId]);

    const groups: HappeningNowGroup[] = result.rows.map((row: any) => ({
      eventId: row.event_id,
      eventName: row.event_name || 'Unnamed Event',
      venueName: row.venue_name || 'Unknown Venue',
      friends: row.friends || [],
      totalFriendCount: row.total_friend_count,
      lastCheckinAt: row.last_checkin_at instanceof Date
        ? row.last_checkin_at.toISOString()
        : row.last_checkin_at,
    }));

    // 30s TTL for live data
    await setCache(cacheKey, groups, 30);

    return groups;
  }

  /**
   * Get unseen counts per feed tab.
   * Returns { friends, event, happening_now } with count of new items
   * since last_seen_at for each tab.
   */
  async getUnseenCounts(userId: string): Promise<{ friends: number; event: number; happening_now: number }> {
    // Get all cursor records for this user
    const cursorResult = await this.db.query(
      `SELECT feed_type, last_seen_at FROM feed_read_cursors WHERE user_id = $1`,
      [userId]
    );

    const cursors: Record<string, string> = {};
    for (const row of cursorResult.rows) {
      cursors[row.feed_type] = row.last_seen_at instanceof Date
        ? row.last_seen_at.toISOString()
        : row.last_seen_at;
    }

    // Count unseen friends feed items
    let friendsCount = 0;
    if (cursors.friends) {
      const friendsResult = await this.db.query(
        `SELECT COUNT(*)::int AS cnt
         FROM checkins c
         JOIN user_followers uf ON c.user_id = uf.following_id
         WHERE uf.follower_id = $1 AND c.created_at > $2`,
        [userId, cursors.friends]
      );
      friendsCount = friendsResult.rows[0]?.cnt || 0;
    }

    // Count unseen happening_now items
    let happeningNowCount = 0;
    if (cursors.happening_now) {
      const hnResult = await this.db.query(
        `SELECT COUNT(*)::int AS cnt
         FROM checkins c
         JOIN events e ON c.event_id = e.id
         JOIN user_followers uf ON c.user_id = uf.following_id AND uf.follower_id = $1
         WHERE e.event_date = CURRENT_DATE
           AND c.created_at > $2`,
        [userId, cursors.happening_now]
      );
      happeningNowCount = hnResult.rows[0]?.cnt || 0;
    }

    return {
      friends: friendsCount,
      event: 0, // Event feed unseen count is per-event, not global; return 0 for global tab
      happening_now: happeningNowCount,
    };
  }

  /**
   * Mark a feed tab as read. UPSERTs feed_read_cursors row.
   */
  async markFeedRead(
    userId: string,
    feedType: string,
    lastSeenAt: string,
    lastSeenCheckinId?: string
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO feed_read_cursors (user_id, feed_type, last_seen_at, last_seen_checkin_id, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, feed_type) DO UPDATE SET
         last_seen_at = $3,
         last_seen_checkin_id = $4,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, feedType, lastSeenAt, lastSeenCheckinId || null]
    );
  }

  /**
   * Invalidate feed cache for a user (friends + happening_now).
   * Called when a followed user creates a check-in.
   */
  async invalidateUserFeedCache(userId: string): Promise<void> {
    try {
      await cache.delPattern(`feed:friends:${userId}:*`);
      await cache.del(`feed:happening:${userId}`);
    } catch (error) {
      console.error('Feed cache invalidation error (user):', error);
    }
  }

  /**
   * Invalidate feed cache for an event.
   * Called when a new check-in is created at an event.
   */
  async invalidateEventFeedCache(eventId: string): Promise<void> {
    try {
      await cache.delPattern(`feed:event:${eventId}:*`);
    } catch (error) {
      console.error('Feed cache invalidation error (event):', error);
    }
  }

  /**
   * Map a database row to a FeedItem.
   */
  private mapRowToFeedItem(row: any): FeedItem {
    return {
      id: row.id,
      checkinId: row.id,
      userId: row.user_id,
      username: row.username,
      userAvatarUrl: row.user_avatar_url || null,
      eventId: row.event_id,
      eventName: row.event_name || 'Unnamed Event',
      venueName: row.venue_name || 'Unknown Venue',
      photoUrl: row.photo_url || null,
      createdAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
      hasBadgeEarned: row.has_badge_earned === true || row.has_badge_earned === 't',
      toastCount: row.toast_count || 0,
      commentCount: row.comment_count || 0,
      hasUserToasted: row.has_user_toasted === true || row.has_user_toasted === 't',
    };
  }
}
