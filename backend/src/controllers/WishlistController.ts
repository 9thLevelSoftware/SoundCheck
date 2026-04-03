/**
 * WishlistController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { WishlistService } from '../services/WishlistService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, NotFoundError, BadRequestError } from '../utils/errors';

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
  addToWishlist = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { bandId, notifyWhenNearby = true } = req.body;

    // Validate bandId is provided
    if (!bandId) {
      throw new BadRequestError('bandId is required');
    }

    // Validate UUID format
    if (!UUID_REGEX.test(bandId)) {
      throw new BadRequestError('Invalid band ID format');
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
  });

  /**
   * Remove from wishlist by wishlist item ID
   * DELETE /api/wishlist/:wishlistId
   */
  removeFromWishlistById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { wishlistId } = req.params;

    // Validate UUID format
    if (!UUID_REGEX.test(wishlistId)) {
      throw new BadRequestError('Invalid wishlist ID format');
    }

    const result = await this.wishlistService.removeFromWishlistById(currentUserId, wishlistId);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Successfully removed from wishlist',
    };

    res.status(200).json(response);
  });

  /**
   * Remove from wishlist by band ID (via query parameter)
   * DELETE /api/wishlist?bandId=xxx
   */
  removeFromWishlistByBandId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    const bandId = req.query.bandId as string;

    if (!bandId) {
      throw new BadRequestError('bandId query parameter is required');
    }

    // Validate UUID format
    if (!UUID_REGEX.test(bandId)) {
      throw new BadRequestError('Invalid band ID format');
    }

    const result = await this.wishlistService.removeFromWishlistByBandId(currentUserId, bandId);

    const response: ApiResponse = {
      success: true,
      data: result,
      message: 'Successfully removed from wishlist',
    };

    res.status(200).json(response);
  });

  /**
   * Get current user's wishlist
   * GET /api/wishlist
   */
  getWishlist = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 20, 100));

    const result = await this.wishlistService.getWishlist(currentUserId, { page, limit });

    const response: ApiResponse = {
      success: true,
      data: result,
    };

    res.status(200).json(response);
  });

  /**
   * Check if a band is in the user's wishlist
   * GET /api/wishlist/status?bandId=xxx
   */
  getWishlistStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    const bandId = req.query.bandId as string;

    if (!bandId) {
      throw new BadRequestError('bandId query parameter is required');
    }

    // Validate UUID format
    if (!UUID_REGEX.test(bandId)) {
      throw new BadRequestError('Invalid band ID format');
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
  });

  /**
   * Update notification preference for a wishlisted band
   * PATCH /api/wishlist/:bandId/notify
   * Body: { notifyWhenNearby: boolean }
   */
  updateNotificationPreference = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const currentUserId = req.user?.id;

      if (!currentUserId) {
        throw new UnauthorizedError('Authentication required');
      }

      const { bandId } = req.params;
      const { notifyWhenNearby } = req.body;

      // Validate UUID format
      if (!UUID_REGEX.test(bandId)) {
        throw new BadRequestError('Invalid band ID format');
      }

      // Validate notifyWhenNearby is provided and is boolean
      if (typeof notifyWhenNearby !== 'boolean') {
        throw new BadRequestError('notifyWhenNearby must be a boolean');
      }

      const result = await this.wishlistService.updateNotificationPreference(
        currentUserId,
        bandId,
        notifyWhenNearby
      );

      if (!result) {
        throw new NotFoundError('Wishlist item not found');
      }

      const response: ApiResponse = {
        success: true,
        data: result,
        message: 'Successfully updated notification preference',
      };

      res.status(200).json(response);
    }
  );
}
