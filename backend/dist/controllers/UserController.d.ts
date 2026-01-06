import { Request, Response } from 'express';
import { UserService } from '../services/UserService';
export declare class UserController {
    private userService;
    constructor(userService?: UserService);
    /**
     * Register a new user
     * POST /api/users/register
     */
    register: (req: Request, res: Response) => Promise<void>;
    /**
     * User login
     * POST /api/users/login
     */
    login: (req: Request, res: Response) => Promise<void>;
    /**
     * Get current user profile
     * GET /api/users/me
     */
    getProfile: (req: Request, res: Response) => Promise<void>;
    /**
     * Update user profile
     * PUT /api/users/me
     */
    updateProfile: (req: Request, res: Response) => Promise<void>;
    /**
     * Get user by username
     * GET /api/users/:username
     */
    getUserByUsername: (req: Request, res: Response) => Promise<void>;
    /**
     * Deactivate user account
     * DELETE /api/users/me
     */
    deactivateAccount: (req: Request, res: Response) => Promise<void>;
    /**
     * Check username availability
     * GET /api/users/check-username/:username
     */
    checkUsername: (req: Request, res: Response) => Promise<void>;
    /**
     * Check email availability
     * GET /api/users/check-email?email=test@example.com
     */
    checkEmail: (req: Request, res: Response) => Promise<void>;
    /**
     * Upload profile image
     * POST /api/users/me/profile-image
     */
    uploadProfileImage: (req: Request, res: Response) => Promise<void>;
}
//# sourceMappingURL=UserController.d.ts.map