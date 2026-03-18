import Database from '../config/database';
import { BlockService } from './BlockService';
import { getCache, setCache, CacheTTL } from '../utils/cache';
import logger from '../utils/logger';

/**
 * SuggestedUser: A user recommended for following based on shared activity.
 */
export interface SuggestedUser {
  id: string;
  username: string;
  displayName: string;
  profileImageUrl: string | null;
  bio: string | null;
  totalCheckins: number;
  isVerified: boolean;
  sharedBands: number;
  sharedVenues: number;
  reason: string;
}

/**
 * UserDiscoveryService: Suggests users to follow based on shared music taste.
 *
 * Scoring algorithm:
 *   - Shared bands (weight 3x): users who checked in to the same bands
 *   - Shared venues (weight 2x): users who checked in to the same venues
 *   - Activity recency: users with recent check-ins ranked higher
 *   - Excludes: self, already-followed users, blocked users
 *
 * Results cached per-user in Redis (5-minute TTL).
 *
 * Phase 17: Social Graph & Beta Onramp
 */
export class UserDiscoveryService {
  private db = Database.getInstance();
  private blockService = new BlockService();

  /**
   * Get user follow suggestions based on shared bands, venues, and activity.
   */
  async getSuggestions(userId: string, limit: number = 10): Promise<SuggestedUser[]> {
    const cacheKey = `discover:suggestions:${userId}`;

    const cached = await getCache<SuggestedUser[]>(cacheKey);
    if (cached) return cached;

    try {
      const blockFilterSQL = this.blockService.getBlockFilterSQL(userId, 'u.id');

      // CFR-PERF-006: LIMIT CTEs to prevent unbounded scans on cold cache
      const sql = `
        WITH user_bands AS (
          SELECT DISTINCT el.band_id
          FROM checkins c
          JOIN event_lineup el ON el.event_id = c.event_id
          WHERE c.user_id = $1
          LIMIT 100
        ),
        user_venues AS (
          SELECT DISTINCT e.venue_id
          FROM checkins c
          JOIN events e ON c.event_id = e.id
          WHERE c.user_id = $1
          LIMIT 100
        ),
        candidates AS (
          SELECT u.id,
            COUNT(DISTINCT shared_band.band_id) AS shared_bands,
            COUNT(DISTINCT shared_venue.venue_id) AS shared_venues,
            MAX(c.created_at) AS last_checkin_at,
            u.total_checkins
          FROM users u
          JOIN checkins c ON c.user_id = u.id
          LEFT JOIN event_lineup shared_band ON shared_band.event_id = c.event_id
            AND shared_band.band_id IN (SELECT band_id FROM user_bands)
          LEFT JOIN (
            SELECT c2.user_id, e.venue_id
            FROM checkins c2
            JOIN events e ON c2.event_id = e.id
            WHERE e.venue_id IN (SELECT venue_id FROM user_venues)
          ) shared_venue ON shared_venue.user_id = u.id
          WHERE u.id != $1
            AND u.is_active = true
            AND NOT EXISTS (
              SELECT 1 FROM user_followers
              WHERE follower_id = $1 AND following_id = u.id
            )
            ${blockFilterSQL}
          GROUP BY u.id, u.total_checkins
          HAVING COUNT(c.id) > 0
          LIMIT 500
        )
        SELECT u.id, u.username, u.first_name, u.last_name,
          u.profile_image_url, u.bio, u.total_checkins, u.is_verified,
          c.shared_bands, c.shared_venues
        FROM candidates c
        JOIN users u ON u.id = c.id
        ORDER BY (c.shared_bands * 3 + c.shared_venues * 2 + LEAST(c.total_checkins, 20) * 0.1) DESC,
          c.last_checkin_at DESC NULLS LAST
        LIMIT $2
      `;

      const result = await this.db.query(sql, [userId, limit]);

      const suggestions: SuggestedUser[] = result.rows.map((row: any) => ({
        id: row.id,
        username: row.username,
        displayName: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
        profileImageUrl: row.profile_image_url || null,
        bio: row.bio || null,
        totalCheckins: parseInt(row.total_checkins, 10) || 0,
        isVerified: row.is_verified === true,
        sharedBands: parseInt(row.shared_bands, 10) || 0,
        sharedVenues: parseInt(row.shared_venues, 10) || 0,
        reason: this.buildReason(parseInt(row.shared_bands, 10) || 0, parseInt(row.shared_venues, 10) || 0),
      }));

      await setCache(cacheKey, suggestions, CacheTTL.MEDIUM); // 5 minutes

      return suggestions;
    } catch (error) {
      logger.error('User discovery suggestions error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Build a human-readable reason string for a suggestion.
   */
  private buildReason(sharedBands: number, sharedVenues: number): string {
    const parts: string[] = [];

    if (sharedBands > 0) {
      parts.push(`${sharedBands} band${sharedBands > 1 ? 's' : ''} in common`);
    }
    if (sharedVenues > 0) {
      parts.push(`${sharedVenues} venue${sharedVenues > 1 ? 's' : ''} in common`);
    }

    if (parts.length === 0) {
      return 'Active in the community';
    }

    return parts.join(', ');
  }
}
