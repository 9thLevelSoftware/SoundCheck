"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const UserService_1 = require("../services/UserService");
const StatsService_1 = require("../services/StatsService");
const AuditService_1 = require("../services/AuditService");
const dbMappers_1 = require("../utils/dbMappers");
const asyncHandler_1 = require("../utils/asyncHandler");
const errors_1 = require("../utils/errors");
// UUID validation regex (supports UUID v1-5)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class UserController {
    constructor(userService) {
        /**
         * Register a new user
         * POST /api/users/register
         */
        this.register = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const userData = req.body;
            const authResponse = await this.userService.createUser(userData);
            const response = {
                success: true,
                data: authResponse,
                message: 'User registered successfully',
            };
            res.status(201).json(response);
        });
        /**
         * User login
         * POST /api/users/login
         */
        this.login = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const loginData = req.body;
            try {
                const authResponse = await this.userService.authenticateUser(loginData);
                // Audit log: login success
                this.auditService.logLoginSuccess(authResponse.user.id, 'email', req);
                const response = {
                    success: true,
                    data: authResponse,
                    message: 'Login successful',
                };
                res.status(200).json(response);
            }
            catch (error) {
                // Audit log: login failure
                const reason = error instanceof Error ? error.message : 'Unknown error';
                const email = req.body?.email || 'unknown';
                this.auditService.logLoginFailure(email, reason, req);
                throw error;
            }
        });
        /**
         * Get current user profile
         * GET /api/users/me
         */
        this.getProfile = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            if (!req.user) {
                throw new errors_1.UnauthorizedError('User not authenticated');
            }
            const user = await this.userService.findById(req.user.id);
            if (!user) {
                throw new errors_1.NotFoundError('User not found');
            }
            // Get user statistics
            const stats = await this.userService.getUserStats(user.id);
            const response = {
                success: true,
                data: {
                    ...(0, dbMappers_1.sanitizeUserForClient)(user),
                    stats,
                },
            };
            res.status(200).json(response);
        });
        /**
         * Update user profile
         * PUT /api/users/me
         */
        this.updateProfile = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            if (!req.user) {
                throw new errors_1.UnauthorizedError('User not authenticated');
            }
            const updateData = req.body;
            const updatedUser = await this.userService.updateProfile(req.user.id, updateData);
            // Audit log: profile update
            this.auditService.logProfileUpdated(req.user.id, Object.keys(updateData), req);
            const response = {
                success: true,
                data: (0, dbMappers_1.sanitizeUserForClient)(updatedUser),
                message: 'Profile updated successfully',
            };
            res.status(200).json(response);
        });
        /**
         * Get user by username
         * GET /api/users/:username
         */
        this.getUserByUsername = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const { username } = req.params;
            const user = await this.userService.findByUsername(username);
            if (!user) {
                throw new errors_1.NotFoundError('User not found');
            }
            // Get user statistics
            const stats = await this.userService.getUserStats(user.id);
            // Remove sensitive information for public profiles
            const publicProfile = {
                id: user.id,
                username: user.username,
                firstName: user.firstName,
                lastName: user.lastName,
                bio: user.bio,
                profileImageUrl: user.profileImageUrl,
                location: user.location,
                isVerified: user.isVerified,
                createdAt: user.createdAt,
                stats,
            };
            const response = {
                success: true,
                data: publicProfile,
            };
            res.status(200).json(response);
        });
        /**
         * Deactivate user account
         * DELETE /api/users/me
         */
        this.deactivateAccount = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            if (!req.user) {
                throw new errors_1.UnauthorizedError('User not authenticated');
            }
            await this.userService.deactivateAccount(req.user.id);
            const response = {
                success: true,
                message: 'Account deactivated successfully',
            };
            res.status(200).json(response);
        });
        /**
         * Check username availability
         * GET /api/users/check-username/:username
         *
         * SEC-007/CFR-015: Protected against enumeration attacks via:
         * - Strict rate limiting: 5 requests per 15 minutes per IP per endpoint
         * - Timing attack mitigation: Random 50-150ms jitter added to all responses
         * - CAPTCHA escalation: After 3 attempts, X-Requires-Captcha header is set
         * - Isolated rate limit keys: Uses `enum-check:${ip}:${endpoint}` prefix
         *
         * The strict rate limiting and timing jitter prevent rapid enumeration
         * while still allowing legitimate username availability checks.
         */
        this.checkUsername = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const { username } = req.params;
            const existingUser = await this.userService.findByUsername(username);
            const isAvailable = !existingUser;
            const response = {
                success: true,
                data: {
                    username,
                    available: isAvailable,
                },
            };
            res.status(200).json(response);
        });
        /**
         * Check email availability
         * GET /api/users/check-email?email=test@example.com
         *
         * SEC-007/CFR-015/API-062: Protected against enumeration attacks via:
         * - Strict rate limiting: 5 requests per 15 minutes per IP per endpoint
         * - Timing attack mitigation: Random 50-150ms jitter added to all responses
         * - CAPTCHA escalation: After 3 attempts, X-Requires-Captcha header is set
         * - Isolated rate limit keys: Uses `enum-check:${ip}:${endpoint}` prefix
         *
         * The strict rate limiting and timing jitter prevent rapid enumeration
         * while still allowing legitimate email availability checks.
         */
        this.checkEmail = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const { email } = req.query;
            const existingUser = await this.userService.findByEmail(email);
            const isAvailable = !existingUser;
            const response = {
                success: true,
                data: {
                    email,
                    available: isAvailable,
                },
            };
            res.status(200).json(response);
        });
        /**
         * Get user stats by ID
         * GET /api/users/:userId/stats
         */
        this.getUserStats = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const { userId } = req.params;
            // Validate UUID format
            if (!UUID_REGEX.test(userId)) {
                throw new errors_1.BadRequestError('Invalid user ID format');
            }
            // Verify user exists
            const user = await this.userService.findById(userId);
            if (!user) {
                throw new errors_1.NotFoundError('User not found');
            }
            const stats = await this.userService.getUserStats(userId);
            const response = {
                success: true,
                data: stats,
            };
            // API-033: Use explicit status code
            res.status(200).json(response);
        });
        /**
         * Get concert cred stats for a user
         * GET /api/users/:userId/concert-cred
         */
        this.getConcertCred = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const { userId } = req.params;
            // Validate UUID format
            if (!UUID_REGEX.test(userId)) {
                throw new errors_1.BadRequestError('Invalid user ID format');
            }
            const concertCred = await this.statsService.getConcertCred(userId);
            const response = {
                success: true,
                data: concertCred,
            };
            // API-033: Use explicit status code
            res.status(200).json(response);
        });
        /**
         * Search users by username or display name
         * GET /api/search/users?q=query&limit=20&offset=0
         */
        this.searchUsers = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const { q, limit = '20', offset = '0' } = req.query;
            if (!q || typeof q !== 'string' || q.length < 2) {
                throw new errors_1.BadRequestError('Query must be at least 2 characters');
            }
            const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
            const parsedOffset = Math.max(parseInt(offset, 10) || 0, 0);
            const result = await this.userService.searchUsers(q, parsedLimit, parsedOffset);
            const response = {
                success: true,
                data: result.users,
                pagination: {
                    limit: parsedLimit,
                    offset: parsedOffset,
                    hasMore: result.hasMore,
                },
            };
            res.status(200).json(response);
        });
        /**
         * Upload profile image
         * POST /api/users/me/profile-image
         */
        this.uploadProfileImage = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            if (!req.user) {
                throw new errors_1.UnauthorizedError('User not authenticated');
            }
            if (!req.file) {
                throw new errors_1.BadRequestError('No image file provided');
            }
            const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
            const imageUrl = `${baseUrl}/api/uploads/profiles/${req.file.filename}`;
            await this.userService.updateProfile(req.user.id, { profileImageUrl: imageUrl });
            res.status(200).json({
                success: true,
                data: { imageUrl },
                message: 'Profile image uploaded successfully',
            });
        });
        this.userService = userService ?? new UserService_1.UserService();
        this.statsService = new StatsService_1.StatsService();
        this.auditService = new AuditService_1.AuditService();
    }
}
exports.UserController = UserController;
//# sourceMappingURL=UserController.js.map