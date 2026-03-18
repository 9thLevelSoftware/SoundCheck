import { Request, Response } from 'express';
import { BlockService } from '../services/BlockService';
import { ApiResponse } from '../types';

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
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const blockedId = req.params.userId;

      const block = await this.blockService.blockUser(blockerId, blockedId);

      const response: ApiResponse = {
        success: true,
        data: block,
      };

      res.status(201).json(response);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const response: ApiResponse = {
        success: false,
        error: statusCode < 500 ? error.message : 'Failed to block user',
      };

      res.status(statusCode).json(response);
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
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const blockedId = req.params.userId;

      await this.blockService.unblockUser(blockerId, blockedId);

      const response: ApiResponse = {
        success: true,
        message: 'User unblocked',
      };

      res.status(200).json(response);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const response: ApiResponse = {
        success: false,
        error: statusCode < 500 ? error.message : 'Failed to unblock user',
      };

      res.status(statusCode).json(response);
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
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const blocks = await this.blockService.getBlockedUsers(userId);

      const response: ApiResponse = {
        success: true,
        data: blocks,
      };

      res.status(200).json(response);
    } catch (error: any) {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch blocked users',
      };

      res.status(500).json(response);
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
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      const otherUserId = req.params.userId;

      const blocked = await this.blockService.isBlocked(userId, otherUserId);

      const response: ApiResponse = {
        success: true,
        data: { blocked },
      };

      res.status(200).json(response);
    } catch (error: any) {
      const response: ApiResponse = {
        success: false,
        error: 'Failed to check block status',
      };

      res.status(500).json(response);
    }
  };
}
