import { Request, Response } from 'express';
import { ReviewService } from '../services/ReviewService';
import { CreateReviewRequest, SearchQuery, ApiResponse } from '../types';
import { NotFoundError, ForbiddenError } from '../utils/errors';

export class ReviewController {
  private reviewService = new ReviewService();

  /**
   * Create a new review
   * POST /api/reviews
   */
  createReview = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const reviewData: CreateReviewRequest = req.body;

      // Validate required fields
      if (!reviewData.rating) {
        const response: ApiResponse = {
          success: false,
          error: 'Rating is required',
        };
        res.status(400).json(response);
        return;
      }

      // Validate rating range
      if (typeof reviewData.rating !== 'number' || reviewData.rating < 1 || reviewData.rating > 5) {
        const response: ApiResponse = {
          success: false,
          error: 'Rating must be a number between 1 and 5',
        };
        res.status(400).json(response);
        return;
      }

      if (!reviewData.venueId && !reviewData.bandId) {
        const response: ApiResponse = {
          success: false,
          error: 'Review must be for either a venue or a band',
        };
        res.status(400).json(response);
        return;
      }

      // Prevent reviewing both venue and band in the same review
      if (reviewData.venueId && reviewData.bandId) {
        const response: ApiResponse = {
          success: false,
          error: 'Review must be for either a venue or a band, not both',
        };
        res.status(400).json(response);
        return;
      }

      const review = await this.reviewService.createReview(req.user.id, reviewData);

      const response: ApiResponse = {
        success: true,
        data: review,
        message: 'Review created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Create review error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create review',
      };

      res.status(400).json(response);
    }
  };

  /**
   * Get all reviews with search and filters
   * GET /api/reviews
   */
  getReviews = async (req: Request, res: Response): Promise<void> => {
    try {
      const searchQuery: SearchQuery & {
        userId?: string;
        venueId?: string;
        bandId?: string;
        minRating?: number;
        maxRating?: number;
      } = {
        q: req.query.q as string,
        userId: req.query.userId as string,
        venueId: req.query.venueId as string,
        bandId: req.query.bandId as string,
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
        maxRating: req.query.maxRating ? parseFloat(req.query.maxRating as string) : undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sort: req.query.sort as string,
        order: req.query.order as 'asc' | 'desc',
      };

      const result = await this.reviewService.searchReviews(searchQuery);

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get reviews error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch reviews',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get review by ID
   * GET /api/reviews/:id
   */
  getReviewById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const review = await this.reviewService.getReviewById(id, true);

      if (!review) {
        const response: ApiResponse = {
          success: false,
          error: 'Review not found',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: review,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get review by ID error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch review',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Update review
   * PUT /api/reviews/:id
   */
  updateReview = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { id } = req.params;
      const updateData = req.body;

      const review = await this.reviewService.updateReview(id, req.user.id, updateData);

      const response: ApiResponse = {
        success: true,
        data: review,
        message: 'Review updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Update review error:', error);

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update review',
      };

      const statusCode = error instanceof NotFoundError ? 404
        : error instanceof ForbiddenError ? 403
        : 400;

      res.status(statusCode).json(response);
    }
  };

  /**
   * Delete review
   * DELETE /api/reviews/:id
   */
  deleteReview = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { id } = req.params;

      await this.reviewService.deleteReview(id, req.user.id);

      const response: ApiResponse = {
        success: true,
        message: 'Review deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Delete review error:', error);

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete review',
      };

      const statusCode = error instanceof NotFoundError ? 404
        : error instanceof ForbiddenError ? 403
        : 500;

      res.status(statusCode).json(response);
    }
  };

  /**
   * Mark review as helpful
   * POST /api/reviews/:id/helpful
   */
  markReviewHelpful = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { id } = req.params;
      const { isHelpful = true } = req.body;

      await this.reviewService.markReviewHelpful(id, req.user.id, isHelpful);

      const response: ApiResponse = {
        success: true,
        message: `Review marked as ${isHelpful ? 'helpful' : 'not helpful'}`,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Mark review helpful error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark review',
      };

      res.status(400).json(response);
    }
  };

  /**
   * Get user's review for a venue or band
   * GET /api/reviews/my-review
   */
  getMyReview = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const venueId = req.query.venueId as string;
      const bandId = req.query.bandId as string;

      if (!venueId && !bandId) {
        const response: ApiResponse = {
          success: false,
          error: 'Either venueId or bandId is required',
        };
        res.status(400).json(response);
        return;
      }

      if (venueId && bandId) {
        const response: ApiResponse = {
          success: false,
          error: 'Cannot specify both venueId and bandId',
        };
        res.status(400).json(response);
        return;
      }

      const review = await this.reviewService.getUserReview(req.user.id, venueId, bandId);

      const response: ApiResponse = {
        success: true,
        data: review,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get my review error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch review',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get reviews by venue
   * GET /api/reviews/venue/:venueId
   */
  getReviewsByVenue = async (req: Request, res: Response): Promise<void> => {
    try {
      const { venueId } = req.params;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const sort = req.query.sort as string || 'created_at';
      const order = req.query.order as 'asc' | 'desc' || 'desc';

      const result = await this.reviewService.searchReviews({
        venueId,
        page,
        limit,
        sort,
        order,
      });

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get reviews by venue error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch venue reviews',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get reviews by band
   * GET /api/reviews/band/:bandId
   */
  getReviewsByBand = async (req: Request, res: Response): Promise<void> => {
    try {
      const { bandId } = req.params;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const sort = req.query.sort as string || 'created_at';
      const order = req.query.order as 'asc' | 'desc' || 'desc';

      const result = await this.reviewService.searchReviews({
        bandId,
        page,
        limit,
        sort,
        order,
      });

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get reviews by band error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch band reviews',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get reviews by user
   * GET /api/reviews/user/:userId
   */
  getReviewsByUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const sort = req.query.sort as string || 'created_at';
      const order = req.query.order as 'asc' | 'desc' || 'desc';

      const result = await this.reviewService.searchReviews({
        userId,
        page,
        limit,
        sort,
        order,
      });

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get reviews by user error:', error);
      
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch user reviews',
      };

      res.status(500).json(response);
    }
  };
}