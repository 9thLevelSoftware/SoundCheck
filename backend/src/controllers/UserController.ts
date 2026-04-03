import { Request, Response } from 'express';
import { UserService } from '../services/UserService';
import { StatsService } from '../services/StatsService';
import { AuditService } from '../services/AuditService';
import { CreateUserRequest, LoginRequest, ApiResponse } from '../types';
import { sanitizeUserForClient } from '../utils/dbMappers';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../utils/errors';

// UUID validation regex (supports UUID v1-5)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UserController {
  private userService: UserService;
  private statsService: StatsService;
  private auditService: AuditService;

  constructor(userService?: UserService) {
    this.userService = userService ?? new UserService();
    this.statsService = new StatsService();
    this.auditService = new AuditService();
  }

  /**
   * Register a new user
   * POST /api/users/register
   */
  register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userData: CreateUserRequest = req.body;

    const authResponse = await this.userService.createUser(userData);

    const response: ApiResponse = {
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
  login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const loginData: LoginRequest = req.body;

    try {
      const authResponse = await this.userService.authenticateUser(loginData);

      // Audit log: login success
      this.auditService.logLoginSuccess(authResponse.user.id, 'email', req);

      const response: ApiResponse = {
        success: true,
        data: authResponse,
        message: 'Login successful',
      };

      res.status(200).json(response);
    } catch (error) {
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
  getProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const user = await this.userService.findById(req.user.id);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Get user statistics
    const stats = await this.userService.getUserStats(user.id);

    const response: ApiResponse = {
      success: true,
      data: {
        ...sanitizeUserForClient(user),
        stats,
      },
    };

    res.status(200).json(response);
  });

  /**
   * Update user profile
   * PUT /api/users/me
   */
  updateProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const updateData = req.body;
    const updatedUser = await this.userService.updateProfile(req.user.id, updateData);

    // Audit log: profile update
    this.auditService.logProfileUpdated(req.user.id, Object.keys(updateData), req);

    const response: ApiResponse = {
      success: true,
      data: sanitizeUserForClient(updatedUser),
      message: 'Profile updated successfully',
    };

    res.status(200).json(response);
  });

  /**
   * Get user by username
   * GET /api/users/:username
   */
  getUserByUsername = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { username } = req.params;

    const user = await this.userService.findByUsername(username);

    if (!user) {
      throw new NotFoundError('User not found');
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

    const response: ApiResponse = {
      success: true,
      data: publicProfile,
    };

    res.status(200).json(response);
  });

  /**
   * Deactivate user account
   * DELETE /api/users/me
   */
  deactivateAccount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    await this.userService.deactivateAccount(req.user.id);

    const response: ApiResponse = {
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
  checkUsername = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { username } = req.params;

    const existingUser = await this.userService.findByUsername(username);
    const isAvailable = !existingUser;

    const response: ApiResponse = {
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
  checkEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email } = req.query;

    const existingUser = await this.userService.findByEmail(email as string);
    const isAvailable = !existingUser;

    const response: ApiResponse = {
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
  getUserStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    // Validate UUID format
    if (!UUID_REGEX.test(userId)) {
      throw new BadRequestError('Invalid user ID format');
    }

    // Verify user exists
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const stats = await this.userService.getUserStats(userId);

    const response: ApiResponse = {
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
  getConcertCred = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    // Validate UUID format
    if (!UUID_REGEX.test(userId)) {
      throw new BadRequestError('Invalid user ID format');
    }

    const concertCred = await this.statsService.getConcertCred(userId);

    const response: ApiResponse = {
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
  searchUsers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { q, limit = '20', offset = '0' } = req.query;

    if (!q || typeof q !== 'string' || q.length < 2) {
      throw new BadRequestError('Query must be at least 2 characters');
    }

    const parsedLimit = Math.min(Math.max(parseInt(limit as string, 10) || 20, 1), 50);
    const parsedOffset = Math.max(parseInt(offset as string, 10) || 0, 0);

    const result = await this.userService.searchUsers(q, parsedLimit, parsedOffset);

    const response: ApiResponse = {
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
  uploadProfileImage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    if (!req.file) {
      throw new BadRequestError('No image file provided');
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
}
