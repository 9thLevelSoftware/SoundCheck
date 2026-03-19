import { Request, Response } from 'express';
import { UserService } from '../services/UserService';
import { StatsService } from '../services/StatsService';
import { AuditService } from '../services/AuditService';
import { CreateUserRequest, LoginRequest, ApiResponse } from '../types';
import logger from '../utils/logger';

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
  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const userData: CreateUserRequest = req.body;

      const authResponse = await this.userService.createUser(userData);

      const response: ApiResponse = {
        success: true,
        data: authResponse,
        message: 'User registered successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Registration error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };

      res.status(400).json(response);
    }
  };

  /**
   * User login
   * POST /api/users/login
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const loginData: LoginRequest = req.body;

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
      logger.error('Login error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });

      // Audit log: login failure
      const reason = error instanceof Error ? error.message : 'Unknown error';
      const email = req.body?.email || 'unknown';
      this.auditService.logLoginFailure(email, reason, req);

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };

      res.status(401).json(response);
    }
  };

  /**
   * Get current user profile
   * GET /api/users/me
   */
  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          error: 'User not authenticated',
        };
        res.status(401).json(response);
        return;
      }

      const user = await this.userService.findById(req.user.id);
      
      if (!user) {
        const response: ApiResponse = {
          success: false,
          error: 'User not found',
        };
        res.status(404).json(response);
        return;
      }

      // Get user statistics
      const stats = await this.userService.getUserStats(user.id);

      const response: ApiResponse = {
        success: true,
        data: {
          ...user,
          stats,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get profile error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch profile',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Update user profile
   * PUT /api/users/me
   */
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          error: 'User not authenticated',
        };
        res.status(401).json(response);
        return;
      }

      const updateData = req.body;
      const updatedUser = await this.userService.updateProfile(req.user.id, updateData);

      // Audit log: profile update
      this.auditService.logProfileUpdated(req.user.id, Object.keys(updateData), req);

      const response: ApiResponse = {
        success: true,
        data: updatedUser,
        message: 'Profile updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Update profile error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update profile',
      };

      res.status(400).json(response);
    }
  };

  /**
   * Get user by username
   * GET /api/users/:username
   */
  getUserByUsername = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username } = req.params;

      const user = await this.userService.findByUsername(username);
      
      if (!user) {
        const response: ApiResponse = {
          success: false,
          error: 'User not found',
        };
        res.status(404).json(response);
        return;
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
    } catch (error) {
      logger.error('Get user by username error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch user',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Deactivate user account
   * DELETE /api/users/me
   */
  deactivateAccount = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          error: 'User not authenticated',
        };
        res.status(401).json(response);
        return;
      }

      await this.userService.deactivateAccount(req.user.id);

      const response: ApiResponse = {
        success: true,
        message: 'Account deactivated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Deactivate account error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      
      const response: ApiResponse = {
        success: false,
        error: 'Failed to deactivate account',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Check username availability
   * GET /api/users/check-username/:username
   *
   * SEC-007/CFR-015: This endpoint enables username enumeration by design.
   * Acceptable for beta with existing rate limits on the route. For post-beta,
   * consider adding proof-of-work or CAPTCHA if abuse is detected.
   */
  checkUsername = async (req: Request, res: Response): Promise<void> => {
    try {
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
    } catch (error) {
      logger.error('Check username error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      
      const response: ApiResponse = {
        success: false,
        error: 'Failed to check username availability',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Check email availability
   * GET /api/users/check-email?email=test@example.com
   *
   * SEC-007/CFR-015/API-062: This endpoint enables email enumeration by design.
   * Acceptable for beta with existing rate limits on the route. For post-beta,
   * consider adding proof-of-work or CAPTCHA if abuse is detected.
   */
  checkEmail = async (req: Request, res: Response): Promise<void> => {
    try {
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
    } catch (error) {
      logger.error('Check email error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to check email availability',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get user stats by ID
   * GET /api/users/:userId/stats
   */
  getUserStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      // Validate UUID format
      if (!UUID_REGEX.test(userId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid user ID format',
        };
        res.status(400).json(response);
        return;
      }

      // Verify user exists
      const user = await this.userService.findById(userId);
      if (!user) {
        const response: ApiResponse = {
          success: false,
          error: 'User not found',
        };
        res.status(404).json(response);
        return;
      }

      const stats = await this.userService.getUserStats(userId);

      const response: ApiResponse = {
        success: true,
        data: stats,
      };
      // API-033: Use explicit status code
      res.status(200).json(response);
    } catch (error) {
      logger.error('Error getting user stats', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const response: ApiResponse = {
        success: false,
        error: 'Failed to get user stats',
      };
      res.status(500).json(response);
    }
  };

  /**
   * Get concert cred stats for a user
   * GET /api/users/:userId/concert-cred
   */
  getConcertCred = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      // Validate UUID format
      if (!UUID_REGEX.test(userId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid user ID format',
        };
        res.status(400).json(response);
        return;
      }

      const concertCred = await this.statsService.getConcertCred(userId);

      const response: ApiResponse = {
        success: true,
        data: concertCred,
      };
      // API-033: Use explicit status code
      res.status(200).json(response);
    } catch (error) {
      logger.error('Error getting concert cred', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get concert cred',
      };
      res.status(500).json(response);
    }
  };

  /**
   * Search users by username or display name
   * GET /api/search/users?q=query&limit=20&offset=0
   */
  searchUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { q, limit = '20', offset = '0' } = req.query;

      if (!q || typeof q !== 'string' || q.length < 2) {
        const response: ApiResponse = {
          success: false,
          error: 'Query must be at least 2 characters',
        };
        res.status(400).json(response);
        return;
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
    } catch (error) {
      logger.error('User search error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });

      const response: ApiResponse = {
        success: false,
        error: 'Search failed',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Upload profile image
   * POST /api/users/me/profile-image
   */
  uploadProfileImage = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'User not authenticated' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ success: false, error: 'No image file provided' });
        return;
      }

      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const imageUrl = `${baseUrl}/api/uploads/profiles/${req.file.filename}`;

      await this.userService.updateProfile(req.user.id, { profileImageUrl: imageUrl });

      res.status(200).json({
        success: true,
        data: { imageUrl },
        message: 'Profile image uploaded successfully',
      });
    } catch (error) {
      logger.error('Upload profile image error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload image',
      });
    }
  };
}