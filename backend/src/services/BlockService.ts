import Database from '../config/database';
import { UserBlock } from '../types';
import { mapDbRowToUserBlock } from '../utils/dbMappers';

/**
 * BlockService: Manages user blocking with bilateral content filtering.
 *
 * Key design:
 *   - Blocks are unidirectional in storage (blocker_id -> blocked_id)
 *   - Content filtering is bilateral (both users cannot see each other)
 *   - getBlockFilterSQL() returns a reusable SQL fragment for all content queries
 *   - Blocking auto-unfollows in both directions
 *
 * Phase 9: Trust & Safety Foundation (Plan 03)
 */
export class BlockService {
  private db: Database;

  constructor(db?: Database) {
    this.db = db || Database.getInstance();
  }

  /**
   * Block a user. Idempotent: re-blocking an already-blocked user succeeds silently.
   * Also unfollows in both directions (blocker unfollows blocked, blocked unfollows blocker).
   *
   * @throws Error if blockerId === blockedId (cannot block yourself)
   */
  async blockUser(blockerId: string, blockedId: string): Promise<UserBlock> {
    if (blockerId === blockedId) {
      const err = new Error('Cannot block yourself');
      (err as any).statusCode = 400;
      throw err;
    }

    // Validate UUIDs before any DB operations
    this.validateUUID(blockerId);
    this.validateUUID(blockedId);

    try {
      // Insert block record (idempotent via ON CONFLICT)
      const result = await this.db.query(
        `INSERT INTO user_blocks (blocker_id, blocked_id)
         VALUES ($1, $2)
         ON CONFLICT (blocker_id, blocked_id) DO UPDATE SET blocker_id = $1
         RETURNING *`,
        [blockerId, blockedId]
      );

      // Unfollow in both directions
      await this.db.query(
        `DELETE FROM user_followers
         WHERE (follower_id = $1 AND following_id = $2)
            OR (follower_id = $2 AND following_id = $1)`,
        [blockerId, blockedId]
      );

      return mapDbRowToUserBlock(result.rows[0]);
    } catch (error: any) {
      // Re-throw custom errors
      if (error.statusCode) throw error;
      console.error('Block user error:', error);
      throw error;
    }
  }

  /**
   * Unblock a user.
   *
   * @throws Error if the block doesn't exist
   */
  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    const result = await this.db.query(
      `DELETE FROM user_blocks
       WHERE blocker_id = $1 AND blocked_id = $2`,
      [blockerId, blockedId]
    );

    if (result.rowCount === 0) {
      const err = new Error('Not blocked');
      (err as any).statusCode = 404;
      throw err;
    }
  }

  /**
   * Check if a bilateral block exists between two users.
   * Returns true if EITHER user has blocked the other.
   */
  async isBlocked(userA: string, userB: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM user_blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)
       LIMIT 1`,
      [userA, userB]
    );

    return result.rows.length > 0;
  }

  /**
   * Get all users blocked by a given user.
   * Returns blocks initiated by this user only (not blocks where they are the target).
   */
  async getBlockedUsers(userId: string): Promise<UserBlock[]> {
    const result = await this.db.query(
      `SELECT * FROM user_blocks
       WHERE blocker_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows.map(mapDbRowToUserBlock);
  }

  /**
   * Returns a SQL fragment that filters out content from blocked users (bilateral).
   *
   * Usage: Append this to any WHERE clause that serves user-generated content.
   * The fragment checks both directions: content author blocked by viewer,
   * AND viewer blocked by content author.
   *
   * @param userId - The authenticated user viewing content
   * @param userColumn - The SQL column referencing the content author (e.g., 'c.user_id', 'u.id')
   * @returns SQL AND clause string
   *
   * SECURITY: userId is validated as a UUID before interpolation.
   */
  getBlockFilterSQL(userId: string, userColumn: string): string {
    this.validateUUID(userId);

    return `AND NOT EXISTS (
      SELECT 1 FROM user_blocks
      WHERE (blocker_id = '${userId}' AND blocked_id = ${userColumn})
         OR (blocker_id = ${userColumn} AND blocked_id = '${userId}')
    )`;
  }

  /**
   * Validate that a string is a valid UUID v4 format.
   * Prevents SQL injection when userId is interpolated into SQL fragments.
   */
  private validateUUID(value: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      const err = new Error('Invalid user ID format');
      (err as any).statusCode = 400;
      throw err;
    }
  }
}
