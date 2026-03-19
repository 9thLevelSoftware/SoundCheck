import Database from '../config/database';
import { User } from '../types';
import { mapDbUserToUser } from '../utils/dbMappers';
import { NotificationService } from './NotificationService';
import logger from '../utils/logger';

export interface FollowResult {
  success: boolean;
  isFollowing: boolean;
  isNew?: boolean;
}

export interface FollowerListResult {
  users: User[];
  total: number;
  page: number;
  limit: number;
}

export class FollowService {
  private db = Database.getInstance();
  private notificationService: NotificationService;

  constructor(notificationService?: NotificationService) {
    this.notificationService = notificationService ?? new NotificationService();
  }

  /**
   * Follow a user
   */
  async followUser(followerId: string, followingId: string): Promise<FollowResult> {
    // Verify target user exists and is active
    const targetUserQuery = `
      SELECT id FROM users WHERE id = $1 AND is_active = true
    `;
    const targetResult = await this.db.query(targetUserQuery, [followingId]);
    if (targetResult.rows.length === 0) {
      throw new Error('User not found');
    }

    // Create follow relationship (ON CONFLICT handles duplicates -- no pre-check needed)
    const query = `
      INSERT INTO user_followers (follower_id, following_id)
      VALUES ($1, $2)
      ON CONFLICT (follower_id, following_id) DO NOTHING
      RETURNING id
    `;

    const result = await this.db.query(query, [followerId, followingId]);
<<<<<<< HEAD

    // Only send notification if this is a new follow (not a duplicate)
    if (result.rows.length > 0) {
      try {
        await this.notificationService.createNotification({
          userId: followingId,        // recipient: the user being followed
          type: 'new_follower',
          fromUserId: followerId,     // actor: who followed
          message: 'started following you',
        });
      } catch (err) {
        // Fire-and-forget: notification failure must not block the follow
        logger.debug('Warning: follow notification failed', { error: err instanceof Error ? err.message : String(err) });
      }
    }
=======
>>>>>>> worktree-agent-ac41ef45

    return { success: true, isFollowing: true, isNew: result.rows.length > 0 };
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(followerId: string, followingId: string): Promise<FollowResult> {
    const query = `
      DELETE FROM user_followers
      WHERE follower_id = $1 AND following_id = $2
      RETURNING id
    `;

    const result = await this.db.query(query, [followerId, followingId]);

    return {
      success: true,
      isFollowing: false,
    };
  }

  /**
   * Check if a user is following another user
   */
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const query = `
      SELECT id FROM user_followers
      WHERE follower_id = $1 AND following_id = $2
    `;

    const result = await this.db.query(query, [followerId, followingId]);
    return result.rows.length > 0;
  }

  /**
   * Get list of followers for a user (users who follow this user)
   * Returns null if the user does not exist
   */
  async getFollowers(
    userId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<FollowerListResult | null> {
    // Verify target user exists and is active
    const userCheckQuery = `SELECT id FROM users WHERE id = $1 AND is_active = true`;
    const userCheckResult = await this.db.query(userCheckQuery, [userId]);
    if (userCheckResult.rows.length === 0) {
      return null;
    }

    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const offset = (page - 1) * limit;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM user_followers uf
      INNER JOIN users u ON u.id = uf.follower_id
      WHERE uf.following_id = $1 AND u.is_active = true
    `;
    const countResult = await this.db.query(countQuery, [userId]);
    const total = parseInt(countResult.rows[0].total) || 0;

    // Get followers with user details
    const query = `
      SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.bio,
             u.profile_image_url, u.location, u.date_of_birth, u.is_verified,
             u.is_active, u.created_at, u.updated_at, uf.created_at as followed_at
      FROM user_followers uf
      INNER JOIN users u ON u.id = uf.follower_id
      WHERE uf.following_id = $1 AND u.is_active = true
      ORDER BY uf.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.db.query(query, [userId, limit, offset]);
    const users = result.rows.map((row: any) => mapDbUserToUser(row));

    return {
      users,
      total,
      page,
      limit,
    };
  }

  /**
   * Get list of users that a user is following
   * Returns null if the user does not exist
   */
  async getFollowing(
    userId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<FollowerListResult | null> {
    // Verify target user exists and is active
    const userCheckQuery = `SELECT id FROM users WHERE id = $1 AND is_active = true`;
    const userCheckResult = await this.db.query(userCheckQuery, [userId]);
    if (userCheckResult.rows.length === 0) {
      return null;
    }

    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const offset = (page - 1) * limit;

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM user_followers uf
      INNER JOIN users u ON u.id = uf.following_id
      WHERE uf.follower_id = $1 AND u.is_active = true
    `;
    const countResult = await this.db.query(countQuery, [userId]);
    const total = parseInt(countResult.rows[0].total) || 0;

    // Get following with user details
    const query = `
      SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.bio,
             u.profile_image_url, u.location, u.date_of_birth, u.is_verified,
             u.is_active, u.created_at, u.updated_at, uf.created_at as followed_at
      FROM user_followers uf
      INNER JOIN users u ON u.id = uf.following_id
      WHERE uf.follower_id = $1 AND u.is_active = true
      ORDER BY uf.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.db.query(query, [userId, limit, offset]);
    const users = result.rows.map((row: any) => mapDbUserToUser(row));

    return {
      users,
      total,
      page,
      limit,
    };
  }

  /**
   * Get follow counts for a user
   */
  async getFollowCounts(userId: string): Promise<{ followersCount: number; followingCount: number }> {
    const query = `
      SELECT
        (SELECT COUNT(*) FROM user_followers WHERE following_id = $1) as followers_count,
        (SELECT COUNT(*) FROM user_followers WHERE follower_id = $1) as following_count
    `;

    const result = await this.db.query(query, [userId]);

    if (!result.rows.length) {
      return { followersCount: 0, followingCount: 0 };
    }

    return {
      followersCount: parseInt(result.rows[0].followers_count) || 0,
      followingCount: parseInt(result.rows[0].following_count) || 0,
    };
  }
}
