"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const UserController_1 = require("../controllers/UserController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const validationSchemas_1 = require("../utils/validationSchemas");
const router = (0, express_1.Router)();
const userController = new UserController_1.UserController();
// Rate limiting for auth endpoints
const authRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 5); // 5 requests per 15 minutes
const generalRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 30); // 30 requests per 15 minutes
// Public routes (no authentication required)
router.post('/register', authRateLimit, (0, validate_1.validate)(validationSchemas_1.createUserSchema), userController.register);
router.post('/login', authRateLimit, (0, validate_1.validate)(validationSchemas_1.loginUserSchema), userController.login);
// Protected routes (authentication required) - MUST come before /:username
router.get('/me', auth_1.authenticateToken, userController.getProfile);
router.put('/me', auth_1.authenticateToken, (0, validate_1.validate)(validationSchemas_1.updateProfileSchema), userController.updateProfile);
router.delete('/me', auth_1.authenticateToken, userController.deactivateAccount);
// Username and email availability check - MUST come before /:username
router.get('/check-username/:username', generalRateLimit, (0, validate_1.validate)(validationSchemas_1.checkUsernameSchema), userController.checkUsername);
router.get('/check-email', generalRateLimit, (0, validate_1.validate)(validationSchemas_1.checkEmailSchema), userController.checkEmail); // Changed to query param
// Public user profiles - MUST be last as it's a catch-all
router.get('/:username', generalRateLimit, userController.getUserByUsername);
exports.default = router;
//# sourceMappingURL=userRoutes.js.map