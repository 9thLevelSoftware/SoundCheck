"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const UserController_1 = require("../controllers/UserController");
const FollowController_1 = require("../controllers/FollowController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const upload_1 = require("../middleware/upload");
const redisRateLimiter_1 = require("../utils/redisRateLimiter");
const validationSchemas_1 = require("../utils/validationSchemas");
const PushNotificationService_1 = require("../services/PushNotificationService");
const DataRetentionService_1 = require("../services/DataRetentionService");
const AuditService_1 = require("../services/AuditService");
// Multer error handler for profile image uploads
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer_1.default.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({ success: false, error: 'File too large. Maximum size is 5MB.' });
            return;
        }
        res.status(400).json({ success: false, error: err.message });
        return;
    }
    if (err) {
        res.status(400).json({ success: false, error: err.message });
        return;
    }
    next();
};
const router = (0, express_1.Router)();
const userController = new UserController_1.UserController();
const followController = new FollowController_1.FollowController();
const dataRetentionService = new DataRetentionService_1.DataRetentionService();
const auditService = new AuditService_1.AuditService();
// Rate limiting for auth endpoints
const authRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 5); // 5 requests per 15 minutes
const generalRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 30); // 30 requests per 15 minutes
// Enumeration protection: 5 requests per 15 minutes + jitter for timing attack prevention
const strictEnumerationLimiter = redisRateLimiter_1.enumerationLimiter.middleware();
// Public routes (no authentication required)
router.post('/register', authRateLimit, (0, validate_1.validate)(validationSchemas_1.createUserSchema), userController.register);
router.post('/login', authRateLimit, (0, validate_1.validate)(validationSchemas_1.loginUserSchema), userController.login);
// Protected routes (authentication required) - MUST come before /:username
router.get('/me', auth_1.authenticateToken, userController.getProfile);
router.put('/me', auth_1.authenticateToken, (0, validate_1.validate)(validationSchemas_1.updateProfileSchema), userController.updateProfile);
router.post('/me/profile-image', auth_1.authenticateToken, (req, res, next) => {
    (0, upload_1.uploadProfileImage)(req, res, (err) => {
        if (err) {
            return handleMulterError(err, req, res, next);
        }
        next();
    });
}, userController.uploadProfileImage);
router.delete('/me', auth_1.authenticateToken, userController.deactivateAccount);
// Account deletion routes (GDPR-compliant with 30-day grace period)
router.post('/me/delete-account', auth_1.authenticateToken, async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }
        const result = await dataRetentionService.requestAccountDeletion(userId);
        // Audit log: user deletion request
        auditService.logUserDeleted(userId, result.deletionRequest.scheduledFor, req);
        res.json({ success: true, data: result });
    }
    catch (error) {
        if (error instanceof Error &&
            (error.message === 'User not found' || error.message.includes('pending deletion request'))) {
            res.status(400).json({ success: false, error: error.message });
            return;
        }
        next(error);
    }
});
router.post('/me/cancel-deletion', auth_1.authenticateToken, async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }
        const result = await dataRetentionService.cancelDeletionRequest(userId);
        res.json({ success: true, data: result });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'No pending deletion request found') {
            res.status(400).json({ success: false, error: error.message });
            return;
        }
        next(error);
    }
});
router.get('/me/deletion-status', auth_1.authenticateToken, async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }
        const result = await dataRetentionService.getDeletionRequestStatus(userId);
        res.json({ success: true, data: result });
    }
    catch (error) {
        next(error);
    }
});
// Device token management for push notifications - MUST come before /:username
router.post('/device-token', auth_1.authenticateToken, async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }
        const { token, platform } = req.body;
        if (!token || typeof token !== 'string' || token.trim().length === 0) {
            res
                .status(400)
                .json({ success: false, error: 'Token is required and must be a non-empty string' });
            return;
        }
        if (!platform || !['android', 'ios'].includes(platform)) {
            res.status(400).json({ success: false, error: 'Platform must be "android" or "ios"' });
            return;
        }
        await PushNotificationService_1.pushNotificationService.registerDeviceToken(userId, token.trim(), platform);
        res.json({ success: true });
    }
    catch (error) {
        next(error);
    }
});
router.delete('/device-token', auth_1.authenticateToken, async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: 'Authentication required' });
            return;
        }
        const { token } = req.body;
        if (!token || typeof token !== 'string' || token.trim().length === 0) {
            res
                .status(400)
                .json({ success: false, error: 'Token is required and must be a non-empty string' });
            return;
        }
        await PushNotificationService_1.pushNotificationService.removeDeviceToken(userId, token.trim());
        res.json({ success: true });
    }
    catch (error) {
        next(error);
    }
});
// Username and email availability check - MUST come before /:username
// SEC-007/CFR-015: Protected with strict enumeration rate limiting and jitter
router.get('/check-username/:username', strictEnumerationLimiter, (0, auth_1.addJitter)(50, 150), (0, validate_1.validate)(validationSchemas_1.checkUsernameSchema), userController.checkUsername);
router.get('/check-email', strictEnumerationLimiter, (0, auth_1.addJitter)(50, 150), (0, validate_1.validate)(validationSchemas_1.checkEmailSchema), userController.checkEmail); // Changed to query param
// Followers/Following routes - use userId (UUID) for these
// These are public routes since follower/following lists are typically public info
// GET /api/users/:userId/followers - get followers of a user
router.get('/:userId/followers', generalRateLimit, followController.getFollowers);
// GET /api/users/:userId/following - get users that this user is following
router.get('/:userId/following', generalRateLimit, followController.getFollowing);
// GET /api/users/:userId/stats - get user stats by ID
router.get('/:userId/stats', auth_1.authenticateToken, userController.getUserStats);
// GET /api/users/:userId/concert-cred - get concert cred stats
router.get('/:userId/concert-cred', auth_1.authenticateToken, userController.getConcertCred);
// Public user profiles - MUST be last as it's a catch-all
router.get('/:username', generalRateLimit, userController.getUserByUsername);
exports.default = router;
//# sourceMappingURL=userRoutes.js.map