"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BadgeController = void 0;
const BadgeService_1 = require("../services/BadgeService");
class BadgeController {
    constructor() {
        this.badgeService = new BadgeService_1.BadgeService();
        /**
         * Get all available badges
         * GET /api/badges
         */
        this.getAllBadges = async (req, res) => {
            try {
                const badges = await this.badgeService.getAllBadges();
                const response = {
                    success: true,
                    data: badges,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get all badges error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch badges',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get badges earned by a specific user
         * GET /api/badges/user/:userId
         */
        this.getUserBadges = async (req, res) => {
            try {
                const { userId } = req.params;
                const userBadges = await this.badgeService.getUserBadges(userId);
                const response = {
                    success: true,
                    data: userBadges,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get user badges error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch user badges',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get current user's badges
         * GET /api/badges/my-badges
         */
        this.getMyBadges = async (req, res) => {
            try {
                if (!req.user) {
                    const response = {
                        success: false,
                        error: 'Authentication required',
                    };
                    res.status(401).json(response);
                    return;
                }
                const userBadges = await this.badgeService.getUserBadges(req.user.id);
                const response = {
                    success: true,
                    data: userBadges,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get my badges error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch your badges',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Check and award new badges to current user
         * POST /api/badges/check-awards
         */
        this.checkAndAwardBadges = async (req, res) => {
            try {
                if (!req.user) {
                    const response = {
                        success: false,
                        error: 'Authentication required',
                    };
                    res.status(401).json(response);
                    return;
                }
                const newBadges = await this.badgeService.checkAndAwardBadges(req.user.id);
                const response = {
                    success: true,
                    data: {
                        newBadges,
                        count: newBadges.length,
                    },
                    message: newBadges.length > 0
                        ? `Congratulations! You earned ${newBadges.length} new badge${newBadges.length > 1 ? 's' : ''}!`
                        : 'No new badges earned at this time',
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Check and award badges error:', error);
                const response = {
                    success: false,
                    error: 'Failed to check badge awards',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get badge rarity data
         * GET /api/badges/rarity
         */
        this.getBadgeRarity = async (req, res) => {
            try {
                const rarity = await this.badgeService.getBadgeRarity();
                const response = {
                    success: true,
                    data: rarity,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get badge rarity error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch badge rarity',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get badge leaderboard
         * GET /api/badges/leaderboard
         */
        this.getBadgeLeaderboard = async (req, res) => {
            try {
                const limit = req.query.limit ? parseInt(req.query.limit) : 20;
                const leaderboard = await this.badgeService.getBadgeLeaderboard(limit);
                const response = {
                    success: true,
                    data: leaderboard,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get badge leaderboard error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch badge leaderboard',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get current user's badge progress
         * GET /api/badges/my-progress
         */
        this.getMyBadgeProgress = async (req, res) => {
            try {
                if (!req.user) {
                    const response = {
                        success: false,
                        error: 'Authentication required',
                    };
                    res.status(401).json(response);
                    return;
                }
                const progress = await this.badgeService.getUserBadgeProgress(req.user.id);
                const response = {
                    success: true,
                    data: progress,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get badge progress error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch badge progress',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get badge by ID
         * GET /api/badges/:id
         */
        this.getBadgeById = async (req, res) => {
            try {
                const { id } = req.params;
                const badge = await this.badgeService.getBadgeById(id);
                if (!badge) {
                    const response = {
                        success: false,
                        error: 'Badge not found',
                    };
                    res.status(404).json(response);
                    return;
                }
                const response = {
                    success: true,
                    data: badge,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get badge by ID error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch badge',
                };
                res.status(500).json(response);
            }
        };
    }
}
exports.BadgeController = BadgeController;
//# sourceMappingURL=BadgeController.js.map