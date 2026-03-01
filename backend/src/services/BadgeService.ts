/**
 * Badge Service -- Data-driven badge evaluation engine
 *
 * Replaces the old review-based badge system with a checkin-based,
 * data-driven evaluation pipeline using the evaluator registry.
 *
 * Flow: evaluateAndAward(userId) ->
 *   1. Load badge definitions with JSONB criteria
 *   2. Load user's existing badges
 *   3. Group unearned badges by criteria.type
 *   4. Run each evaluator once per type (N+1 optimization)
 *   5. Award newly earned badges
 *   6. Send notification (DB row) + WebSocket event for each
 */

import Database from '../config/database';
import { Badge, UserBadge, BadgeType } from '../types';
import { evaluatorRegistry, EvalResult } from './BadgeEvaluators';
import { NotificationService } from './NotificationService';
import { AuditService } from './AuditService';
import { sendToUser } from '../utils/websocket';
import logger from '../utils/logger';

export class BadgeService {
  private db = Database.getInstance();
  private auditService = new AuditService();

  /**
   * Get all available badges
   */
  async getAllBadges(): Promise<Badge[]> {
    const query = `
      SELECT id, name, description, icon_url, badge_type, requirement_value, color, criteria, created_at
      FROM badges
      ORDER BY requirement_value ASC, name ASC
    `;

    const result = await this.db.query(query);
    return result.rows.map((row: any) => this.mapDbBadgeToBadge(row));
  }

