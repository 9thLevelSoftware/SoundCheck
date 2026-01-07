import { CheckinService } from '../../services/CheckinService';
import Database from '../../config/database';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../services/VenueService');
jest.mock('../../services/BandService');

const mockDb = {
  query: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('CheckinService', () => {
  let checkinService: CheckinService;

  beforeEach(() => {
    checkinService = new CheckinService();
    jest.clearAllMocks();
  });

  describe('getActivityFeed', () => {
    const mockUserId = 'user-123';
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

      const result = await checkinService.getActivityFeed(mockUserId, 'friends');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('checkin-1');

      // Verify the query was called with correct parameters
      const [query, params] = mockDb.query.mock.calls[0];
      expect(params).toEqual([mockUserId, 50, 0]); // userId, limit, offset
      expect(query).toContain('LIMIT $2 OFFSET $3');
    });

    it('should get activity feed with global filter', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockCheckinRow] });

      const result = await checkinService.getActivityFeed(mockUserId, 'global');

      expect(result).toHaveLength(1);

      // Verify the query was called with correct parameters
      const [query, params] = mockDb.query.mock.calls[0];
      expect(params).toEqual([mockUserId, 50, 0]); // userId, limit, offset
      expect(query).toContain('LIMIT $2 OFFSET $3');
    });

    it('should get activity feed with nearby filter and coordinates using dynamic parameter indexing', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockCheckinRow] });

      const latitude = 40.7128;
      const longitude = -74.0060;

      const result = await checkinService.getActivityFeed(mockUserId, 'nearby', {
        latitude,
        longitude,
        limit: 25,
        offset: 10,
      });

      expect(result).toHaveLength(1);

      // Verify the query was called with correct parameters
      // For 'nearby' with coordinates, params should be: [userId, lat, lng, limit, offset]
      const [query, params] = mockDb.query.mock.calls[0];
      expect(params).toEqual([mockUserId, latitude, longitude, 25, 10]);

      // Critical: Verify that LIMIT and OFFSET use correct dynamic parameter indexes ($4 and $5)
      // NOT the hardcoded $2 and $3 which would be latitude and longitude
      expect(query).toContain('LIMIT $4 OFFSET $5');
      expect(query).not.toMatch(/LIMIT \$2 OFFSET \$3/);
    });

    it('should handle nearby filter without coordinates (fallback to global)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockCheckinRow] });

      const result = await checkinService.getActivityFeed(mockUserId, 'nearby', {
        limit: 30,
        offset: 5,
      });

      expect(result).toHaveLength(1);

      // Without coordinates, params should be: [userId, limit, offset]
      const [query, params] = mockDb.query.mock.calls[0];
      expect(params).toEqual([mockUserId, 30, 5]);
      expect(query).toContain('LIMIT $2 OFFSET $3');
    });

    it('should use default limit and offset when not provided', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await checkinService.getActivityFeed(mockUserId, 'friends');

      const [, params] = mockDb.query.mock.calls[0];
      expect(params).toEqual([mockUserId, 50, 0]); // default limit=50, offset=0
    });

    it('should return empty array when no checkins found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await checkinService.getActivityFeed(mockUserId, 'global');

      expect(result).toEqual([]);
    });

    it('should properly map database rows to Checkin objects', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockCheckinRow] });

      const result = await checkinService.getActivityFeed(mockUserId, 'friends');

      expect(result[0]).toEqual({
        id: 'checkin-1',
        userId: mockUserId,
        venueId: 'venue-1',
        bandId: 'band-1',
        rating: 4.5,
        comment: 'Great show!',
        photoUrl: null,
        eventDate: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        user: {
          id: mockUserId,
          username: 'testuser',
          profileImageUrl: null,
        },
        venue: {
          id: 'venue-1',
          name: 'Test Venue',
          city: 'Test City',
          state: 'TS',
          imageUrl: null,
        },
        band: {
          id: 'band-1',
          name: 'Test Band',
          genre: 'Rock',
          imageUrl: null,
        },
        toastCount: 5,
        commentCount: 2,
        hasUserToasted: false,
      });
    });

    it('should handle database errors gracefully', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(
        checkinService.getActivityFeed(mockUserId, 'friends')
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('getCheckins', () => {
    it('should use dynamic parameter indexing for filters', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await checkinService.getCheckins({
        venueId: 'venue-1',
        bandId: 'band-1',
        userId: 'user-1',
        page: 2,
        limit: 10,
      });

      const [query, params] = mockDb.query.mock.calls[0];

      // Verify parameters are in correct order
      expect(params).toEqual(['venue-1', 'band-1', 'user-1', 10, 10]); // filters, limit, offset

      // Verify dynamic indexing in query
      expect(query).toContain('venue_id = $1');
      expect(query).toContain('band_id = $2');
      expect(query).toContain('user_id = $3');
      expect(query).toContain('LIMIT $4 OFFSET $5');
    });
  });
});
