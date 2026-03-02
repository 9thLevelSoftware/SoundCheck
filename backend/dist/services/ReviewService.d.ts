import { Review, CreateReviewRequest, SearchQuery } from '../types';
export declare class ReviewService {
    private db;
    private venueService;
    private bandService;
    private badgeService;
    /**
     * Create a new review
     */
    createReview(userId: string, reviewData: CreateReviewRequest): Promise<Review>;
    /**
     * Get review by ID
     */
    getReviewById(reviewId: string, includeRelated?: boolean): Promise<Review | null>;
    /**
     * Search reviews with filters and pagination
     */
    searchReviews(searchQuery: SearchQuery & {
        userId?: string;
        venueId?: string;
        bandId?: string;
        minRating?: number;
        maxRating?: number;
    }): Promise<{
        reviews: Review[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    /**
     * Update review
     */
    updateReview(reviewId: string, userId: string, updateData: Partial<CreateReviewRequest>): Promise<Review>;
    /**
     * Delete review
     */
    deleteReview(reviewId: string, userId: string): Promise<void>;
    /**
     * Mark review as helpful or not helpful
     */
    markReviewHelpful(reviewId: string, userId: string, isHelpful: boolean): Promise<void>;
    /**
     * Get user's review for a venue or band
     */
    getUserReview(userId: string, venueId?: string, bandId?: string): Promise<Review | null>;
    /**
     * Claimed owner responds to a review.
     * Verifies the user owns the venue/band that the review targets.
     */
    respondToReview(reviewId: string, userId: string, response: string): Promise<Review>;
    /**
     * Check if user already reviewed venue/band
     */
    private findExistingReview;
    /**
     * Map database review row to Review type
     */
    private mapDbReviewToReview;
    /**
     * Convert camelCase to snake_case
     */
    private camelToSnakeCase;
}
//# sourceMappingURL=ReviewService.d.ts.map