  /**
   * Get badges earned by a user
   */
  async getUserBadges(userId: string): Promise<UserBadge[]> {
    const query = `
      SELECT ub.id, ub.user_id, ub.badge_id, ub.earned_at,
             b.name, b.description, b.icon_url, b.badge_type, b.requirement_value, b.color, b.criteria, b.created_at
      FROM user_badges ub
      JOIN badges b ON ub.badge_id = b.id
      WHERE ub.user_id = $1
      ORDER BY ub.earned_at DESC
    `;

    const result = await this.db.query(query, [userId]);
    return result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      badgeId: row.badge_id,
      earnedAt: row.earned_at,
      badge: this.mapDbBadgeToBadge(row),
    }));
  }

  /**
   * Check and award badges to a user based on their activities.
   * Delegates to evaluateAndAward().
   */
  async checkAndAwardBadges(userId: string): Promise<Badge[]> {
    return this.evaluateAndAward(userId);
  }

  /**
   * Evaluate all badge criteria for a user and award newly earned badges.
   *
   * N+1 optimization: Groups badges by criteria.type and runs each evaluator
   * once per type (exception: genre_explorer runs once per genre).
   *
   * For each newly awarded badge, sends:
   *   1. NotificationService.createNotification() -- persistent DB row
   *   2. sendToUser() -- real-time WebSocket event for in-app toast
   */
  async evaluateAndAward(userId: string): Promise<Badge[]> {
    const newBadges: Badge[] = [];

    // 1. Load all badge definitions with criteria
    const badgeResult = await this.db.query(
      `SELECT id, name, badge_type, requirement_value, criteria, description, icon_url, color
       FROM badges
       WHERE criteria IS NOT NULL AND criteria != '{}'::jsonb`
    );
    const allBadges: Badge[] = badgeResult.rows.map((row: any) => this.mapDbBadgeToBadge(row));

    if (allBadges.length === 0) return newBadges;

    // 2. Load user's existing badge IDs
    const existingResult = await this.db.query(
      'SELECT badge_id FROM user_badges WHERE user_id = $1',
      [userId]
    );
    const earnedBadgeIds = new Set(existingResult.rows.map((r: any) => r.badge_id));

    // 3. Filter to unearned badges only
    const unearnedBadges = allBadges.filter(b => !earnedBadgeIds.has(b.id));
    if (unearnedBadges.length === 0) return newBadges;

    // 4. Group unearned badges by criteria.type
    const typeGroups = new Map<string, Badge[]>();
    for (const badge of unearnedBadges) {
      const type = badge.criteria?.type;
      if (!type) continue;

      // For genre_explorer, group by type+genre to run one query per genre
      const groupKey = type === 'genre_explorer'
        ? `genre_explorer:${(badge.criteria?.genre || '').toLowerCase()}`
        : type;

      if (!typeGroups.has(groupKey)) {
        typeGroups.set(groupKey, []);
      }
      typeGroups.get(groupKey)!.push(badge);
    }

    // 5. For each type group, run evaluator once and match against all badges
    for (const [groupKey, badges] of typeGroups) {
      const type = groupKey.includes(':') ? groupKey.split(':')[0] : groupKey;
      const evaluator = evaluatorRegistry.get(type);
      if (!evaluator) continue;

      // Use criteria from the first badge in the group (they share the same type/genre)
      const criteria = badges[0].criteria || {};

      try {
        const result: EvalResult = await evaluator(userId, criteria);

        // Check each badge in this group against the evaluator result
        for (const badge of badges) {
          const threshold = badge.criteria?.threshold ?? badge.requirementValue ?? 0;
          const earned = result.current >= threshold;

          if (earned) {
            await this.awardBadge(userId, badge.id, result.metadata);
            newBadges.push(badge);

            // Audit log: badge awarded (fire-and-forget, no request context in batch jobs)
            this.auditService.logBadgeAwarded(userId, badge.id, badge.name);
          }
        }
      } catch (err) {
        logger.error(`[BadgeService] Evaluator error for type '${type}'`, { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
        // Continue with other evaluators -- one failure should not block others
      }
    }

    // 6. Send notifications for each newly awarded badge
    if (newBadges.length > 0) {
      const notificationService = new NotificationService();

      for (const badge of newBadges) {
        // a) Create persistent notification row in database
        try {
          await notificationService.createNotification({
            userId,
            type: 'badge_earned',
            title: `Badge Earned: ${badge.name}`,
            message: badge.description,
            badgeId: badge.id,
          });
        } catch (err) {
          logger.error(`[BadgeService] Notification create failed for badge ${badge.id}`, { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
          // Non-fatal -- badge was already awarded
        }

        // b) Send real-time WebSocket event for in-app toast
        try {
          sendToUser(userId, 'badge_earned', {
            badgeId: badge.id,
            badgeName: badge.name,
            badgeColor: badge.color,
            badgeIconUrl: badge.iconUrl,
          });
        } catch (err) {
          logger.error(`[BadgeService] WebSocket send failed for badge ${badge.id}`, { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
          // Non-fatal -- badge was already awarded
        }
      }
    }

    return newBadges;
  }

  /**
   * Award a badge to a user.
   * Uses ON CONFLICT DO NOTHING to prevent duplicate awards.
   * Optionally stores metadata (e.g. superfan band info) in the metadata JSONB column.
   */
  async awardBadge(userId: string, badgeId: string, metadata?: Record<string, any>): Promise<void> {
    const query = `
      INSERT INTO user_badges (user_id, badge_id, metadata)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, badge_id) DO NOTHING
    `;

    await this.db.query(query, [userId, badgeId, metadata ? JSON.stringify(metadata) : '{}']);
  }

  /**
   * Get badge rarity: for each badge, how many users earned it vs total active users.
   * Returns earned_count and rarity_pct (percentage of users who have the badge).
   */
  async getBadgeRarity(): Promise<Array<{
    badgeId: string;
    name: string;
    category: string;
    threshold: number;
    earnedCount: number;
    totalUsers: number;
    rarityPct: number;
  }>> {
    const query = `
      SELECT
        b.id, b.name, b.badge_type as category, b.requirement_value,
        COALESCE(ub_counts.earned_count, 0)::int as earned_count,
        u_total.total_users::int as total_users,
        CASE WHEN u_total.total_users > 0
          THEN ROUND(COALESCE(ub_counts.earned_count, 0)::numeric / u_total.total_users * 100, 1)
          ELSE 0
        END as rarity_pct
      FROM badges b
      CROSS JOIN (SELECT COUNT(*) as total_users FROM users WHERE is_active = true) u_total
      LEFT JOIN (
        SELECT badge_id, COUNT(*) as earned_count
        FROM user_badges
        GROUP BY badge_id
      ) ub_counts ON b.id = ub_counts.badge_id
      ORDER BY b.badge_type, b.requirement_value
    `;

    const result = await this.db.query(query);
    return result.rows.map((row: any) => ({
      badgeId: row.id,
      name: row.name,
      category: row.category,
      threshold: row.requirement_value,
      earnedCount: parseInt(row.earned_count),
      totalUsers: parseInt(row.total_users),
      rarityPct: parseFloat(row.rarity_pct),
    }));
  }

  /**
   * Get badge by ID
   */
  async getBadgeById(badgeId: string): Promise<Badge | null> {
    const query = `
      SELECT id, name, description, icon_url, badge_type, requirement_value, color, criteria, created_at
      FROM badges
      WHERE id = $1
    `;

    const result = await this.db.query(query, [badgeId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDbBadgeToBadge(result.rows[0]);
  }

  /**
   * Get badge leaderboard (users with most badges)
   */
  async getBadgeLeaderboard(limit: number = 20): Promise<Array<{
    user: {
      id: string;
      username: string;
      firstName?: string;
      lastName?: string;
      profileImageUrl?: string;
    };
    badgeCount: number;
    recentBadges: Badge[];
  }>> {
    const query = `
      SELECT u.id, u.username, u.first_name, u.last_name, u.profile_image_url,
             COUNT(ub.id) as badge_count
      FROM users u
      LEFT JOIN user_badges ub ON u.id = ub.user_id
      WHERE u.is_active = true
      GROUP BY u.id, u.username, u.first_name, u.last_name, u.profile_image_url
      HAVING COUNT(ub.id) > 0
      ORDER BY badge_count DESC, u.username ASC
      LIMIT $1
    `;

    const result = await this.db.query(query, [limit]);

    const leaderboard = [];
    for (const row of result.rows) {
      const recentBadgesQuery = `
        SELECT b.id, b.name, b.description, b.icon_url, b.badge_type, b.requirement_value, b.color, b.criteria, b.created_at
        FROM user_badges ub
        JOIN badges b ON ub.badge_id = b.id
        WHERE ub.user_id = $1
        ORDER BY ub.earned_at DESC
        LIMIT 3
      `;

      const recentBadgesResult = await this.db.query(recentBadgesQuery, [row.id]);
      const recentBadges = recentBadgesResult.rows.map((badgeRow: any) => this.mapDbBadgeToBadge(badgeRow));

      leaderboard.push({
        user: {
          id: row.id,
          username: row.username,
          firstName: row.first_name,
          lastName: row.last_name,
          profileImageUrl: row.profile_image_url,
        },
        badgeCount: parseInt(row.badge_count),
        recentBadges,
      });
    }

    return leaderboard;
  }

  /**
   * Check if user has specific badge
   */
  async userHasBadge(userId: string, badgeId: string): Promise<boolean> {
    const query = `
      SELECT 1 FROM user_badges
      WHERE user_id = $1 AND badge_id = $2
    `;

    const result = await this.db.query(query, [userId, badgeId]);
    return result.rows.length > 0;
  }

  /**
   * Get badge progress for a user (how close they are to earning badges).
   *
   * Uses evaluator registry for data-driven progress calculation.
   * Groups badges by criteria.type and runs each evaluator once (N+1 optimization).
   */
  async getUserBadgeProgress(userId: string): Promise<Array<{
    badge: Badge;
    progress: number;
    isEarned: boolean;
  }>> {
    // Load all badge definitions with criteria
    const allBadges = await this.getAllBadges();
    const userBadges = await this.getUserBadges(userId);
    const earnedBadgeIds = new Set(userBadges.map(ub => ub.badgeId));

    // Group badges by criteria.type (genre_explorer grouped by genre)
    const typeGroups = new Map<string, Badge[]>();
    const badgesWithoutCriteria: Badge[] = [];

    for (const badge of allBadges) {
      const type = badge.criteria?.type;
      if (!type) {
        badgesWithoutCriteria.push(badge);
        continue;
      }

      const groupKey = type === 'genre_explorer'
        ? `genre_explorer:${(badge.criteria?.genre || '').toLowerCase()}`
        : type;

      if (!typeGroups.has(groupKey)) {
        typeGroups.set(groupKey, []);
      }
      typeGroups.get(groupKey)!.push(badge);
    }

    // Run each evaluator once per type group
    const evalCache = new Map<string, EvalResult>();

    for (const [groupKey, badges] of typeGroups) {
      const type = groupKey.includes(':') ? groupKey.split(':')[0] : groupKey;
      const evaluator = evaluatorRegistry.get(type);
      if (!evaluator) continue;

      const criteria = badges[0].criteria || {};

      try {
        const result = await evaluator(userId, criteria);
        evalCache.set(groupKey, result);
      } catch (err) {
        logger.error(`[BadgeService] Progress evaluator error for '${type}'`, { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
      }
    }

    // Build progress array
    const progressList: Array<{ badge: Badge; progress: number; isEarned: boolean }> = [];

    for (const [groupKey, badges] of typeGroups) {
      const evalResult = evalCache.get(groupKey);

      for (const badge of badges) {
        const isEarned = earnedBadgeIds.has(badge.id);
        const threshold = badge.criteria?.threshold ?? badge.requirementValue ?? 0;

        let progress = 0;
        if (evalResult && threshold > 0) {
          progress = Math.min(100, Math.round((evalResult.current / threshold) * 100));
        } else if (isEarned) {
          progress = 100;
        }

        progressList.push({ badge, progress, isEarned });
      }
    }

    // Include badges without criteria (progress = earned ? 100 : 0)
    for (const badge of badgesWithoutCriteria) {
      const isEarned = earnedBadgeIds.has(badge.id);
      progressList.push({
        badge,
        progress: isEarned ? 100 : 0,
        isEarned,
      });
    }

    return progressList;
  }

  /**
   * Map database badge row to Badge type
   */
  private mapDbBadgeToBadge(row: any): Badge {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      iconUrl: row.icon_url,
      badgeType: row.badge_type,
      requirementValue: row.requirement_value,
      color: row.color,
      criteria: row.criteria || undefined,
      createdAt: row.created_at,
    };
  }
}
