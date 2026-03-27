import { Request, Response } from 'express';
import { BadgeService } from '../services/BadgeService';
import { ApiResponse } from '../types';
import logger from '../utils/logger';

export class BadgeController {
  private badgeService = new BadgeService();

  /**
   * Get all available badges
   * GET /api/badges
   */
  getAllBadges = async (req: Request, res: Response): Promise<void> => {
    try {
      const badges = await this.badgeService.getAllBadges();

      const response: ApiResponse = {
        success: true,
        data: badges,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get all badges error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch badges',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get badges earned by a specific user
   * GET /api/badges/user/:userId
   */
  getUserBadges = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      const userBadges = await this.badgeService.getUserBadges(userId);

      const response: ApiResponse = {
        success: true,
        data: userBadges,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get user badges error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch user badges',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get current user's badges
   * GET /api/badges/my-badges
   */
  getMyBadges = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const userBadges = await this.badgeService.getUserBadges(req.user.id);

      const response: ApiResponse = {
        success: true,
        data: userBadges,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get my badges error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch your badges',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Check and award new badges to current user
   * POST /api/badges/check-awards
   */
  checkAndAwardBadges = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const newBadges = await this.badgeService.checkAndAwardBadges(req.user.id);

      const response: ApiResponse = {
        success: true,
        data: {
          newBadges,
          count: newBadges.length,
        },
        message:
          newBadges.length > 0
            ? `Congratulations! You earned ${newBadges.length} new badge${newBadges.length > 1 ? 's' : ''}!`
            : 'No new badges earned at this time',
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Check and award badges error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to check badge awards',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get badge rarity data
   * GET /api/badges/rarity
   */
  getBadgeRarity = async (req: Request, res: Response): Promise<void> => {
    try {
      const rarity = await this.badgeService.getBadgeRarity();

      const response: ApiResponse = {
        success: true,
        data: rarity,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get badge rarity error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch badge rarity',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get badge leaderboard
   * GET /api/badges/leaderboard
   */
  getBadgeLeaderboard = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      const leaderboard = await this.badgeService.getBadgeLeaderboard(limit);

      const response: ApiResponse = {
        success: true,
        data: leaderboard,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get badge leaderboard error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch badge leaderboard',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get current user's badge progress
   * GET /api/badges/my-progress
   */
  getMyBadgeProgress = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const progress = await this.badgeService.getUserBadgeProgress(req.user.id);

      const response: ApiResponse = {
        success: true,
        data: progress,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get badge progress error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch badge progress',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get badge by ID
   * GET /api/badges/:id
   */
  getBadgeById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const badge = await this.badgeService.getBadgeById(id);

      if (!badge) {
        const response: ApiResponse = {
          success: false,
          error: 'Badge not found',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: badge,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get badge by ID error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch badge',
      };

      res.status(500).json(response);
    }
  };
}
