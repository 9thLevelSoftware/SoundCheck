"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewService = void 0;
const database_1 = __importDefault(require("../config/database"));
const VenueService_1 = require("./VenueService");
const BandService_1 = require("./BandService");
const BadgeService_1 = require("./BadgeService");
const errors_1 = require("../utils/errors");
const logger_1 = __importDefault(require("../utils/logger"));
class ReviewService {
    constructor() {
        this.db = database_1.default.getInstance();
        this.venueService = new VenueService_1.VenueService();
        this.bandService = new BandService_1.BandService();
        this.badgeService = new BadgeService_1.BadgeService();
    }
    /**
     * Create a new review
     */
    async createReview(userId, reviewData) {
        const { venueId, bandId, rating, title, content, eventDate, imageUrls, } = reviewData;
        // Validate that exactly one target is specified
        if ((!venueId && !bandId) || (venueId && bandId)) {
            throw new Error('Review must be for either a venue or a band, not both');
        }
        // Validate rating
        if (rating < 1 || rating > 5) {
            throw new Error('Rating must be between 1 and 5');
        }
        // Check if venue or band exists
        if (venueId) {
            const venue = await this.venueService.getVenueById(venueId);
            if (!venue) {
                throw new Error('Venue not found');
            }
        }
        if (bandId) {
            const band = await this.bandService.getBandById(bandId);
            if (!band) {
                throw new Error('Band not found');
            }
        }
        // Check if user already reviewed this venue/band
        const existingReview = await this.findExistingReview(userId, venueId, bandId);
        if (existingReview) {
            throw new Error('You have already reviewed this venue/band');
        }
        const query = `
      INSERT INTO reviews (user_id, venue_id, band_id, rating, title, content, event_date, image_urls)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, user_id, venue_id, band_id, rating, title, content, event_date,
                image_urls, is_verified, helpful_count, created_at, updated_at
    `;
        const values = [
            userId,
            venueId || null,
            bandId || null,
            rating,
            title || null,
            content || null,
            eventDate || null,
            imageUrls || null,
        ];
        const result = await this.db.query(query, values);
        const review = this.mapDbReviewToReview(result.rows[0]);
        // Update venue or band rating
        if (venueId) {
            await this.venueService.updateVenueRating(venueId);
        }
        else if (bandId) {
            await this.bandService.updateBandRating(bandId);
        }
        // Check for badge awards (non-blocking)
        this.badgeService.checkAndAwardBadges(userId).catch(error => {
            logger_1.default.error('Error checking badge awards', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
        });
        return review;
    }
    /**
     * Get review by ID
     */
    async getReviewById(reviewId, includeRelated = true) {
        let query = `
      SELECT r.id, r.user_id, r.venue_id, r.band_id, r.rating, r.title, r.content,
             r.event_date, r.image_urls, r.is_verified, r.helpful_count,
             r.owner_response, r.owner_response_at,
             r.created_at, r.updated_at
    `;
        if (includeRelated) {
            query += `,
             u.username, u.first_name, u.last_name, u.profile_image_url, u.is_verified as user_verified,
             v.name as venue_name, v.city as venue_city, v.image_url as venue_image,
             b.name as band_name, b.genre as band_genre, b.image_url as band_image
      `;
        }
        query += `
      FROM reviews r
    `;
        if (includeRelated) {
            query += `
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN venues v ON r.venue_id = v.id
        LEFT JOIN bands b ON r.band_id = b.id
      `;
        }
        query += `
      WHERE r.id = $1
    `;
        const result = await this.db.query(query, [reviewId]);
        if (result.rows.length === 0) {
            return null;
        }
        const review = this.mapDbReviewToReview(result.rows[0]);
        if (includeRelated) {
            const row = result.rows[0];
            // Add user info
            if (row.username) {
                review.user = {
                    id: row.user_id,
                    username: row.username,
                    firstName: row.first_name,
                    lastName: row.last_name,
                    profileImageUrl: row.profile_image_url,
                    isVerified: row.user_verified,
                };
            }
            // Add venue info
            if (row.venue_name) {
                review.venue = {
                    id: review.venueId ?? '',
                    name: row.venue_name,
                    city: row.venue_city,
                    imageUrl: row.venue_image,
                };
            }
            // Add band info
            if (row.band_name) {
                review.band = {
                    id: review.bandId ?? '',
                    name: row.band_name,
                    genre: row.band_genre,
                    imageUrl: row.band_image,
                };
            }
        }
        return review;
    }
    /**
     * Search reviews with filters and pagination
     */
    async searchReviews(searchQuery) {
        const { q = '', userId, venueId, bandId, minRating, maxRating, page = 1, limit = 20, sort = 'created_at', order = 'desc', } = searchQuery;
        const offset = (page - 1) * limit;
        const conditions = [];
        const values = [];
        let paramCount = 1;
        // Text search
        if (q.trim()) {
            conditions.push(`(r.title ILIKE $${paramCount} OR r.content ILIKE $${paramCount})`);
            values.push(`%${q.trim()}%`);
            paramCount++;
        }
        // User filter
        if (userId) {
            conditions.push(`r.user_id = $${paramCount}`);
            values.push(userId);
            paramCount++;
        }
        // Venue filter
        if (venueId) {
            conditions.push(`r.venue_id = $${paramCount}`);
            values.push(venueId);
            paramCount++;
        }
        // Band filter
        if (bandId) {
            conditions.push(`r.band_id = $${paramCount}`);
            values.push(bandId);
            paramCount++;
        }
        // Rating filters
        if (minRating) {
            conditions.push(`r.rating >= $${paramCount}`);
            values.push(minRating);
            paramCount++;
        }
        if (maxRating) {
            conditions.push(`r.rating <= $${paramCount}`);
            values.push(maxRating);
            paramCount++;
        }
        // Validate sort column
        const allowedSortColumns = ['created_at', 'rating', 'helpful_count'];
        const sortColumn = allowedSortColumns.includes(sort) ? `r.${sort}` : 'r.created_at';
        const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        // Count query
        const countQuery = `
      SELECT COUNT(*) as total
      FROM reviews r
      ${whereClause}
    `;
        // Main query with related data
        const mainQuery = `
      SELECT r.id, r.user_id, r.venue_id, r.band_id, r.rating, r.title, r.content,
             r.event_date, r.image_urls, r.is_verified, r.helpful_count,
             r.owner_response, r.owner_response_at,
             r.created_at, r.updated_at,
             u.username, u.first_name, u.last_name, u.profile_image_url, u.is_verified as user_verified,
             v.name as venue_name, v.city as venue_city, v.image_url as venue_image,
             b.name as band_name, b.genre as band_genre, b.image_url as band_image
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN venues v ON r.venue_id = v.id
      LEFT JOIN bands b ON r.band_id = b.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;
        values.push(limit, offset);
        const [countResult, reviewsResult] = await Promise.all([
            this.db.query(countQuery, values.slice(0, -2)),
            this.db.query(mainQuery, values),
        ]);
        const total = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(total / limit);
        const reviews = reviewsResult.rows.map((row) => {
            const review = this.mapDbReviewToReview(row);
            // Add related data
            if (row.username) {
                review.user = {
                    id: row.user_id,
                    username: row.username,
                    firstName: row.first_name,
                    lastName: row.last_name,
                    profileImageUrl: row.profile_image_url,
                    isVerified: row.user_verified,
                };
            }
            if (row.venue_name) {
                review.venue = {
                    id: review.venueId ?? '',
                    name: row.venue_name,
                    city: row.venue_city,
                    imageUrl: row.venue_image,
                };
            }
            if (row.band_name) {
                review.band = {
                    id: review.bandId ?? '',
                    name: row.band_name,
                    genre: row.band_genre,
                    imageUrl: row.band_image,
                };
            }
            return review;
        });
        return {
            reviews,
            total,
            page,
            totalPages,
        };
    }
    /**
     * Update review
     */
    async updateReview(reviewId, userId, updateData) {
        // First check if review exists and belongs to user
        const existingReview = await this.getReviewById(reviewId, false);
        if (!existingReview) {
            throw new Error('Review not found');
        }
        if (existingReview.userId !== userId) {
            throw new Error('You can only update your own reviews');
        }
        const allowedFields = ['rating', 'title', 'content', 'eventDate', 'imageUrls'];
        const updates = [];
        const values = [];
        let paramCount = 1;
        for (const [key, value] of Object.entries(updateData)) {
            if (allowedFields.includes(key) && value !== undefined) {
                if (key === 'rating' && typeof value === 'number' && (value < 1 || value > 5)) {
                    throw new Error('Rating must be between 1 and 5');
                }
                const dbField = this.camelToSnakeCase(key);
                updates.push(`${dbField} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }
        if (updates.length === 0) {
            throw new Error('No valid fields to update');
        }
        values.push(reviewId);
        const query = `
      UPDATE reviews 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, user_id, venue_id, band_id, rating, title, content, event_date,
                image_urls, is_verified, helpful_count, created_at, updated_at
    `;
        const result = await this.db.query(query, values);
        const review = this.mapDbReviewToReview(result.rows[0]);
        // Update venue or band rating if rating changed
        if (updateData.rating !== undefined) {
            if (existingReview.venueId) {
                await this.venueService.updateVenueRating(existingReview.venueId);
            }
            else if (existingReview.bandId) {
                await this.bandService.updateBandRating(existingReview.bandId);
            }
        }
        return review;
    }
    /**
     * Delete review
     */
    async deleteReview(reviewId, userId) {
        // First check if review exists and belongs to user
        const existingReview = await this.getReviewById(reviewId, false);
        if (!existingReview) {
            throw new Error('Review not found');
        }
        if (existingReview.userId !== userId) {
            throw new Error('You can only delete your own reviews');
        }
        const query = `DELETE FROM reviews WHERE id = $1`;
        await this.db.query(query, [reviewId]);
        // Update venue or band rating
        if (existingReview.venueId) {
            await this.venueService.updateVenueRating(existingReview.venueId);
        }
        else if (existingReview.bandId) {
            await this.bandService.updateBandRating(existingReview.bandId);
        }
    }
    /**
     * Mark review as helpful or not helpful
     */
    async markReviewHelpful(reviewId, userId, isHelpful) {
        // Check if review exists
        const review = await this.getReviewById(reviewId, false);
        if (!review) {
            throw new Error('Review not found');
        }
        // Can't mark own review as helpful
        if (review.userId === userId) {
            throw new Error('You cannot mark your own review as helpful');
        }
        // Check if user already marked this review
        const existingQuery = `
      SELECT id, is_helpful FROM review_helpfulness 
      WHERE user_id = $1 AND review_id = $2
    `;
        const existingResult = await this.db.query(existingQuery, [userId, reviewId]);
        if (existingResult.rows.length > 0) {
            // Update existing
            if (existingResult.rows[0].is_helpful !== isHelpful) {
                const updateQuery = `
          UPDATE review_helpfulness 
          SET is_helpful = $1 
          WHERE user_id = $2 AND review_id = $3
        `;
                await this.db.query(updateQuery, [isHelpful, userId, reviewId]);
            }
        }
        else {
            // Insert new
            const insertQuery = `
        INSERT INTO review_helpfulness (user_id, review_id, is_helpful)
        VALUES ($1, $2, $3)
      `;
            await this.db.query(insertQuery, [userId, reviewId, isHelpful]);
        }
        // Update helpful count on review
        const updateCountQuery = `
      UPDATE reviews 
      SET helpful_count = (
        SELECT COUNT(*) FROM review_helpfulness 
        WHERE review_id = $1 AND is_helpful = true
      )
      WHERE id = $1
    `;
        await this.db.query(updateCountQuery, [reviewId]);
    }
    /**
     * Get user's review for a venue or band
     */
    async getUserReview(userId, venueId, bandId) {
        if ((!venueId && !bandId) || (venueId && bandId)) {
            throw new Error('Must specify either venueId or bandId');
        }
        const query = `
      SELECT id, user_id, venue_id, band_id, rating, title, content, event_date,
             image_urls, is_verified, helpful_count, created_at, updated_at
      FROM reviews
      WHERE user_id = $1 AND ${venueId ? 'venue_id = $2' : 'band_id = $2'}
    `;
        const result = await this.db.query(query, [userId, venueId || bandId]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapDbReviewToReview(result.rows[0]);
    }
    /**
     * Claimed owner responds to a review.
     * Verifies the user owns the venue/band that the review targets.
     */
    async respondToReview(reviewId, userId, response) {
        // Fetch the review to determine target entity
        const review = await this.getReviewById(reviewId, false);
        if (!review) {
            throw new errors_1.NotFoundError('Review not found');
        }
        // Determine entity and check claimed ownership
        let isOwner = false;
        if (review.venueId) {
            const result = await this.db.query('SELECT 1 FROM venues WHERE id = $1 AND claimed_by_user_id = $2', [review.venueId, userId]);
            isOwner = result.rows.length > 0;
        }
        else if (review.bandId) {
            const result = await this.db.query('SELECT 1 FROM bands WHERE id = $1 AND claimed_by_user_id = $2', [review.bandId, userId]);
            isOwner = result.rows.length > 0;
        }
        if (!isOwner) {
            throw new errors_1.ForbiddenError('Only the claimed owner can respond to reviews');
        }
        // Update review with owner response
        const updateResult = await this.db.query(`UPDATE reviews
       SET owner_response = $1, owner_response_at = NOW(), updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND owner_response IS NULL
       RETURNING id, user_id, venue_id, band_id, rating, title, content, event_date,
                 image_urls, is_verified, helpful_count, owner_response, owner_response_at,
                 created_at, updated_at`, [response, reviewId]);
        if (updateResult.rowCount === 0) {
            throw new errors_1.ConflictError('A response already exists for this review');
        }
        return this.mapDbReviewToReview(updateResult.rows[0]);
    }
    /**
     * Check if user already reviewed venue/band
     */
    async findExistingReview(userId, venueId, bandId) {
        return await this.getUserReview(userId, venueId, bandId);
    }
    /**
     * Map database review row to Review type
     */
    mapDbReviewToReview(row) {
        return {
            id: row.id,
            userId: row.user_id,
            venueId: row.venue_id,
            bandId: row.band_id,
            rating: row.rating,
            title: row.title,
            content: row.content,
            eventDate: row.event_date,
            imageUrls: row.image_urls,
            isVerified: row.is_verified,
            helpfulCount: row.helpful_count || 0,
            ownerResponse: row.owner_response || undefined,
            ownerResponseAt: row.owner_response_at || undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
    /**
     * Convert camelCase to snake_case
     */
    camelToSnakeCase(str) {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }
}
exports.ReviewService = ReviewService;
//# sourceMappingURL=ReviewService.js.map