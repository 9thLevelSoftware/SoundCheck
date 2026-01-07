import { DataExportService, GDPRExport } from '../../services/DataExportService';
import Database from '../../config/database';

// Mock dependencies
jest.mock('../../config/database');

const mockDb = {
  query: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('DataExportService', () => {
  let dataExportService: DataExportService;

  beforeEach(() => {
    dataExportService = new DataExportService();
    jest.clearAllMocks();
  });

  describe('exportUserData', () => {
    const userId = 'user-123';
    const mockProfile = {
      id: userId,
      email: 'test@example.com',
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      bio: 'Test bio',
      profile_image_url: 'https://example.com/image.jpg',
      location: 'New York',
      date_of_birth: new Date('1990-01-01'),
      is_verified: true,
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-06-01'),
    };

    it('should export all user data categories', async () => {
      // Mock profile query
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockProfile] }) // Profile
        .mockResolvedValueOnce({ rows: [] }) // Checkins
        .mockResolvedValueOnce({ rows: [] }) // Reviews
        .mockResolvedValueOnce({ rows: [] }) // Followers
        .mockResolvedValueOnce({ rows: [] }) // Following
        .mockResolvedValueOnce({ rows: [] }) // Wishlist
        .mockResolvedValueOnce({ rows: [] }); // Badges

      const result = await dataExportService.exportUserData(userId);

      expect(result.format).toBe('GDPR_EXPORT_V1');
      expect(result.exportedAt).toBeDefined();
      expect(result.profile).toBeDefined();
      expect(result.checkins).toBeDefined();
      expect(result.reviews).toBeDefined();
      expect(result.followers).toBeDefined();
      expect(result.following).toBeDefined();
      expect(result.wishlist).toBeDefined();
      expect(result.badges).toBeDefined();
    });

    it('should NOT include password_hash in profile', async () => {
      const profileWithPassword = {
        ...mockProfile,
        password_hash: 'secret_hash_should_not_appear',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [profileWithPassword] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dataExportService.exportUserData(userId);

      // Verify password_hash is not in the export
      expect((result.profile as any).passwordHash).toBeUndefined();
      expect((result.profile as any).password_hash).toBeUndefined();

      // Verify the query does not select password_hash
      const profileQuery = mockDb.query.mock.calls[0][0];
      expect(profileQuery).not.toContain('password_hash');
    });

    it('should throw error if user not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(dataExportService.exportUserData(userId))
        .rejects.toThrow('User not found');
    });

    it('should handle empty data gracefully', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockProfile] })
        .mockResolvedValueOnce({ rows: [] }) // No checkins
        .mockResolvedValueOnce({ rows: [] }) // No reviews
        .mockResolvedValueOnce({ rows: [] }) // No followers
        .mockResolvedValueOnce({ rows: [] }) // No following
        .mockResolvedValueOnce({ rows: [] }) // No wishlist
        .mockResolvedValueOnce({ rows: [] }); // No badges

      const result = await dataExportService.exportUserData(userId);

      expect(result.checkins).toEqual([]);
      expect(result.reviews).toEqual([]);
      expect(result.followers).toEqual([]);
      expect(result.following).toEqual([]);
      expect(result.wishlist).toEqual([]);
      expect(result.badges).toEqual([]);
    });

    it('should include checkins with venue and band names', async () => {
      const mockCheckin = {
        id: 'checkin-1',
        rating: 4.5,
        comment: 'Great show!',
        photo_url: 'https://example.com/photo.jpg',
        event_date: new Date('2024-03-15'),
        created_at: new Date('2024-03-16'),
        venue_name: 'The Roxy',
        venue_city: 'Los Angeles',
        band_name: 'The Strokes',
        band_genre: 'Rock',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockProfile] })
        .mockResolvedValueOnce({ rows: [mockCheckin] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dataExportService.exportUserData(userId);

      expect(result.checkins).toHaveLength(1);
      expect(result.checkins[0].venueName).toBe('The Roxy');
      expect(result.checkins[0].venueCity).toBe('Los Angeles');
      expect(result.checkins[0].bandName).toBe('The Strokes');
      expect(result.checkins[0].bandGenre).toBe('Rock');
      expect(result.checkins[0].rating).toBe(4.5);
      expect(result.checkins[0].comment).toBe('Great show!');
    });

    it('should include reviews with venue and band names', async () => {
      const mockReview = {
        id: 'review-1',
        rating: 5,
        title: 'Amazing venue!',
        content: 'Best concert experience ever.',
        event_date: new Date('2024-03-10'),
        image_urls: ['https://example.com/img1.jpg'],
        is_verified: true,
        helpful_count: 10,
        created_at: new Date('2024-03-11'),
        venue_name: 'Madison Square Garden',
        band_name: null,
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockProfile] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockReview] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dataExportService.exportUserData(userId);

      expect(result.reviews).toHaveLength(1);
      expect(result.reviews[0].venueName).toBe('Madison Square Garden');
      expect(result.reviews[0].rating).toBe(5);
      expect(result.reviews[0].title).toBe('Amazing venue!');
      expect(result.reviews[0].helpfulCount).toBe(10);
    });

    it('should include followers list', async () => {
      const mockFollower = {
        id: 'follower-1',
        username: 'followeruser',
        followed_at: new Date('2024-02-01'),
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockProfile] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockFollower] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dataExportService.exportUserData(userId);

      expect(result.followers).toHaveLength(1);
      expect(result.followers[0].username).toBe('followeruser');
      expect(result.followers[0].followedAt).toBeDefined();
    });

    it('should include following list', async () => {
      const mockFollowing = {
        id: 'following-1',
        username: 'followinguser',
        followed_at: new Date('2024-02-15'),
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockProfile] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockFollowing] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dataExportService.exportUserData(userId);

      expect(result.following).toHaveLength(1);
      expect(result.following[0].username).toBe('followinguser');
    });

    it('should include wishlist with band details', async () => {
      const mockWishlistItem = {
        id: 'wishlist-1',
        band_name: 'Arctic Monkeys',
        band_genre: 'Indie Rock',
        notify_when_nearby: true,
        created_at: new Date('2024-01-20'),
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockProfile] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockWishlistItem] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dataExportService.exportUserData(userId);

      expect(result.wishlist).toHaveLength(1);
      expect(result.wishlist[0].bandName).toBe('Arctic Monkeys');
      expect(result.wishlist[0].bandGenre).toBe('Indie Rock');
      expect(result.wishlist[0].notifyWhenNearby).toBe(true);
    });

    it('should include earned badges', async () => {
      const mockBadge = {
        id: 'userbadge-1',
        name: 'Concert Veteran',
        description: 'Attended 50 concerts',
        badge_type: 'review_count',
        earned_at: new Date('2024-04-01'),
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockProfile] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockBadge] });

      const result = await dataExportService.exportUserData(userId);

      expect(result.badges).toHaveLength(1);
      expect(result.badges[0].name).toBe('Concert Veteran');
      expect(result.badges[0].description).toBe('Attended 50 concerts');
      expect(result.badges[0].badgeType).toBe('review_count');
    });

    it('should format dates as ISO strings', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockProfile] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dataExportService.exportUserData(userId);

      // Check that dates are ISO strings
      expect(result.profile.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result.profile.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle null optional fields gracefully', async () => {
      const profileWithNulls = {
        id: userId,
        email: 'test@example.com',
        username: 'testuser',
        first_name: null,
        last_name: null,
        bio: null,
        profile_image_url: null,
        location: null,
        date_of_birth: null,
        is_verified: false,
        is_active: true,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [profileWithNulls] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dataExportService.exportUserData(userId);

      expect(result.profile.firstName).toBeNull();
      expect(result.profile.lastName).toBeNull();
      expect(result.profile.bio).toBeNull();
      expect(result.profile.profileImageUrl).toBeNull();
      expect(result.profile.location).toBeNull();
      expect(result.profile.dateOfBirth).toBeNull();
    });

    it('should use correct format version', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockProfile] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dataExportService.exportUserData(userId);

      expect(result.format).toBe('GDPR_EXPORT_V1');
    });

    it('should handle checkins with null venue or band', async () => {
      const checkinWithNulls = {
        id: 'checkin-1',
        rating: 4,
        comment: null,
        photo_url: null,
        event_date: null,
        created_at: new Date('2024-03-16'),
        venue_name: null,
        venue_city: null,
        band_name: null,
        band_genre: null,
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockProfile] })
        .mockResolvedValueOnce({ rows: [checkinWithNulls] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await dataExportService.exportUserData(userId);

      expect(result.checkins).toHaveLength(1);
      expect(result.checkins[0].venueName).toBeNull();
      expect(result.checkins[0].bandName).toBeNull();
      expect(result.checkins[0].eventDate).toBeNull();
    });
  });
});
