import { Request, Response } from 'express';
import { BlockService } from '../services/BlockService';
import { buildErrorResponse } from '../middleware/validate';

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
  blockUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const blockerId = req.user?.id;
      if (!blockerId) {
        res.status(401).json(buildErrorResponse('UNAUTHORIZED', 'Authentication required'));
        return;
      }
      const blockedId = req.params.userId;

      const block = await this.blockService.blockUser(blockerId, blockedId);

      res.status(201).json({ success: true, data: block });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const code = statusCode < 500 ? 'REQUEST_ERROR' : 'INTERNAL_ERROR';
      const message = statusCode < 500 ? error.message : 'Failed to block user';

      res.status(statusCode).json(buildErrorResponse(code, message));
    }
  };

  /**
   * Unblock a user.
   * DELETE /api/blocks/:userId/block
   */
  unblockUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const blockerId = req.user?.id;
      if (!blockerId) {
        res.status(401).json(buildErrorResponse('UNAUTHORIZED', 'Authentication required'));
        return;
      }
      const blockedId = req.params.userId;

      await this.blockService.unblockUser(blockerId, blockedId);

      res.status(200).json({ success: true, message: 'User unblocked' });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const code = statusCode < 500 ? 'REQUEST_ERROR' : 'INTERNAL_ERROR';
      const message = statusCode < 500 ? error.message : 'Failed to unblock user';

      res.status(statusCode).json(buildErrorResponse(code, message));
    }
  };

  /**
   * Get all users blocked by the authenticated user.
   * GET /api/blocks
   */
  getBlockedUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(buildErrorResponse('UNAUTHORIZED', 'Authentication required'));
        return;
      }

      const blocks = await this.blockService.getBlockedUsers(userId);

      res.status(200).json({ success: true, data: blocks });
    } catch (error: any) {
      res.status(500).json(buildErrorResponse('INTERNAL_ERROR', 'Failed to fetch blocked users'));
    }
  };

  /**
   * Check if a block exists between the authenticated user and another user.
   * GET /api/blocks/:userId/status
   */
  checkBlocked = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json(buildErrorResponse('UNAUTHORIZED', 'Authentication required'));
        return;
      }
      const otherUserId = req.params.userId;

      const blocked = await this.blockService.isBlocked(userId, otherUserId);

      res.status(200).json({ success: true, data: { blocked } });
    } catch (error: any) {
      res.status(500).json(buildErrorResponse('INTERNAL_ERROR', 'Failed to check block status'));
    }
  };
}
