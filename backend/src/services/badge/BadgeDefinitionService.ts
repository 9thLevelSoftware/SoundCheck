/**
 * BadgeDefinitionService -- Badge CRUD and metadata operations
 *
 * Extracted from BadgeService as part of P1 service decomposition.
 * Handles:
 *   - Badge CRUD operations
 *   - Badge metadata retrieval
 *   - Badge rarity calculations
 *   - Badge leaderboard queries
 */

import Database from '../../config/database';
import { Badge, UserBadge } from '../../types';

export interface BadgeWithEarnedCount extends Badge {
  earnedCount: number;
  totalUsers: number;
  rarityPct: number;
}

export interface BadgeLeaderboardEntry {
  user: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  };
  badgeCount: number;
  recentBadges: Badge[];
}

export class BadgeDefinitionService {
  private db = Database.getInstance();

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
   * Get badge rarity: for each badge, how many users earned it vs total active users.
   * Returns earned_count and rarity_pct (percentage of users who have the badge).
   */
  async getBadgeRarity(): Promise<
    Array<{
      badgeId: string;
      name: string;
      category: string;
      threshold: number;
      earnedCount: number;
      totalUsers: number;
      rarityPct: number;
    }>
  > {
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
      earnedCount: parseInt(row.earned_count, 10),
      totalUsers: parseInt(row.total_users, 10),
      rarityPct: parseFloat(row.rarity_pct),
    }));
  }

  /**
   * Get badge leaderboard (users with most badges)
   */
  async getBadgeLeaderboard(limit: number = 20): Promise<BadgeLeaderboardEntry[]> {
    // Single query: leaderboard users + their 3 most recent badges via LATERAL join
    const query = `
      SELECT
        u.id, u.username, u.first_name, u.last_name, u.profile_image_url,
        ub_counts.badge_count,
        rb.id AS recent_badge_id, rb.name AS recent_badge_name,
        rb.description AS recent_badge_description, rb.icon_url AS recent_badge_icon_url,
        rb.badge_type AS recent_badge_type, rb.requirement_value AS recent_badge_requirement_value,
        rb.color AS recent_badge_color, rb.criteria AS recent_badge_criteria,
        rb.created_at AS recent_badge_created_at
      FROM users u
      JOIN (
        SELECT user_id, COUNT(*)::int AS badge_count
        FROM user_badges
        GROUP BY user_id
        HAVING COUNT(*) > 0
        ORDER BY badge_count DESC
        LIMIT $1
      ) ub_counts ON u.id = ub_counts.user_id
      LEFT JOIN LATERAL (
        SELECT b.id, b.name, b.description, b.icon_url, b.badge_type,
               b.requirement_value, b.color, b.criteria, b.created_at
        FROM user_badges ub
        JOIN badges b ON ub.badge_id = b.id
        WHERE ub.user_id = u.id
        ORDER BY ub.earned_at DESC
        LIMIT 3
      ) rb ON TRUE
      WHERE u.is_active = true
      ORDER BY ub_counts.badge_count DESC, u.username ASC
    `;

    const result = await this.db.query(query, [limit]);

    // Group rows by user (each user may have up to 3 rows for recent badges)
    const userMap = new Map<string, BadgeLeaderboardEntry>();

    for (const row of result.rows) {
      if (!userMap.has(row.id)) {
        userMap.set(row.id, {
          user: {
            id: row.id,
            username: row.username,
            firstName: row.first_name,
            lastName: row.last_name,
            profileImageUrl: row.profile_image_url,
          },
          badgeCount: parseInt(row.badge_count, 10),
          recentBadges: [],
        });
      }

      // Append recent badge if present (LEFT JOIN may yield null)
      if (row.recent_badge_id) {
        userMap.get(row.id)!.recentBadges.push(
          this.mapDbBadgeToBadge({
            id: row.recent_badge_id,
            name: row.recent_badge_name,
            description: row.recent_badge_description,
            icon_url: row.recent_badge_icon_url,
            badge_type: row.recent_badge_type,
            requirement_value: row.recent_badge_requirement_value,
            color: row.recent_badge_color,
            criteria: row.recent_badge_criteria,
            created_at: row.recent_badge_created_at,
          })
        );
      }
    }

    return Array.from(userMap.values());
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

  /**
   * Create a new badge (admin function)
   */
  async createBadge(badgeData: Omit<Badge, 'id' | 'createdAt'>): Promise<Badge> {
    const query = `
      INSERT INTO badges (name, description, icon_url, badge_type, requirement_value, color, criteria)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, name, description, icon_url, badge_type, requirement_value, color, criteria, created_at
    `;

    const result = await this.db.query(query, [
      badgeData.name,
      badgeData.description || null,
      badgeData.iconUrl || null,
      badgeData.badgeType,
      badgeData.requirementValue || null,
      badgeData.color || null,
      badgeData.criteria ? JSON.stringify(badgeData.criteria) : '{}',
    ]);

    return this.mapDbBadgeToBadge(result.rows[0]);
  }

  /**
   * Update a badge (admin function)
   */
  async updateBadge(
    badgeId: string,
    badgeData: Partial<Omit<Badge, 'id' | 'createdAt'>>
  ): Promise<Badge | null> {
    const allowedFields = [
      'name',
      'description',
      'iconUrl',
      'badgeType',
      'requirementValue',
      'color',
      'criteria',
    ];
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(badgeData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        const dbField = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
        updates.push(`${dbField} = $${paramCount}`);
        values.push(key === 'criteria' && value ? JSON.stringify(value) : value);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(badgeId);
    const query = `
      UPDATE badges 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, name, description, icon_url, badge_type, requirement_value, color, criteria, created_at
    `;

    const result = await this.db.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDbBadgeToBadge(result.rows[0]);
  }

  /**
   * Delete a badge (admin function, cascades to user_badges)
   */
  async deleteBadge(badgeId: string): Promise<boolean> {
    const query = `DELETE FROM badges WHERE id = $1`;
    const result = await this.db.query(query, [badgeId]);
    return (result.rowCount ?? 0) > 0;
  }
}
