"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewController = void 0;
const ReviewService_1 = require("../services/ReviewService");
const errors_1 = require("../utils/errors");
const logger_1 = __importDefault(require("../utils/logger"));
class ReviewController {
    constructor() {
        this.reviewService = new ReviewService_1.ReviewService();
        /**
         * Create a new review
         * POST /api/reviews
         */
        this.createReview = async (req, res) => {
            try {
                if (!req.user) {
                    const response = {
                        success: false,
                        error: 'Authentication required',
                    };
                    res.status(401).json(response);
                    return;
                }
                const reviewData = req.body;
                // Validate required fields
                if (!reviewData.rating) {
                    const response = {
                        success: false,
                        error: 'Rating is required',
                    };
                    res.status(400).json(response);
                    return;
                }
                // Validate rating range
                if (typeof reviewData.rating !== 'number' || reviewData.rating < 1 || reviewData.rating > 5) {
                    const response = {
                        success: false,
                        error: 'Rating must be a number between 1 and 5',
                    };
                    res.status(400).json(response);
                    return;
                }
                if (!reviewData.venueId && !reviewData.bandId) {
                    const response = {
                        success: false,
                        error: 'Review must be for either a venue or a band',
                    };
                    res.status(400).json(response);
                    return;
                }
                // Prevent reviewing both venue and band in the same review
                if (reviewData.venueId && reviewData.bandId) {
                    const response = {
                        success: false,
                        error: 'Review must be for either a venue or a band, not both',
                    };
                    res.status(400).json(response);
                    return;
                }
                const review = await this.reviewService.createReview(req.user.id, reviewData);
                const response = {
                    success: true,
                    data: review,
                    message: 'Review created successfully',
                };
                res.status(201).json(response);
            }
            catch (error) {
                logger_1.default.error('Create review error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
                const response = {
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
        this.getReviews = async (req, res) => {
            try {
                const searchQuery = {
                    q: req.query.q,
                    userId: req.query.userId,
                    venueId: req.query.venueId,
                    bandId: req.query.bandId,
                    minRating: req.query.minRating ? parseFloat(req.query.minRating) : undefined,
                    maxRating: req.query.maxRating ? parseFloat(req.query.maxRating) : undefined,
                    page: req.query.page ? parseInt(req.query.page) : 1,
                    limit: req.query.limit ? parseInt(req.query.limit) : 20,
                    sort: req.query.sort,
                    order: req.query.order,
                };
                const result = await this.reviewService.searchReviews(searchQuery);
                const response = {
                    success: true,
                    data: result,
                };
                res.status(200).json(response);
            }
            catch (error) {
                logger_1.default.error('Get reviews error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
                const response = {
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
        this.getReviewById = async (req, res) => {
            try {
                const { id } = req.params;
                const review = await this.reviewService.getReviewById(id, true);
                if (!review) {
                    const response = {
                        success: false,
                        error: 'Review not found',
                    };
                    res.status(404).json(response);
                    return;
                }
                const response = {
                    success: true,
                    data: review,
                };
                res.status(200).json(response);
            }
            catch (error) {
                logger_1.default.error('Get review by ID error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
                const response = {
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
        this.updateReview = async (req, res) => {
            try {
                if (!req.user) {
                    const response = {
                        success: false,
                        error: 'Authentication required',
                    };
                    res.status(401).json(response);
                    return;
                }
                const { id } = req.params;
                const updateData = req.body;
                const review = await this.reviewService.updateReview(id, req.user.id, updateData);
                const response = {
                    success: true,
                    data: review,
                    message: 'Review updated successfully',
                };
                res.status(200).json(response);
            }
            catch (error) {
                logger_1.default.error('Update review error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
                const response = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to update review',
                };
                const statusCode = error instanceof errors_1.NotFoundError ? 404
                    : error instanceof errors_1.ForbiddenError ? 403
                        : 400;
                res.status(statusCode).json(response);
            }
        };
        /**
         * Delete review
         * DELETE /api/reviews/:id
         */
        this.deleteReview = async (req, res) => {
            try {
                if (!req.user) {
                    const response = {
                        success: false,
                        error: 'Authentication required',
                    };
                    res.status(401).json(response);
                    return;
                }
                const { id } = req.params;
                await this.reviewService.deleteReview(id, req.user.id);
                const response = {
                    success: true,
                    message: 'Review deleted successfully',
                };
                res.status(200).json(response);
            }
            catch (error) {
                logger_1.default.error('Delete review error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
                const response = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to delete review',
                };
                const statusCode = error instanceof errors_1.NotFoundError ? 404
                    : error instanceof errors_1.ForbiddenError ? 403
                        : 500;
                res.status(statusCode).json(response);
            }
        };
        /**
         * Mark review as helpful
         * POST /api/reviews/:id/helpful
         */
        this.markReviewHelpful = async (req, res) => {
            try {
                if (!req.user) {
                    const response = {
                        success: false,
                        error: 'Authentication required',
                    };
                    res.status(401).json(response);
                    return;
                }
                const { id } = req.params;
                const { isHelpful = true } = req.body;
                await this.reviewService.markReviewHelpful(id, req.user.id, isHelpful);
                const response = {
                    success: true,
                    message: `Review marked as ${isHelpful ? 'helpful' : 'not helpful'}`,
                };
                res.status(200).json(response);
            }
            catch (error) {
                logger_1.default.error('Mark review helpful error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
                const response = {
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
        this.getMyReview = async (req, res) => {
            try {
                if (!req.user) {
                    const response = {
                        success: false,
                        error: 'Authentication required',
                    };
                    res.status(401).json(response);
                    return;
                }
                const venueId = req.query.venueId;
                const bandId = req.query.bandId;
                if (!venueId && !bandId) {
                    const response = {
                        success: false,
                        error: 'Either venueId or bandId is required',
                    };
                    res.status(400).json(response);
                    return;
                }
                if (venueId && bandId) {
                    const response = {
                        success: false,
                        error: 'Cannot specify both venueId and bandId',
                    };
                    res.status(400).json(response);
                    return;
                }
                const review = await this.reviewService.getUserReview(req.user.id, venueId, bandId);
                const response = {
                    success: true,
                    data: review,
                };
                res.status(200).json(response);
            }
            catch (error) {
                logger_1.default.error('Get my review error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
                const response = {
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
        this.getReviewsByVenue = async (req, res) => {
            try {
                const { venueId } = req.params;
                const page = req.query.page ? parseInt(req.query.page) : 1;
                const limit = req.query.limit ? parseInt(req.query.limit) : 20;
                const sort = req.query.sort || 'created_at';
                const order = req.query.order || 'desc';
                const result = await this.reviewService.searchReviews({
                    venueId,
                    page,
                    limit,
                    sort,
                    order,
                });
                const response = {
                    success: true,
                    data: result,
                };
                res.status(200).json(response);
            }
            catch (error) {
                logger_1.default.error('Get reviews by venue error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
                const response = {
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
        this.getReviewsByBand = async (req, res) => {
            try {
                const { bandId } = req.params;
                const page = req.query.page ? parseInt(req.query.page) : 1;
                const limit = req.query.limit ? parseInt(req.query.limit) : 20;
                const sort = req.query.sort || 'created_at';
                const order = req.query.order || 'desc';
                const result = await this.reviewService.searchReviews({
                    bandId,
                    page,
                    limit,
                    sort,
                    order,
                });
                const response = {
                    success: true,
                    data: result,
                };
                res.status(200).json(response);
            }
            catch (error) {
                logger_1.default.error('Get reviews by band error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
                const response = {
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
        this.getReviewsByUser = async (req, res) => {
            try {
                const { userId } = req.params;
                const page = req.query.page ? parseInt(req.query.page) : 1;
                const limit = req.query.limit ? parseInt(req.query.limit) : 20;
                const sort = req.query.sort || 'created_at';
                const order = req.query.order || 'desc';
                const result = await this.reviewService.searchReviews({
                    userId,
                    page,
                    limit,
                    sort,
                    order,
                });
                const response = {
                    success: true,
                    data: result,
                };
                res.status(200).json(response);
            }
            catch (error) {
                logger_1.default.error('Get reviews by user error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
                const response = {
                    success: false,
                    error: 'Failed to fetch user reviews',
                };
                res.status(500).json(response);
            }
        };
    }
}
exports.ReviewController = ReviewController;
//# sourceMappingURL=ReviewController.js.map