/**
 * BadgeAwardService -- Grant badges and handle duplicates
 *
 * Extracted from BadgeService as part of P1 service decomposition.
 * Handles:
   - Awarding badges to users
   - Preventing duplicate awards
   - Metadata storage for badges
   - Batch awarding operations
 */

import Database from '../../config/database';
import { Badge } from '../../types';
import logger from '../../utils/logger';

export interface AwardResult {
  success: boolean;
  wasNew: boolean;
  badgeId: string;
  userId: string;
  metadata?: Record<string, any>;
  error?: string;
}

export class BadgeAwardService {
  private db = Database.getInstance();

  /**
   * Award a badge to a user.
   * Uses ON CONFLICT DO NOTHING to prevent duplicate awards.
   * Optionally stores metadata (e.g. superfan band info) in the metadata JSONB column.
   */
  async awardBadge(
    userId: string,
    badgeId: string,
    metadata?: Record<string, any>
  ): Promise<AwardResult> {
    try {
      const query = `
        INSERT INTO user_badges (user_id, badge_id, metadata)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, badge_id) DO NOTHING
        RETURNING id
      `;

      const result = await this.db.query(query, [
        userId,
        badgeId,
        metadata ? JSON.stringify(metadata) : '{}',
      ]);

      const wasNew = result.rows.length > 0;

      if (wasNew) {
        logger.info(`[BadgeAwardService] Badge awarded`, { userId, badgeId, metadata });
      } else {
        logger.debug(`[BadgeAwardService] Badge already had`, { userId, badgeId });
      }

      return {
        success: true,
        wasNew,
        badgeId,
        userId,
        metadata,
      };
    } catch (err) {
      logger.error(`[BadgeAwardService] Failed to award badge`, {
        userId,
        badgeId,
        error: err instanceof Error ? err.message : String(err),
      });

      return {
        success: false,
        wasNew: false,
        badgeId,
        userId,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Award multiple badges to a user in a batch.
   * Returns results for each badge award attempt.
   */
  async awardBadgesBatch(
    userId: string,
    badgesWithMetadata: Array<{ badgeId: string; metadata?: Record<string, any> }>
  ): Promise<AwardResult[]> {
    const results: AwardResult[] = [];

    for (const { badgeId, metadata } of badgesWithMetadata) {
      const result = await this.awardBadge(userId, badgeId, metadata);
      results.push(result);
    }

    return results;
  }

  /**
   * Award a badge to a user with full badge details.
   * Convenience method that combines evaluation result with awarding.
   */
  async awardBadgeFromEvaluation(
    userId: string,
    badge: Badge,
    metadata?: Record<string, any>
  ): Promise<AwardResult> {
    return this.awardBadge(userId, badge.id, metadata);
  }

  /**
   * Remove a badge from a user (admin/rollback function)
   */
  async removeBadge(userId: string, badgeId: string): Promise<boolean> {
    try {
      const query = `
        DELETE FROM user_badges
        WHERE user_id = $1 AND badge_id = $2
      `;

      const result = await this.db.query(query, [userId, badgeId]);
      const wasRemoved = (result.rowCount ?? 0) > 0;

      if (wasRemoved) {
        logger.info(`[BadgeAwardService] Badge removed`, { userId, badgeId });
      }

      return wasRemoved;
    } catch (err) {
      logger.error(`[BadgeAwardService] Failed to remove badge`, {
        userId,
        badgeId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Get award history for a user
   */
  async getUserAwardHistory(userId: string): Promise<
    Array<{
      badgeId: string;
      earnedAt: Date;
      metadata?: Record<string, any>;
    }>
  > {
    const query = `
      SELECT badge_id, earned_at, metadata
      FROM user_badges
      WHERE user_id = $1
      ORDER BY earned_at DESC
    `;

    const result = await this.db.query(query, [userId]);

    return result.rows.map((row: any) => ({
      badgeId: row.badge_id,
      earnedAt: row.earned_at,
      metadata: row.metadata,
    }));
  }

  /**
   * Get all users who have earned a specific badge
   */
  async getBadgeEarners(badgeId: string): Promise<
    Array<{
      userId: string;
      earnedAt: Date;
      metadata?: Record<string, any>;
    }>
  > {
    const query = `
      SELECT user_id, earned_at, metadata
      FROM user_badges
      WHERE badge_id = $1
      ORDER BY earned_at DESC
    `;

    const result = await this.db.query(query, [badgeId]);

    return result.rows.map((row: any) => ({
      userId: row.user_id,
      earnedAt: row.earned_at,
      metadata: row.metadata,
    }));
  }

  /**
   * Check if a specific award would be a duplicate
   */
  async wouldBeDuplicate(userId: string, badgeId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM user_badges
      WHERE user_id = $1 AND badge_id = $2
    `;

    const result = await this.db.query(query, [userId, badgeId]);
    return result.rows.length > 0;
  }

  /**
   * Update metadata for an existing badge award
   */
  async updateAwardMetadata(
    userId: string,
    badgeId: string,
    metadata: Record<string, any>
  ): Promise<boolean> {
    try {
      const query = `
        UPDATE user_badges
        SET metadata = $3
        WHERE user_id = $1 AND badge_id = $2
      `;

      const result = await this.db.query(query, [
        userId,
        badgeId,
        JSON.stringify(metadata),
      ]);

      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      logger.error(`[BadgeAwardService] Failed to update award metadata`, {
        userId,
        badgeId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }
}
