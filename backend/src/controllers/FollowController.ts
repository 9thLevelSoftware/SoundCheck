import { Request, Response } from 'express';
import { FollowService } from '../services/FollowService';
import { ApiResponse } from '../types';
import { logError } from '../utils/logger';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class FollowController {
  private followService: FollowService;

  constructor(followService?: FollowService) {
    this.followService = followService ?? new FollowService();
  }

  /**
   * Follow a user
   * POST /api/follow/:userId
   */
  followUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user?.id;

      if (!currentUserId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { userId: targetUserId } = req.params;

      // Validate UUID format
      if (!UUID_REGEX.test(targetUserId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid user ID format',
        };
        res.status(400).json(response);
        return;
      }

      // Prevent self-follow
      if (currentUserId === targetUserId) {
        const response: ApiResponse = {
          success: false,
          error: 'You cannot follow yourself',
        };
        res.status(400).json(response);
        return;
      }

      const result = await this.followService.followUser(currentUserId, targetUserId);

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Successfully followed user',
      };

      res.status(200).json(response);
    } catch (error) {
      logError('Follow user error:', { error });

      const errorMessage = error instanceof Error ? error.message : 'Failed to follow user';

      if (errorMessage === 'User not found') {
        const response: ApiResponse = {
          success: false,
          error: errorMessage,
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: false,
        error: errorMessage,
      };

      res.status(500).json(response);
    }
  };

  /**
   * Unfollow a user
   * DELETE /api/follow/:userId
   */
  unfollowUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user?.id;

      if (!currentUserId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { userId: targetUserId } = req.params;

      // Validate UUID format
      if (!UUID_REGEX.test(targetUserId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid user ID format',
        };
        res.status(400).json(response);
        return;
      }

      const result = await this.followService.unfollowUser(currentUserId, targetUserId);

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Successfully unfollowed user',
      };

      res.status(200).json(response);
    } catch (error) {
      logError('Unfollow user error:', { error });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to unfollow user',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Check if current user is following a specific user
   * GET /api/follow/:userId/status
   */
  getFollowStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user?.id;

      if (!currentUserId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { userId: targetUserId } = req.params;

      // Validate UUID format
      if (!UUID_REGEX.test(targetUserId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid user ID format',
        };
        res.status(400).json(response);
        return;
      }

      const isFollowing = await this.followService.isFollowing(currentUserId, targetUserId);

      const response: ApiResponse = {
        success: true,
        data: {
          isFollowing,
          userId: targetUserId,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      logError('Get follow status error:', { error });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to get follow status',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get followers of a user
   * GET /api/users/:userId/followers
   */
  getFollowers = async (req: Request, res: Response): Promise<void> => {
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

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 20, 100));

      const result = await this.followService.getFollowers(userId, { page, limit });

      if (result === null) {
        const response: ApiResponse = {
          success: false,
          error: 'User not found',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      logError('Get followers error:', { error });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to get followers',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get users that a user is following
   * GET /api/users/:userId/following
   */
  getFollowing = async (req: Request, res: Response): Promise<void> => {
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

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 20, 100));

      const result = await this.followService.getFollowing(userId, { page, limit });

      if (result === null) {
        const response: ApiResponse = {
          success: false,
          error: 'User not found',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      logError('Get following error:', { error });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to get following',
      };

      res.status(500).json(response);
    }
  };
}
