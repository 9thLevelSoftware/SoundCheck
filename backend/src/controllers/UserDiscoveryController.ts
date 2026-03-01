import { Request, Response } from 'express';
import { UserDiscoveryService } from '../services/UserDiscoveryService';
import { ApiResponse } from '../types';
import logger from '../utils/logger';

/**
 * UserDiscoveryController: HTTP handler for user discovery/suggestion endpoints.
 *
 * GET /api/discover/users/suggestions?limit=10
 *
 * Phase 17: Social Graph & Beta Onramp
 */
export class UserDiscoveryController {
  private userDiscoveryService = new UserDiscoveryService();

  /**
   * Get user follow suggestions based on shared music taste.
   * Requires authentication.
   *
   * Query params:
   *   limit - (optional) Max results (default 10, max 50)
   */
  getSuggestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 10 : rawLimit));

      const suggestions = await this.userDiscoveryService.getSuggestions(userId, limit);

      const response: ApiResponse = { success: true, data: suggestions };
      res.status(200).json(response);
    } catch (error) {
      logger.error('Get user suggestions error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch user suggestions',
      };
      res.status(500).json(response);
    }
  };
}
