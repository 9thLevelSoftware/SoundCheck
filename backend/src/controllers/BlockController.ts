/**
 * BlockController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { BlockService } from '../services/BlockService';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError } from '../utils/errors';

/**
 * BlockController: HTTP handlers for user blocking operations.
 *
 * Phase 9: Trust & Safety Foundation (Plan 03)
 */
export class BlockController {
  private blockService = new BlockService();

  /**
   * Block a user.
   * POST /api/blocks/:userId/block
   */
  blockUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const blockerId = req.user?.id;
    if (!blockerId) {
      throw new UnauthorizedError('Authentication required');
    }
    const blockedId = req.params.userId;

    const block = await this.blockService.blockUser(blockerId, blockedId);

    res.status(201).json({ success: true, data: block });
  });

  /**
   * Unblock a user.
   * DELETE /api/blocks/:userId/block
   */
  unblockUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const blockerId = req.user?.id;
    if (!blockerId) {
      throw new UnauthorizedError('Authentication required');
    }
    const blockedId = req.params.userId;

    await this.blockService.unblockUser(blockerId, blockedId);

    res.status(200).json({ success: true, message: 'User unblocked' });
  });

  /**
   * Get all users blocked by the authenticated user.
   * GET /api/blocks
   */
  getBlockedUsers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const blocks = await this.blockService.getBlockedUsers(userId);

    res.status(200).json({ success: true, data: blocks });
  });

  /**
   * Check if a block exists between the authenticated user and another user.
   * GET /api/blocks/:userId/status
   */
  checkBlocked = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const otherUserId = req.params.userId;

    const blocked = await this.blockService.isBlocked(userId, otherUserId);

    res.status(200).json({ success: true, data: { blocked } });
  });
}
