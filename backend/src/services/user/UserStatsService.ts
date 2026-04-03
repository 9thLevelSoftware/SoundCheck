/**
 * UserStatsService -- Stats aggregation
 *
 * Extracted from UserService as part of P1 service decomposition.
 * Handles:
 *   - User statistics aggregation
 *   - Check-in counts, unique venues/bands
 *   - Follower/following counts
 *   - Badge counts
 */

import Database from '../../config/database';
import logger from '../../utils/logger';

export interface UserStats {
  totalCheckins: number;
  badgesEarned: number;
  followersCount: number;
  followingCount: number;
  uniqueVenues: number;
  uniqueBands: number;
}

export interface ExtendedUserStats extends UserStats {
  // Additional stats that can be added in the future
  totalRatings?: number;
  averageRating?: number;
  totalComments?: number;
  totalToasts?: number;
}

export class UserStatsService {
  private db = Database.getInstance();

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<UserStats> {
    try {
      const statsQuery = `
        SELECT
          (SELECT COUNT(*) FROM checkins WHERE user_id = $1) as checkin_count,
          0 as review_count, -- reviews table dropped in migration 043
          (SELECT COUNT(*) FROM user_badges WHERE user_id = $1) as badge_count,
          (SELECT COUNT(*) FROM user_followers WHERE following_id = $1) as follower_count,
          (SELECT COUNT(*) FROM user_followers WHERE follower_id = $1) as following_count,
          (SELECT COUNT(DISTINCT venue_id) FROM checkins WHERE user_id = $1) as unique_venues,
          (SELECT COUNT(DISTINCT band_id) FROM checkins WHERE user_id = $1) as unique_bands
      `;

      const result = await this.db.query(statsQuery, [userId]);

      if (!result.rows.length) {
        return {
          totalCheckins: 0,
          badgesEarned: 0,
          followersCount: 0,
          followingCount: 0,
          uniqueVenues: 0,
          uniqueBands: 0,
        };
      }
      const stats = result.rows[0];

      return {
        totalCheckins: parseInt(stats.checkin_count, 10) || 0,
        badgesEarned: parseInt(stats.badge_count, 10) || 0,
        followersCount: parseInt(stats.follower_count, 10) || 0,
        followingCount: parseInt(stats.following_count, 10) || 0,
        uniqueVenues: parseInt(stats.unique_venues, 10) || 0,
        uniqueBands: parseInt(stats.unique_bands, 10) || 0,
      };
    } catch (error) {
      logger.error('[UserStatsService] Error getting user stats', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error('Failed to retrieve user statistics', { cause: error });
    }
  }

  /**
   * Get check-in counts for multiple users (batch operation)
   */
  async getCheckinCounts(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const query = `
      SELECT user_id, COUNT(*)::int as count
      FROM checkins
      WHERE user_id = ANY($1)
      GROUP BY user_id
    `;

    const result = await this.db.query(query, [userIds]);
    const counts = new Map<string, number>();

    for (const row of result.rows) {
      counts.set(row.user_id, parseInt(row.count, 10));
    }

    // Set 0 for users with no check-ins
    for (const userId of userIds) {
      if (!counts.has(userId)) {
        counts.set(userId, 0);
      }
    }

    return counts;
  }

  /**
   * Get badge counts for multiple users (batch operation)
   */
  async getBadgeCounts(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const query = `
      SELECT user_id, COUNT(*)::int as count
      FROM user_badges
      WHERE user_id = ANY($1)
      GROUP BY user_id
    `;

    const result = await this.db.query(query, [userIds]);
    const counts = new Map<string, number>();

    for (const row of result.rows) {
      counts.set(row.user_id, parseInt(row.count, 10));
    }

    // Set 0 for users with no badges
    for (const userId of userIds) {
      if (!counts.has(userId)) {
        counts.set(userId, 0);
      }
    }

    return counts;
  }

  /**
   * Get follower counts for multiple users (batch operation)
   */
  async getFollowerCounts(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const query = `
      SELECT following_id, COUNT(*)::int as count
      FROM user_followers
      WHERE following_id = ANY($1)
      GROUP BY following_id
    `;

    const result = await this.db.query(query, [userIds]);
    const counts = new Map<string, number>();

    for (const row of result.rows) {
      counts.set(row.following_id, parseInt(row.count, 10));
    }

    // Set 0 for users with no followers
    for (const userId of userIds) {
      if (!counts.has(userId)) {
        counts.set(userId, 0);
      }
    }

    return counts;
  }

  /**
   * Get following counts for multiple users (batch operation)
   */
  async getFollowingCounts(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const query = `
      SELECT follower_id, COUNT(*)::int as count
      FROM user_followers
      WHERE follower_id = ANY($1)
      GROUP BY follower_id
    `;

    const result = await this.db.query(query, [userIds]);
    const counts = new Map<string, number>();

    for (const row of result.rows) {
      counts.set(row.follower_id, parseInt(row.count, 10));
    }

    // Set 0 for users not following anyone
    for (const userId of userIds) {
      if (!counts.has(userId)) {
        counts.set(userId, 0);
      }
    }

    return counts;
  }

  /**
   * Get unique venue counts for multiple users (batch operation)
   */
  async getUniqueVenueCounts(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const query = `
      SELECT user_id, COUNT(DISTINCT venue_id)::int as count
      FROM checkins
      WHERE user_id = ANY($1)
      GROUP BY user_id
    `;

    const result = await this.db.query(query, [userIds]);
    const counts = new Map<string, number>();

    for (const row of result.rows) {
      counts.set(row.user_id, parseInt(row.count, 10));
    }

    // Set 0 for users with no venues
    for (const userId of userIds) {
      if (!counts.has(userId)) {
        counts.set(userId, 0);
      }
    }

    return counts;
  }

  /**
   * Get unique band counts for multiple users (batch operation)
   */
  async getUniqueBandCounts(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();

    const query = `
      SELECT user_id, COUNT(DISTINCT band_id)::int as count
      FROM checkins
      WHERE user_id = ANY($1)
      GROUP BY user_id
    `;

    const result = await this.db.query(query, [userIds]);
    const counts = new Map<string, number>();

    for (const row of result.rows) {
      counts.set(row.user_id, parseInt(row.count, 10));
    }

    // Set 0 for users with no bands
    for (const userId of userIds) {
      if (!counts.has(userId)) {
        counts.set(userId, 0);
      }
    }

    return counts;
  }

  /**
   * Get all stats for multiple users in a batch (optimized)
   */
  async getStatsForUsers(userIds: string[]): Promise<Map<string, UserStats>> {
    if (userIds.length === 0) return new Map();

    const query = `
      SELECT
        u.id,
        COALESCE(c.checkin_count, 0)::int as checkin_count,
        COALESCE(ub.badge_count, 0)::int as badge_count,
        COALESCE(uf.follower_count, 0)::int as follower_count,
        COALESCE(uf2.following_count, 0)::int as following_count,
        COALESCE(cv.unique_venues, 0)::int as unique_venues,
        COALESCE(cb.unique_bands, 0)::int as unique_bands
      FROM users u
      LEFT JOIN (
        SELECT user_id, COUNT(*) as checkin_count
        FROM checkins
        WHERE user_id = ANY($1)
        GROUP BY user_id
      ) c ON u.id = c.user_id
      LEFT JOIN (
        SELECT user_id, COUNT(*) as badge_count
        FROM user_badges
        WHERE user_id = ANY($1)
        GROUP BY user_id
      ) ub ON u.id = ub.user_id
      LEFT JOIN (
        SELECT following_id, COUNT(*) as follower_count
        FROM user_followers
        WHERE following_id = ANY($1)
        GROUP BY following_id
      ) uf ON u.id = uf.following_id
      LEFT JOIN (
        SELECT follower_id, COUNT(*) as following_count
        FROM user_followers
        WHERE follower_id = ANY($1)
        GROUP BY follower_id
      ) uf2 ON u.id = uf2.follower_id
      LEFT JOIN (
        SELECT user_id, COUNT(DISTINCT venue_id) as unique_venues
        FROM checkins
        WHERE user_id = ANY($1)
        GROUP BY user_id
      ) cv ON u.id = cv.user_id
      LEFT JOIN (
        SELECT user_id, COUNT(DISTINCT band_id) as unique_bands
        FROM checkins
        WHERE user_id = ANY($1)
        GROUP BY user_id
      ) cb ON u.id = cb.user_id
      WHERE u.id = ANY($1)
    `;

    const result = await this.db.query(query, [userIds]);
    const statsMap = new Map<string, UserStats>();

    for (const row of result.rows) {
      statsMap.set(row.id, {
        totalCheckins: parseInt(row.checkin_count, 10) || 0,
        badgesEarned: parseInt(row.badge_count, 10) || 0,
        followersCount: parseInt(row.follower_count, 10) || 0,
        followingCount: parseInt(row.following_count, 10) || 0,
        uniqueVenues: parseInt(row.unique_venues, 10) || 0,
        uniqueBands: parseInt(row.unique_bands, 10) || 0,
      });
    }

    return statsMap;
  }
}
