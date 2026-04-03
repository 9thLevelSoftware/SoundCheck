import { CheckinQueryService } from '../../services/checkin/CheckinQueryService';
import Database from '../../config/database';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../services/BlockService');

const mockDb = {
  query: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('CheckinQueryService', () => {
  let checkinQueryService: CheckinQueryService;

  beforeEach(() => {
    checkinQueryService = new CheckinQueryService();
    jest.clearAllMocks();
  });

  describe('getCheckinById', () => {
    const mockCheckinId = '550e8400-e29b-41d4-a716-446655440001';
    const mockUserId = '550e8400-e29b-41d4-a716-446655440000';

    it('should fetch checkin with band ratings in a single query', async () => {
      const mockRow = {
        id: mockCheckinId,
        user_id: mockUserId,
        venue_id: 'venue-1',
        band_id: 'band-1',
        rating: '4.5',
        comment: 'Great show!',
        photo_url: null,
        event_date: null,
        created_at: new Date(),
        updated_at: new Date(),
        username: 'testuser',
        profile_image_url: null,
        venue_name: 'Test Venue',
        venue_city: 'Test City',
        venue_state: 'TS',
        venue_image: null,
        band_name: 'Test Band',
        band_genre: 'Rock',
        band_image: null,
        toast_count: '5',
        comment_count: '2',
        has_user_toasted: false,
        band_ratings: [
          { band_id: 'band-1', rating: '4.5', band_name: 'Test Band' },
          { band_id: 'band-2', rating: '5.0', band_name: 'Opening Band' },
        ],
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await checkinQueryService.getCheckinById(mockCheckinId, mockUserId);

      // Verify only ONE database query was made (N+1 fix verification)
      expect(mockDb.query).toHaveBeenCalledTimes(1);

      // Verify the query includes json_agg for band_ratings
      const [query, params] = mockDb.query.mock.calls[0];
      expect(query).toContain('json_agg');
      expect(query).toContain('checkin_band_ratings');
      expect(query).toContain('band_ratings');

      // Verify correct parameters
      expect(params).toEqual([mockCheckinId, mockUserId]);

      // Verify band ratings are properly parsed
      expect(result.bandRatings).toHaveLength(2);
      expect(result.bandRatings).toEqual([
        { bandId: 'band-1', rating: 4.5, bandName: 'Test Band' },
        { bandId: 'band-2', rating: 5.0, bandName: 'Opening Band' },
      ]);
    });

    it('should handle checkin without band ratings (empty array)', async () => {
      const mockRow = {
        id: mockCheckinId,
        user_id: mockUserId,
        venue_id: 'venue-1',
        band_id: 'band-1',
        rating: '4.5',
        comment: 'Great show!',
        photo_url: null,
        event_date: null,
        created_at: new Date(),
        updated_at: new Date(),
        username: 'testuser',
        profile_image_url: null,
        venue_name: 'Test Venue',
        venue_city: 'Test City',
        venue_state: 'TS',
        venue_image: null,
        band_name: 'Test Band',
        band_genre: 'Rock',
        band_image: null,
        toast_count: '5',
        comment_count: '2',
        has_user_toasted: false,
        band_ratings: [],
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await checkinQueryService.getCheckinById(mockCheckinId, mockUserId);

      // Verify single query
      expect(mockDb.query).toHaveBeenCalledTimes(1);

      // Verify bandRatings is undefined when empty
      expect(result.bandRatings).toBeUndefined();
    });

    it('should fetch checkin without currentUserId (no has_user_toasted)', async () => {
      const mockRow = {
        id: mockCheckinId,
        user_id: mockUserId,
        venue_id: 'venue-1',
        band_id: 'band-1',
        rating: '4.5',
        comment: 'Great show!',
        photo_url: null,
        event_date: null,
        created_at: new Date(),
        updated_at: new Date(),
        username: 'testuser',
        profile_image_url: null,
        venue_name: 'Test Venue',
        venue_city: 'Test City',
        venue_state: 'TS',
        venue_image: null,
        band_name: 'Test Band',
        band_genre: 'Rock',
        band_image: null,
        toast_count: '5',
        comment_count: '2',
        band_ratings: [],
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRow] });

      await checkinQueryService.getCheckinById(mockCheckinId);

      // Verify single query with only checkinId param
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [, params] = mockDb.query.mock.calls[0];
      expect(params).toEqual([mockCheckinId]);
    });

    it('should throw error when checkin not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(checkinQueryService.getCheckinById(mockCheckinId)).rejects.toThrow(
        'Check-in not found'
      );
    });

    it('should handle database errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(checkinQueryService.getCheckinById(mockCheckinId)).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('getActivityFeed', () => {
    const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
    const mockCheckinRow = {
      id: 'checkin-1',
      user_id: mockUserId,
      venue_id: 'venue-1',
      band_id: 'band-1',
      rating: '4.5',
      comment: 'Great show!',
      photo_url: null,
      event_date: null,
      created_at: new Date(),
      updated_at: new Date(),
      username: 'testuser',
      profile_image_url: null,
      venue_name: 'Test Venue',
      venue_city: 'Test City',
      venue_state: 'TS',
      venue_image: null,
      band_name: 'Test Band',
      band_genre: 'Rock',
      band_image: null,
      toast_count: '5',
      comment_count: '2',
      has_user_toasted: false,
    };

    it('should get activity feed with friends filter', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockCheckinRow] });

      const result = await checkinQueryService.getActivityFeed(mockUserId, 'friends');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('checkin-1');

      // Verify single query
      expect(mockDb.query).toHaveBeenCalledTimes(1);

      const [query, params] = mockDb.query.mock.calls[0];
      expect(params).toEqual([mockUserId, 50, 0]);
      expect(query).toContain('LIMIT $2 OFFSET $3');
    });

    it('should get activity feed with global filter', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockCheckinRow] });

      const result = await checkinQueryService.getActivityFeed(mockUserId, 'global');

      expect(result).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCheckins', () => {
    it('should get checkins with filters', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await checkinQueryService.getCheckins({
        venueId: 'venue-1',
        bandId: 'band-1',
        userId: 'user-1',
      });

      // Verify single query
      expect(mockDb.query).toHaveBeenCalledTimes(1);

      const [query, params] = mockDb.query.mock.calls[0];
      expect(params).toEqual(['venue-1', 'band-1', 'user-1', 20, 0]);
      expect(query).toContain('venue_id = $1');
      expect(query).toContain('band_id = $2');
      expect(query).toContain('user_id = $3');
    });
  });

  describe('getVibeTags', () => {
    it('should fetch all vibe tags', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'tag-1', name: 'Energetic', icon: '⚡', category: 'mood' },
          { id: 'tag-2', name: 'Acoustic', icon: '🎸', category: 'style' },
        ],
      });

      const result = await checkinQueryService.getVibeTags();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'tag-1',
        name: 'Energetic',
        icon: '⚡',
        category: 'mood',
      });

      // Verify single query
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });
  });
});
