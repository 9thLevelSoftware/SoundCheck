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
import { Badge, UserBadge } from '../types';
export declare class BadgeService {
    private db;
    private auditService;
    /**
     * Get all available badges
     */
    getAllBadges(): Promise<Badge[]>;
    /**
     * Get badges earned by a user
     */
    getUserBadges(userId: string): Promise<UserBadge[]>;
    /**
     * Check and award badges to a user based on their activities.
     * Delegates to evaluateAndAward().
     */
    checkAndAwardBadges(userId: string): Promise<Badge[]>;
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
    evaluateAndAward(userId: string): Promise<Badge[]>;
    /**
     * Award a badge to a user.
     * Uses ON CONFLICT DO NOTHING to prevent duplicate awards.
     * Optionally stores metadata (e.g. superfan band info) in the metadata JSONB column.
     */
    awardBadge(userId: string, badgeId: string, metadata?: Record<string, any>): Promise<void>;
    /**
     * Get badge rarity: for each badge, how many users earned it vs total active users.
     * Returns earned_count and rarity_pct (percentage of users who have the badge).
     */
    getBadgeRarity(): Promise<Array<{
        badgeId: string;
        name: string;
        category: string;
        threshold: number;
        earnedCount: number;
        totalUsers: number;
        rarityPct: number;
    }>>;
    /**
     * Get badge by ID
     */
    getBadgeById(badgeId: string): Promise<Badge | null>;
    /**
     * Get badge leaderboard (users with most badges)
     */
    getBadgeLeaderboard(limit?: number): Promise<Array<{
        user: {
            id: string;
            username: string;
            firstName?: string;
            lastName?: string;
            profileImageUrl?: string;
        };
        badgeCount: number;
        recentBadges: Badge[];
    }>>;
    /**
     * Check if user has specific badge
     */
    userHasBadge(userId: string, badgeId: string): Promise<boolean>;
    /**
     * Get badge progress for a user (how close they are to earning badges).
     *
     * Uses evaluator registry for data-driven progress calculation.
     * Groups badges by criteria.type and runs each evaluator once (N+1 optimization).
     */
    getUserBadgeProgress(userId: string): Promise<Array<{
        badge: Badge;
        progress: number;
        isEarned: boolean;
    }>>;
    /**
     * Map database badge row to Badge type
     */
    private mapDbBadgeToBadge;
}
//# sourceMappingURL=BadgeService.d.ts.map