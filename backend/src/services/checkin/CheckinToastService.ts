/**
 * CheckinToastService -- Toast and comment management for check-ins
 *
 * Extracted from CheckinService as part of v1-launch tech debt cleanup.
 * Handles:
 *   - toastCheckin() / untoastCheckin()
 *   - getToasts()
 *   - addComment() / getComments() / deleteComment()
 */

import Database from '../../config/database';
import { Toast, Comment } from './types';
import logger from '../../utils/logger';

export class CheckinToastService {
  private db = Database.getInstance();

  // ============================================
  // Toast operations
  // ============================================

  /**
   * Toast a check-in (like Untappd's toast feature)
   * Returns toast count and owner ID for WebSocket broadcasts
   */
  async toastCheckin(userId: string, checkinId: string): Promise<{ toastCount: number; ownerId: string }> {
    try {
      // Check if already toasted
      const existingToast = await this.db.query(
        'SELECT id FROM toasts WHERE checkin_id = $1 AND user_id = $2',
        [checkinId, userId]
      );

      if (existingToast.rows.length > 0) {
        throw new Error('Already toasted this check-in');
      }

      // Create toast
      await this.db.query(
        'INSERT INTO toasts (checkin_id, user_id) VALUES ($1, $2)',
        [checkinId, userId]
      );

      // Get toast count and owner ID for WebSocket broadcast
      const result = await this.db.query(
        `SELECT c.user_id as owner_id, COUNT(t.id) as toast_count
         FROM checkins c
         LEFT JOIN toasts t ON c.id = t.checkin_id
         WHERE c.id = $1
         GROUP BY c.id`,
        [checkinId]
      );

      return {
        toastCount: parseInt(result.rows[0]?.toast_count || '0'),
        ownerId: result.rows[0]?.owner_id,
      };
    } catch (error) {
      logger.error('Toast check-in error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Untoast a check-in
   */
  async untoastCheckin(userId: string, checkinId: string): Promise<void> {
    try {
      await this.db.query(
        'DELETE FROM toasts WHERE checkin_id = $1 AND user_id = $2',
        [checkinId, userId]
      );
    } catch (error) {
      logger.error('Untoast check-in error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Get toasts for a check-in
   */
  async getToasts(checkinId: string): Promise<Toast[]> {
    try {
      const query = `
        SELECT
          t.*,
          u.id as user_id, u.username, u.profile_image_url
        FROM toasts t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.checkin_id = $1
        ORDER BY t.created_at DESC
      `;

      const result = await this.db.query(query, [checkinId]);

      return result.rows.map((row: any) => ({
        id: row.id,
        checkinId: row.checkin_id,
        userId: row.user_id,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          username: row.username,
          profileImageUrl: row.profile_image_url,
        },
      }));
    } catch (error) {
      logger.error('Get toasts error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  // ============================================
  // Comment operations
  // ============================================

  /**
   * Add a comment to a check-in
   * Returns comment with owner ID for WebSocket notifications
   */
  async addComment(
    userId: string,
    checkinId: string,
    content: string
  ): Promise<Comment> {
    try {
      const query = `
        INSERT INTO checkin_comments (checkin_id, user_id, content)
        VALUES ($1, $2, $3)
        RETURNING *
      `;

      const result = await this.db.query(query, [checkinId, userId, content]);

      // Get check-in owner for WebSocket notification
      const checkin = await this.db.query(
        'SELECT user_id FROM checkins WHERE id = $1',
        [checkinId]
      );

      // Get comment with user details
      const comment = await this.getCommentById(result.rows[0].id);

      return {
        ...comment,
        ownerId: checkin.rows[0]?.user_id,
      };
    } catch (error) {
      logger.error('Add comment error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Get comments for a check-in
   */
  async getComments(checkinId: string): Promise<Comment[]> {
    try {
      const query = `
        SELECT
          c.*,
          u.id as user_id, u.username, u.profile_image_url
        FROM checkin_comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.checkin_id = $1
          AND (c.is_hidden IS NOT TRUE)
        ORDER BY c.created_at ASC
      `;

      const result = await this.db.query(query, [checkinId]);

      return result.rows.map((row: any) => ({
        id: row.id,
        checkinId: row.checkin_id,
        userId: row.user_id,
        content: row.content,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          username: row.username,
          profileImageUrl: row.profile_image_url,
        },
      }));
    } catch (error) {
      logger.error('Get comments error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Delete a comment
   */
  async deleteComment(userId: string, checkinId: string, commentId: string): Promise<void> {
    try {
      // Verify user owns the comment or the check-in
      const comment = await this.db.query(
        'SELECT user_id FROM checkin_comments WHERE id = $1 AND checkin_id = $2',
        [commentId, checkinId]
      );

      if (comment.rows.length === 0) {
        throw new Error('Comment not found');
      }

      const checkin = await this.db.query(
        'SELECT user_id FROM checkins WHERE id = $1',
        [checkinId]
      );

      if (!checkin.rows.length) {
        throw new Error('Checkin not found');
      }

      // Allow delete if user is comment author or check-in owner
      if (comment.rows[0].user_id !== userId && checkin.rows[0].user_id !== userId) {
        throw new Error('Unauthorized to delete this comment');
      }

      await this.db.query('DELETE FROM checkin_comments WHERE id = $1', [commentId]);
    } catch (error) {
      logger.error('Delete comment error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Get comment by ID
   */
  private async getCommentById(commentId: string): Promise<Comment> {
    const query = `
      SELECT
        c.*,
        u.id as user_id, u.username, u.profile_image_url
      FROM checkin_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = $1
    `;

    const result = await this.db.query(query, [commentId]);

    if (result.rows.length === 0) {
      throw new Error('Comment not found');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      checkinId: row.checkin_id,
      userId: row.user_id,
      content: row.content,
      createdAt: row.created_at,
      user: {
        id: row.user_id,
        username: row.username,
        profileImageUrl: row.profile_image_url,
      },
    };
  }
}
