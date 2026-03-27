import { Request, Response } from 'express';
import { TrendingService } from '../services/TrendingService';
import { ApiResponse } from '../types';
import logger from '../utils/logger';

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
  getTrending = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
      const lon = req.query.lon ? parseFloat(req.query.lon as string) : undefined;

      if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
        const response: ApiResponse = {
          success: false,
          error: 'lat and lon query parameters are required and must be numeric',
        };
        res.status(400).json(response);
        return;
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
    } catch (error) {
      logger.error('Get trending error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch trending events',
      };

      res.status(500).json(response);
    }
  };
}
