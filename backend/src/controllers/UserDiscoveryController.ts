/**
 * UserDiscoveryController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { UserDiscoveryService } from '../services/UserDiscoveryService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError } from '../utils/errors';

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
  getSuggestions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
    const limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 10 : rawLimit));

    const suggestions = await this.userDiscoveryService.getSuggestions(userId, limit);

    const response: ApiResponse = { success: true, data: suggestions };
    res.status(200).json(response);
  });
}
