import { Request, Response } from 'express';
import { WishlistService } from '../services/WishlistService';
import { ApiResponse } from '../types';
import { logError } from '../utils/logger';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class WishlistController {
  private wishlistService: WishlistService;

  constructor(wishlistService?: WishlistService) {
    this.wishlistService = wishlistService ?? new WishlistService();
  }

  /**
   * Add a band to wishlist
   * POST /api/wishlist
   * Body: { bandId: string, notifyWhenNearby?: boolean }
   */
  addToWishlist = async (req: Request, res: Response): Promise<void> => {
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

      const { bandId, notifyWhenNearby = true } = req.body;

      // Validate bandId is provided
      if (!bandId) {
        const response: ApiResponse = {
          success: false,
          error: 'bandId is required',
        };
        res.status(400).json(response);
        return;
      }

      // Validate UUID format
      if (!UUID_REGEX.test(bandId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid band ID format',
        };
        res.status(400).json(response);
        return;
      }

      const result = await this.wishlistService.addToWishlist(
        currentUserId,
        bandId,
        notifyWhenNearby
      );

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Successfully added to wishlist',
      };

      res.status(200).json(response);
    } catch (error) {
      logError('Add to wishlist error:', { error });

      const errorMessage = error instanceof Error ? error.message : 'Failed to add to wishlist';

      if (errorMessage === 'Band not found') {
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
   * Remove from wishlist by wishlist item ID
   * DELETE /api/wishlist/:wishlistId
   */
  removeFromWishlistById = async (req: Request, res: Response): Promise<void> => {
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

      const { wishlistId } = req.params;

      // Validate UUID format
      if (!UUID_REGEX.test(wishlistId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid wishlist ID format',
        };
        res.status(400).json(response);
        return;
      }

      const result = await this.wishlistService.removeFromWishlistById(currentUserId, wishlistId);

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Successfully removed from wishlist',
      };

      res.status(200).json(response);
    } catch (error) {
      logError('Remove from wishlist error:', { error });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove from wishlist',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Remove from wishlist by band ID (via query parameter)
   * DELETE /api/wishlist?bandId=xxx
   */
  removeFromWishlistByBandId = async (req: Request, res: Response): Promise<void> => {
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

      const bandId = req.query.bandId as string;

      if (!bandId) {
        const response: ApiResponse = {
          success: false,
          error: 'bandId query parameter is required',
        };
        res.status(400).json(response);
        return;
      }

      // Validate UUID format
      if (!UUID_REGEX.test(bandId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid band ID format',
        };
        res.status(400).json(response);
        return;
      }

      const result = await this.wishlistService.removeFromWishlistByBandId(currentUserId, bandId);

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Successfully removed from wishlist',
      };

      res.status(200).json(response);
    } catch (error) {
      logError('Remove from wishlist by band error:', { error });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove from wishlist',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get current user's wishlist
   * GET /api/wishlist
   */
  getWishlist = async (req: Request, res: Response): Promise<void> => {
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

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 20, 100));

      const result = await this.wishlistService.getWishlist(currentUserId, { page, limit });

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      logError('Get wishlist error:', { error });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to get wishlist',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Check if a band is in the user's wishlist
   * GET /api/wishlist/status?bandId=xxx
   */
  getWishlistStatus = async (req: Request, res: Response): Promise<void> => {
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

      const bandId = req.query.bandId as string;

      if (!bandId) {
        const response: ApiResponse = {
          success: false,
          error: 'bandId query parameter is required',
        };
        res.status(400).json(response);
        return;
      }

      // Validate UUID format
      if (!UUID_REGEX.test(bandId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid band ID format',
        };
        res.status(400).json(response);
        return;
      }

      const wishlistItem = await this.wishlistService.isWishlisted(currentUserId, bandId);

      const response: ApiResponse = {
        success: true,
        data: {
          isWishlisted: wishlistItem !== null,
          bandId,
          wishlistItem: wishlistItem || undefined,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      logError('Get wishlist status error:', { error });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to get wishlist status',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Update notification preference for a wishlisted band
   * PATCH /api/wishlist/:bandId/notify
   * Body: { notifyWhenNearby: boolean }
   */
  updateNotificationPreference = async (req: Request, res: Response): Promise<void> => {
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

      const { bandId } = req.params;
      const { notifyWhenNearby } = req.body;

      // Validate UUID format
      if (!UUID_REGEX.test(bandId)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid band ID format',
        };
        res.status(400).json(response);
        return;
      }

      // Validate notifyWhenNearby is provided and is boolean
      if (typeof notifyWhenNearby !== 'boolean') {
        const response: ApiResponse = {
          success: false,
          error: 'notifyWhenNearby must be a boolean',
        };
        res.status(400).json(response);
        return;
      }

      const result = await this.wishlistService.updateNotificationPreference(
        currentUserId,
        bandId,
        notifyWhenNearby
      );

      if (!result) {
        const response: ApiResponse = {
          success: false,
          error: 'Wishlist item not found',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Successfully updated notification preference',
      };

      res.status(200).json(response);
    } catch (error) {
      logError('Update notification preference error:', { error });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update notification preference',
      };

      res.status(500).json(response);
    }
  };
}
