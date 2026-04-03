import { Request, Response } from 'express';
import { UserService } from '../services/UserService';
export declare class UserController {
    private userService;
    private statsService;
    private auditService;
    constructor(userService?: UserService);
    /**
     * Register a new user
     * POST /api/users/register
     */
    register: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * User login
     * POST /api/users/login
     */
    login: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get current user profile
     * GET /api/users/me
     */
    getProfile: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Update user profile
     * PUT /api/users/me
     */
    updateProfile: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get user by username
     * GET /api/users/:username
     */
    getUserByUsername: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Deactivate user account
     * DELETE /api/users/me
     */
    deactivateAccount: (req: Request, res: Response, next: import("express").NextFunction) => void;
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
    checkUsername: (req: Request, res: Response, next: import("express").NextFunction) => void;
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
    checkEmail: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get user stats by ID
     * GET /api/users/:userId/stats
     */
    getUserStats: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get concert cred stats for a user
     * GET /api/users/:userId/concert-cred
     */
    getConcertCred: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Search users by username or display name
     * GET /api/search/users?q=query&limit=20&offset=0
     */
    searchUsers: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Upload profile image
     * POST /api/users/me/profile-image
     */
    uploadProfileImage: (req: Request, res: Response, next: import("express").NextFunction) => void;
}
//# sourceMappingURL=UserController.d.ts.map