import { ReviewService } from '../../services/ReviewService';
import Database from '../../config/database';
import { VenueService } from '../../services/VenueService';
import { BandService } from '../../services/BandService';
import { BadgeService } from '../../services/BadgeService';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../services/VenueService');
jest.mock('../../services/BandService');
jest.mock('../../services/BadgeService');

const mockDb = {
  query: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('ReviewService', () => {
  let reviewService: ReviewService;
  let mockVenueService: jest.Mocked<VenueService>;
  let mockBandService: jest.Mocked<BandService>;
  let mockBadgeService: jest.Mocked<BadgeService>;

  const mockReviewRow = {
    id: 'review-123',
    user_id: 'user-123',
    venue_id: 'venue-123',
    band_id: null,
    rating: 4,
    title: 'Great venue!',
    content: 'Had an amazing experience at this venue.',
    event_date: '2024-01-15',
    image_urls: ['https://example.com/image1.jpg'],
    is_verified: false,
    helpful_count: 5,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const mockReviewRowWithRelated = {
    ...mockReviewRow,
    username: 'testuser',
    first_name: 'Test',
    last_name: 'User',
    profile_image_url: 'https://example.com/profile.jpg',
    user_verified: true,
    venue_name: 'The Fillmore',
    venue_city: 'San Francisco',
    venue_image: 'https://example.com/venue.jpg',
    band_name: null,
    band_genre: null,
    band_image: null,
  };

  beforeEach(() => {
    reviewService = new ReviewService();
    jest.clearAllMocks();

    // Get mock instances
    mockVenueService = (reviewService as any).venueService;
    mockBandService = (reviewService as any).bandService;
    mockBadgeService = (reviewService as any).badgeService;
  });

  describe('createReview', () => {
    const validReviewData = {
      venueId: 'venue-123',
      rating: 4,
      title: 'Great venue!',
      content: 'Had an amazing experience at this venue.',
      eventDate: '2024-01-15',
      imageUrls: ['https://example.com/image1.jpg'],
    };

    it('should create a venue review successfully', async () => {
      mockVenueService.getVenueById = jest.fn().mockResolvedValue({ id: 'venue-123', name: 'Test Venue' });
      mockVenueService.updateVenueRating = jest.fn().mockResolvedValue(undefined);
      mockBadgeService.checkAndAwardBadges = jest.fn().mockResolvedValue(undefined);

      // Mock no existing review
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // getUserReview - no existing review
        .mockResolvedValueOnce({ rows: [mockReviewRow] }); // INSERT

      const result = await reviewService.createReview('user-123', validReviewData);

      expect(result).toEqual({
        id: 'review-123',
        userId: 'user-123',
        venueId: 'venue-123',
        bandId: null,
        rating: 4,
        title: 'Great venue!',
        content: 'Had an amazing experience at this venue.',
        eventDate: '2024-01-15',
        imageUrls: ['https://example.com/image1.jpg'],
        isVerified: false,
        helpfulCount: 5,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });

      expect(mockVenueService.getVenueById).toHaveBeenCalledWith('venue-123');
      expect(mockVenueService.updateVenueRating).toHaveBeenCalledWith('venue-123');
    });

    it('should create a band review successfully', async () => {
      const bandReviewData = {
        bandId: 'band-123',
        rating: 5,
        title: 'Amazing band!',
        content: 'Best concert ever.',
      };

      const mockBandReviewRow = {
        ...mockReviewRow,
        venue_id: null,
        band_id: 'band-123',
        rating: 5,
        title: 'Amazing band!',
        content: 'Best concert ever.',
      };

      mockBandService.getBandById = jest.fn().mockResolvedValue({ id: 'band-123', name: 'Test Band' });
      mockBandService.updateBandRating = jest.fn().mockResolvedValue(undefined);
      mockBadgeService.checkAndAwardBadges = jest.fn().mockResolvedValue(undefined);

      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // getUserReview - no existing review
        .mockResolvedValueOnce({ rows: [mockBandReviewRow] }); // INSERT

      const result = await reviewService.createReview('user-123', bandReviewData);

      expect(result.bandId).toBe('band-123');
      expect(result.venueId).toBeNull();
      expect(mockBandService.getBandById).toHaveBeenCalledWith('band-123');
      expect(mockBandService.updateBandRating).toHaveBeenCalledWith('band-123');
    });

    it('should throw error when neither venue nor band specified', async () => {
      const invalidData = {
        rating: 4,
        title: 'Invalid review',
      };

      await expect(reviewService.createReview('user-123', invalidData as any)).rejects.toThrow(
        'Review must be for either a venue or a band, not both'
      );
    });

    it('should throw error when both venue and band specified', async () => {
      const invalidData = {
        venueId: 'venue-123',
        bandId: 'band-123',
        rating: 4,
        title: 'Invalid review',
      };

      await expect(reviewService.createReview('user-123', invalidData)).rejects.toThrow(
        'Review must be for either a venue or a band, not both'
      );
    });

    it('should throw error for invalid rating below 1', async () => {
      const invalidData = {
        venueId: 'venue-123',
        rating: 0,
        title: 'Invalid review',
      };

      await expect(reviewService.createReview('user-123', invalidData)).rejects.toThrow(
        'Rating must be between 1 and 5'
      );
    });

    it('should throw error for invalid rating above 5', async () => {
      const invalidData = {
        venueId: 'venue-123',
        rating: 6,
        title: 'Invalid review',
      };

      await expect(reviewService.createReview('user-123', invalidData)).rejects.toThrow(
        'Rating must be between 1 and 5'
      );
    });

    it('should throw error when venue not found', async () => {
      mockVenueService.getVenueById = jest.fn().mockResolvedValue(null);

      await expect(reviewService.createReview('user-123', validReviewData)).rejects.toThrow('Venue not found');
    });

    it('should throw error when band not found', async () => {
      const bandReviewData = {
        bandId: 'band-123',
        rating: 4,
        title: 'Review',
      };

      mockBandService.getBandById = jest.fn().mockResolvedValue(null);

      await expect(reviewService.createReview('user-123', bandReviewData)).rejects.toThrow('Band not found');
    });

    it('should throw error when user already reviewed venue', async () => {
      mockVenueService.getVenueById = jest.fn().mockResolvedValue({ id: 'venue-123', name: 'Test Venue' });

      // Mock existing review found
      mockDb.query.mockResolvedValueOnce({ rows: [mockReviewRow] });

      await expect(reviewService.createReview('user-123', validReviewData)).rejects.toThrow(
        'You have already reviewed this venue/band'
      );
    });
  });

  describe('getReviewById', () => {
    it('should get review by ID with related data', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockReviewRowWithRelated] });

      const result = await reviewService.getReviewById('review-123', true);

      expect(result).toBeDefined();
      expect(result?.id).toBe('review-123');
      expect(result?.user).toEqual({
        id: 'user-123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        profileImageUrl: 'https://example.com/profile.jpg',
        isVerified: true,
      });
      expect(result?.venue).toEqual({
        id: 'venue-123',
        name: 'The Fillmore',
        city: 'San Francisco',
        imageUrl: 'https://example.com/venue.jpg',
      });
    });

    it('should get review by ID without related data', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockReviewRow] });

      const result = await reviewService.getReviewById('review-123', false);

      expect(result).toBeDefined();
      expect(result?.id).toBe('review-123');
      expect(result?.user).toBeUndefined();
      expect(result?.venue).toBeUndefined();
    });

    it('should return null for non-existent review', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await reviewService.getReviewById('non-existent');

      expect(result).toBeNull();
    });

    it('should include band info when review is for a band', async () => {
      const mockBandReviewRowWithRelated = {
        ...mockReviewRow,
        venue_id: null,
        band_id: 'band-123',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        profile_image_url: null,
        user_verified: false,
        venue_name: null,
        venue_city: null,
        venue_image: null,
        band_name: 'The Rockers',
        band_genre: 'Rock',
        band_image: 'https://example.com/band.jpg',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockBandReviewRowWithRelated] });

      const result = await reviewService.getReviewById('review-123', true);

      expect(result?.band).toEqual({
        id: 'band-123',
        name: 'The Rockers',
        genre: 'Rock',
        imageUrl: 'https://example.com/band.jpg',
      });
      expect(result?.venue).toBeUndefined();
    });
  });

  describe('updateReview', () => {
    it('should update review successfully', async () => {
      const updateData = {
        rating: 5,
        title: 'Updated title',
        content: 'Updated content',
      };

      const updatedReviewRow = {
        ...mockReviewRow,
        rating: 5,
        title: 'Updated title',
        content: 'Updated content',
      };

      // Mock getReviewById
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockReviewRow] }) // getReviewById
        .mockResolvedValueOnce({ rows: [updatedReviewRow] }); // UPDATE

      mockVenueService.updateVenueRating = jest.fn().mockResolvedValue(undefined);

      const result = await reviewService.updateReview('review-123', 'user-123', updateData);

      expect(result.rating).toBe(5);
      expect(result.title).toBe('Updated title');
      expect(result.content).toBe('Updated content');
      expect(mockVenueService.updateVenueRating).toHaveBeenCalledWith('venue-123');
    });

    it('should throw error for non-existent review', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        reviewService.updateReview('non-existent', 'user-123', { rating: 5 })
      ).rejects.toThrow('Review not found');
    });

    it('should throw error when updating another user review', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockReviewRow] });

      await expect(
        reviewService.updateReview('review-123', 'different-user', { rating: 5 })
      ).rejects.toThrow('You can only update your own reviews');
    });

    it('should throw error for invalid rating', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockReviewRow] });

      await expect(
        reviewService.updateReview('review-123', 'user-123', { rating: 10 })
      ).rejects.toThrow('Rating must be between 1 and 5');
    });

    it('should throw error when no valid fields to update', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockReviewRow] });

      await expect(
        reviewService.updateReview('review-123', 'user-123', { venueId: 'new-venue' } as any)
      ).rejects.toThrow('No valid fields to update');
    });

    it('should update band rating when band review is updated', async () => {
      const mockBandReviewRow = {
        ...mockReviewRow,
        venue_id: null,
        band_id: 'band-123',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockBandReviewRow] })
        .mockResolvedValueOnce({ rows: [{ ...mockBandReviewRow, rating: 5 }] });

      mockBandService.updateBandRating = jest.fn().mockResolvedValue(undefined);

      await reviewService.updateReview('review-123', 'user-123', { rating: 5 });

      expect(mockBandService.updateBandRating).toHaveBeenCalledWith('band-123');
    });
  });

  describe('deleteReview', () => {
    it('should delete review successfully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockReviewRow] }) // getReviewById
        .mockResolvedValueOnce({ rowCount: 1 }); // DELETE

      mockVenueService.updateVenueRating = jest.fn().mockResolvedValue(undefined);

      await reviewService.deleteReview('review-123', 'user-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM reviews'),
        ['review-123']
      );
      expect(mockVenueService.updateVenueRating).toHaveBeenCalledWith('venue-123');
    });

    it('should throw error for non-existent review', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(reviewService.deleteReview('non-existent', 'user-123')).rejects.toThrow(
        'Review not found'
      );
    });

    it('should throw error when deleting another user review', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockReviewRow] });

      await expect(reviewService.deleteReview('review-123', 'different-user')).rejects.toThrow(
        'You can only delete your own reviews'
      );
    });

    it('should update band rating when band review is deleted', async () => {
      const mockBandReviewRow = {
        ...mockReviewRow,
        venue_id: null,
        band_id: 'band-123',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockBandReviewRow] })
        .mockResolvedValueOnce({ rowCount: 1 });

      mockBandService.updateBandRating = jest.fn().mockResolvedValue(undefined);

      await reviewService.deleteReview('review-123', 'user-123');

      expect(mockBandService.updateBandRating).toHaveBeenCalledWith('band-123');
    });
  });

  describe('searchReviews', () => {
    const mockReviewsResult = [mockReviewRowWithRelated];

    it('should search reviews with default parameters', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '10' }] }) // COUNT
        .mockResolvedValueOnce({ rows: mockReviewsResult }); // SELECT

      const result = await reviewService.searchReviews({});

      expect(result).toEqual({
        reviews: expect.arrayContaining([
          expect.objectContaining({
            id: 'review-123',
            userId: 'user-123',
          }),
        ]),
        total: 10,
        page: 1,
        totalPages: 1,
      });
    });

    it('should search reviews with text query', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({ rows: mockReviewsResult });

      const result = await reviewService.searchReviews({ q: 'great' });

      expect(result.total).toBe(5);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%great%'])
      );
    });

    it('should filter by userId', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '3' }] })
        .mockResolvedValueOnce({ rows: mockReviewsResult });

      await reviewService.searchReviews({ userId: 'user-123' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('user_id = '),
        expect.arrayContaining(['user-123'])
      );
    });

    it('should filter by venueId', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({ rows: mockReviewsResult });

      await reviewService.searchReviews({ venueId: 'venue-123' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('venue_id = '),
        expect.arrayContaining(['venue-123'])
      );
    });

    it('should filter by bandId', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: mockReviewsResult });

      await reviewService.searchReviews({ bandId: 'band-123' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('band_id = '),
        expect.arrayContaining(['band-123'])
      );
    });

    it('should filter by rating range', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '4' }] })
        .mockResolvedValueOnce({ rows: mockReviewsResult });

      await reviewService.searchReviews({ minRating: 3, maxRating: 5 });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('rating >= '),
        expect.arrayContaining([3])
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('rating <= '),
        expect.arrayContaining([5])
      );
    });

    it('should handle pagination correctly', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '50' }] })
        .mockResolvedValueOnce({ rows: mockReviewsResult });

      const result = await reviewService.searchReviews({ page: 2, limit: 10 });

      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(5);
    });

    it('should handle sorting', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '10' }] })
        .mockResolvedValueOnce({ rows: mockReviewsResult });

      await reviewService.searchReviews({ sort: 'rating', order: 'asc' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY r.rating ASC'),
        expect.any(Array)
      );
    });

    it('should use default sort for invalid sort column', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '10' }] })
        .mockResolvedValueOnce({ rows: mockReviewsResult });

      await reviewService.searchReviews({ sort: 'invalid_column' });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY r.created_at DESC'),
        expect.any(Array)
      );
    });

    it('should include related user data in results', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [mockReviewRowWithRelated] });

      const result = await reviewService.searchReviews({});

      expect(result.reviews[0].user).toEqual({
        id: 'user-123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        profileImageUrl: 'https://example.com/profile.jpg',
        isVerified: true,
      });
    });
  });

  describe('markReviewHelpful', () => {
    it('should mark review as helpful for the first time', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockReviewRow] }) // getReviewById
        .mockResolvedValueOnce({ rows: [] }) // Check existing helpfulness
        .mockResolvedValueOnce({ rowCount: 1 }) // INSERT
        .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE count

      await reviewService.markReviewHelpful('review-123', 'another-user', true);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO review_helpfulness'),
        ['another-user', 'review-123', true]
      );
    });

    it('should update existing helpfulness', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockReviewRow] }) // getReviewById
        .mockResolvedValueOnce({ rows: [{ id: 'help-1', is_helpful: false }] }) // Existing helpfulness
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE helpfulness
        .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE count

      await reviewService.markReviewHelpful('review-123', 'another-user', true);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE review_helpfulness'),
        [true, 'another-user', 'review-123']
      );
    });

    it('should throw error for non-existent review', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        reviewService.markReviewHelpful('non-existent', 'user-123', true)
      ).rejects.toThrow('Review not found');
    });

    it('should throw error when marking own review', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockReviewRow] });

      await expect(
        reviewService.markReviewHelpful('review-123', 'user-123', true)
      ).rejects.toThrow('You cannot mark your own review as helpful');
    });
  });

  describe('getUserReview', () => {
    it('should get user review for venue', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockReviewRow] });

      const result = await reviewService.getUserReview('user-123', 'venue-123');

      expect(result).toBeDefined();
      expect(result?.userId).toBe('user-123');
      expect(result?.venueId).toBe('venue-123');
    });

    it('should get user review for band', async () => {
      const mockBandReviewRow = {
        ...mockReviewRow,
        venue_id: null,
        band_id: 'band-123',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockBandReviewRow] });

      const result = await reviewService.getUserReview('user-123', undefined, 'band-123');

      expect(result).toBeDefined();
      expect(result?.bandId).toBe('band-123');
    });

    it('should return null when no review exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await reviewService.getUserReview('user-123', 'venue-123');

      expect(result).toBeNull();
    });

    it('should throw error when neither venueId nor bandId specified', async () => {
      await expect(reviewService.getUserReview('user-123')).rejects.toThrow(
        'Must specify either venueId or bandId'
      );
    });

    it('should throw error when both venueId and bandId specified', async () => {
      await expect(
        reviewService.getUserReview('user-123', 'venue-123', 'band-123')
      ).rejects.toThrow('Must specify either venueId or bandId');
    });
  });
});
