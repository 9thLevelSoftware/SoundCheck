/**
 * TrendingController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { TrendingService } from '../services/TrendingService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, BadRequestError } from '../utils/errors';

export class TrendingController {
  private trendingService: TrendingService;

  constructor(trendingService?: TrendingService) {
    this.trendingService = trendingService || new TrendingService();
  }

  /**
   * Get trending events near user
   * GET /api/trending?lat=X&lon=Y&radius=80&days=30&limit=20
   * Requires authentication (userId from JWT).
   */
  getTrending = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lon = req.query.lon ? parseFloat(req.query.lon as string) : undefined;

    if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
      throw new BadRequestError('lat and lon query parameters are required and must be numeric');
    }

    const radius = req.query.radius ? parseFloat(req.query.radius as string) : undefined;
    const days = req.query.days ? parseInt(req.query.days as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const results = await this.trendingService.getTrendingNearUser(userId, lat, lon, {
      radiusKm: radius,
      days,
      limit,
    });

    const response: ApiResponse = {
      success: true,
      data: results,
    };

    res.status(200).json(response);
  });
}
