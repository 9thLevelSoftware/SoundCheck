/**
 * FollowController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { FollowService } from '../services/FollowService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../utils/errors';

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
  followUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { userId: targetUserId } = req.params;

    // Validate UUID format
    if (!UUID_REGEX.test(targetUserId)) {
      throw new BadRequestError('Invalid user ID format');
    }

    // Prevent self-follow
    if (currentUserId === targetUserId) {
      throw new BadRequestError('You cannot follow yourself');
    }

    const result = await this.followService.followUser(currentUserId, targetUserId);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Successfully followed user',
    };

    // API-028: Return 201 for resource creation
    res.status(201).json(response);
  });

  /**
   * Unfollow a user
   * DELETE /api/follow/:userId
   */
  unfollowUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { userId: targetUserId } = req.params;

    // Validate UUID format
    if (!UUID_REGEX.test(targetUserId)) {
      throw new BadRequestError('Invalid user ID format');
    }

    const result = await this.followService.unfollowUser(currentUserId, targetUserId);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Successfully unfollowed user',
    };

    res.status(200).json(response);
  });

  /**
   * Check if current user is following a specific user
   * GET /api/follow/:userId/status
   */
  getFollowStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { userId: targetUserId } = req.params;

    // Validate UUID format
    if (!UUID_REGEX.test(targetUserId)) {
      throw new BadRequestError('Invalid user ID format');
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
  });

  /**
   * Get followers of a user
   * GET /api/users/:userId/followers
   */
  getFollowers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    // Validate UUID format
    if (!UUID_REGEX.test(userId)) {
      throw new BadRequestError('Invalid user ID format');
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 20, 100));

    const result = await this.followService.getFollowers(userId, { page, limit });

    if (result === null) {
      throw new NotFoundError('User not found');
    }

    const response: ApiResponse = {
      success: true,
      data: result,
    };

    res.status(200).json(response);
  });

  /**
   * Get users that a user is following
   * GET /api/users/:userId/following
   */
  getFollowing = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId } = req.params;

    // Validate UUID format
    if (!UUID_REGEX.test(userId)) {
      throw new BadRequestError('Invalid user ID format');
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 20, 100));

    const result = await this.followService.getFollowing(userId, { page, limit });

    if (result === null) {
      throw new NotFoundError('User not found');
    }

    const response: ApiResponse = {
      success: true,
      data: result,
    };

    res.status(200).json(response);
  });
}
