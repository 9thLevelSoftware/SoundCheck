import { Request, Response } from 'express';
export declare class BadgeController {
    private badgeService;
    /**
     * Get all available badges
     * GET /api/badges
     */
    getAllBadges: (req: Request, res: Response) => Promise<void>;
    /**
     * Get badges earned by a specific user
     * GET /api/badges/user/:userId
     */
    getUserBadges: (req: Request, res: Response) => Promise<void>;
    /**
     * Get current user's badges
     * GET /api/badges/my-badges
     */
    getMyBadges: (req: Request, res: Response) => Promise<void>;
    /**
     * Check and award new badges to current user
     * POST /api/badges/check-awards
     */
    checkAndAwardBadges: (req: Request, res: Response) => Promise<void>;
    /**
     * Get badge rarity data
     * GET /api/badges/rarity
     */
    getBadgeRarity: (req: Request, res: Response) => Promise<void>;
    /**
     * Get badge leaderboard
     * GET /api/badges/leaderboard
     */
    getBadgeLeaderboard: (req: Request, res: Response) => Promise<void>;
    /**
     * Get current user's badge progress
     * GET /api/badges/my-progress
     */
    getMyBadgeProgress: (req: Request, res: Response) => Promise<void>;
    /**
     * Get badge by ID
     * GET /api/badges/:id
     */
    getBadgeById: (req: Request, res: Response) => Promise<void>;
}
//# sourceMappingURL=BadgeController.d.ts.map