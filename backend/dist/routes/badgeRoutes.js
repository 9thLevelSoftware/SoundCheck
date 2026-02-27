"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const BadgeController_1 = require("../controllers/BadgeController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const badgeController = new BadgeController_1.BadgeController();
// Rate limiting
const generalRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 100); // 100 requests per 15 minutes
const badgeCheckRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 10); // 10 badge check requests per 15 minutes
// Public routes (no authentication required)
router.get('/', generalRateLimit, badgeController.getAllBadges);
router.get('/leaderboard', generalRateLimit, badgeController.getBadgeLeaderboard);
router.get('/rarity', generalRateLimit, badgeController.getBadgeRarity);
// Protected routes (authentication required)
router.get('/my-badges', auth_1.authenticateToken, generalRateLimit, badgeController.getMyBadges);
router.get('/my-progress', auth_1.authenticateToken, generalRateLimit, badgeController.getMyBadgeProgress);
router.post('/check-awards', auth_1.authenticateToken, badgeCheckRateLimit, badgeController.checkAndAwardBadges);
// Parameterized routes (must come after named routes)
router.get('/user/:userId', generalRateLimit, badgeController.getUserBadges);
router.get('/:id', generalRateLimit, badgeController.getBadgeById);
exports.default = router;
//# sourceMappingURL=badgeRoutes.js.map