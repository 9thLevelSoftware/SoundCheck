/**
 * BadgeEvaluationService -- Check if user qualifies for badges
 *
 * Extracted from BadgeService as part of P1 service decomposition.
 * Handles:
 *   - Badge criteria evaluation
 *   - N+1 optimization via grouped evaluator calls
 *   - Badge progress calculation
 */

import Database from '../../config/database';
import { Badge } from '../../types';
import { evaluatorRegistry, EvalResult } from '../BadgeEvaluators';
import logger from '../../utils/logger';

export interface BadgeProgress {
  badge: Badge;
  progress: number;
  isEarned: boolean;
}

export interface EvaluationResult {
  badge: Badge;
  earned: boolean;
  currentValue: number;
  threshold: number;
  metadata?: Record<string, any>;
}

export class BadgeEvaluationService {
  private db = Database.getInstance();

  /**
   * Evaluate a single badge for a user
   */
  async evaluate(userId: string, badge: Badge): Promise<EvaluationResult> {
    const type = badge.criteria?.type;
    if (!type) {
      return {
        badge,
        earned: false,
        currentValue: 0,
        threshold: badge.requirementValue || 0,
      };
    }

    const evaluator = evaluatorRegistry.get(type);
    if (!evaluator) {
      logger.warn(`[BadgeEvaluationService] No evaluator found for type: ${type}`);
      return {
        badge,
        earned: false,
        currentValue: 0,
        threshold: badge.requirementValue || 0,
      };
    }

    try {
      const result = await evaluator(userId, badge.criteria || {});
      const threshold = badge.criteria?.threshold ?? badge.requirementValue ?? 0;
      const earned = result.current >= threshold;

      return {
        badge,
        earned,
        currentValue: result.current,
        threshold,
        metadata: result.metadata,
      };
    } catch (err) {
      logger.error(`[BadgeEvaluationService] Evaluator error for type '${type}'`, {
        error: err instanceof Error ? err.message : String(err),
        userId,
        badgeId: badge.id,
      });

      return {
        badge,
        earned: false,
        currentValue: 0,
        threshold: badge.requirementValue || 0,
      };
    }
  }

  /**
   * Evaluate multiple badges efficiently using N+1 optimization.
   * Groups badges by criteria.type and runs each evaluator once per type.
   */
  async evaluateMany(userId: string, badges: Badge[]): Promise<EvaluationResult[]> {
    if (badges.length === 0) return [];

    // Group badges by criteria.type (genre_explorer grouped by genre)
    const typeGroups = new Map<string, Badge[]>();
    const badgesWithoutCriteria: Badge[] = [];

    for (const badge of badges) {
      const type = badge.criteria?.type;
      if (!type) {
        badgesWithoutCriteria.push(badge);
        continue;
      }

      const groupKey =
        type === 'genre_explorer'
          ? `genre_explorer:${(badge.criteria?.genre || '').toLowerCase()}`
          : type;

      if (!typeGroups.has(groupKey)) {
        typeGroups.set(groupKey, []);
      }
      typeGroups.get(groupKey)!.push(badge);
    }

    const results: EvaluationResult[] = [];

    // Run each evaluator once per type group
    for (const [groupKey, groupBadges] of typeGroups) {
      const type = groupKey.includes(':') ? groupKey.split(':')[0] : groupKey;
      const evaluator = evaluatorRegistry.get(type);

      if (!evaluator) {
        logger.warn(`[BadgeEvaluationService] No evaluator found for type: ${type}`);
        for (const badge of groupBadges) {
          results.push({
            badge,
            earned: false,
            currentValue: 0,
            threshold: badge.requirementValue || 0,
          });
        }
        continue;
      }

      // Use criteria from the first badge in the group
      const criteria = groupBadges[0].criteria || {};

      try {
        const evalResult: EvalResult = await evaluator(userId, criteria);

        // Check each badge in this group against the evaluator result
        for (const badge of groupBadges) {
          const threshold = badge.criteria?.threshold ?? badge.requirementValue ?? 0;
          const earned = evalResult.current >= threshold;

          results.push({
            badge,
            earned,
            currentValue: evalResult.current,
            threshold,
            metadata: earned ? evalResult.metadata : undefined,
          });
        }
      } catch (err) {
        logger.error(`[BadgeEvaluationService] Evaluator error for type '${type}'`, {
          error: err instanceof Error ? err.message : String(err),
          userId,
        });

        // Mark all badges in this group as not earned due to error
        for (const badge of groupBadges) {
          results.push({
            badge,
            earned: false,
            currentValue: 0,
            threshold: badge.requirementValue || 0,
          });
        }
      }
    }

    // Handle badges without criteria (progress = earned ? 100 : 0)
    for (const badge of badgesWithoutCriteria) {
      results.push({
        badge,
        earned: false,
        currentValue: 0,
        threshold: badge.requirementValue || 0,
      });
    }

    return results;
  }

  /**
   * Get badge progress for a user (how close they are to earning badges).
   * Uses evaluator registry for data-driven progress calculation.
   */
  async getUserBadgeProgress(userId: string, allBadges: Badge[], earnedBadgeIds: Set<string>): Promise<BadgeProgress[]> {
    // Group badges by criteria.type (genre_explorer grouped by genre)
    const typeGroups = new Map<string, Badge[]>();
    const badgesWithoutCriteria: Badge[] = [];

    for (const badge of allBadges) {
      const type = badge.criteria?.type;
      if (!type) {
        badgesWithoutCriteria.push(badge);
        continue;
      }

      const groupKey =
        type === 'genre_explorer'
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
        logger.error(`[BadgeEvaluationService] Progress evaluator error for '${type}'`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Build progress array
    const progressList: BadgeProgress[] = [];

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
   * Identify which badges a user is eligible for but hasn't earned yet.
   * Returns badges that the user qualifies for based on current activity.
   */
  async identifyEligibleBadges(
    userId: string,
    unearnedBadges: Badge[]
  ): Promise<EvaluationResult[]> {
    return this.evaluateMany(userId, unearnedBadges);
  }
}
