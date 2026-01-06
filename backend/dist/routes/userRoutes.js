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
const validationSchemas_1 = require("../utils/validationSchemas");
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
// Rate limiting for auth endpoints
const authRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 5); // 5 requests per 15 minutes
const generalRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 30); // 30 requests per 15 minutes
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
// Username and email availability check - MUST come before /:username
router.get('/check-username/:username', generalRateLimit, (0, validate_1.validate)(validationSchemas_1.checkUsernameSchema), userController.checkUsername);
router.get('/check-email', generalRateLimit, (0, validate_1.validate)(validationSchemas_1.checkEmailSchema), userController.checkEmail); // Changed to query param
// Followers/Following routes - use userId (UUID) for these
// These are public routes since follower/following lists are typically public info
// GET /api/users/:userId/followers - get followers of a user
router.get('/:userId/followers', generalRateLimit, followController.getFollowers);
// GET /api/users/:userId/following - get users that this user is following
router.get('/:userId/following', generalRateLimit, followController.getFollowing);
// Public user profiles - MUST be last as it's a catch-all
router.get('/:username', generalRateLimit, userController.getUserByUsername);
exports.default = router;
//# sourceMappingURL=userRoutes.js.map