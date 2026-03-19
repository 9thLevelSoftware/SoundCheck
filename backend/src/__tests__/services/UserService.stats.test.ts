import { UserService } from '../../services/UserService';
import Database from '../../config/database';

// Mock the database
jest.mock('../../config/database');

describe('UserService.getUserStats', () => {
  let userService: UserService;
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
    };
    (Database.getInstance as jest.Mock).mockReturnValue(mockDb);
    userService = new UserService();
    jest.clearAllMocks();
  });

  test('should return checkin count from checkins table, not reviews', async () => {
    const mockStatsResult = {
      rows: [{
        checkin_count: '5',
        review_count: '2',
        badge_count: '3',
        follower_count: '10',
        following_count: '7',
        unique_venues: '4',
        unique_bands: '6',
      }],
    };

    mockDb.query.mockResolvedValueOnce(mockStatsResult);

    const stats = await userService.getUserStats('user-123');

    // Verify the query includes checkins table for checkin count
    expect(mockDb.query).toHaveBeenCalledTimes(1);
    const sqlQuery = mockDb.query.mock.calls[0][0];

    // Check that the query uses checkins table for checkin_count
    expect(sqlQuery).toContain('FROM checkins WHERE user_id');
    expect(sqlQuery).toMatch(/SELECT COUNT\(\*\) FROM checkins WHERE user_id.*as checkin_count/s);

    // Review count is now hardcoded to 0 (reviews table dropped in migration 043)
    expect(sqlQuery).toContain('0 as review_count');

    // Verify returned values
    expect(stats.totalCheckins).toBe(5);
    expect(stats.badgesEarned).toBe(3);
    expect(stats.followersCount).toBe(10);
    expect(stats.followingCount).toBe(7);
    expect(stats.uniqueVenues).toBe(4);
    expect(stats.uniqueBands).toBe(6);
  });

  test('should query followers with following_id and following with follower_id', async () => {
    const mockStatsResult = {
      rows: [{
        checkin_count: '0',
        review_count: '0',
        badge_count: '0',
        follower_count: '15',
        following_count: '20',
        unique_venues: '0',
        unique_bands: '0',
      }],
    };

    mockDb.query.mockResolvedValueOnce(mockStatsResult);

    const stats = await userService.getUserStats('user-456');

    const sqlQuery = mockDb.query.mock.calls[0][0];

    // Followers are users who follow this user (following_id = userId)
    expect(sqlQuery).toMatch(/FROM user_followers WHERE following_id.*as follower_count/s);

    // Following are users this user follows (follower_id = userId)
    expect(sqlQuery).toMatch(/FROM user_followers WHERE follower_id.*as following_count/s);

    expect(stats.followersCount).toBe(15);
    expect(stats.followingCount).toBe(20);
  });

  test('should count unique venues and bands from checkins', async () => {
    const mockStatsResult = {
      rows: [{
        checkin_count: '10',
        review_count: '0',
        badge_count: '0',
        follower_count: '0',
        following_count: '0',
        unique_venues: '5',
        unique_bands: '8',
      }],
    };

    mockDb.query.mockResolvedValueOnce(mockStatsResult);

    const stats = await userService.getUserStats('user-789');

    const sqlQuery = mockDb.query.mock.calls[0][0];

    // Unique venues from checkins
    expect(sqlQuery).toMatch(/COUNT\(DISTINCT venue_id\) FROM checkins/s);

    // Unique bands from checkins
    expect(sqlQuery).toMatch(/COUNT\(DISTINCT band_id\) FROM checkins/s);

    expect(stats.uniqueVenues).toBe(5);
    expect(stats.uniqueBands).toBe(8);
  });

  test('should return zeros when no data exists', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const stats = await userService.getUserStats('new-user');

    expect(stats).toEqual({
      totalCheckins: 0,
      badgesEarned: 0,
      followersCount: 0,
      followingCount: 0,
      uniqueVenues: 0,
      uniqueBands: 0,
    });
  });

  test('should handle null values gracefully', async () => {
    const mockStatsResult = {
      rows: [{
        checkin_count: null,
        review_count: null,
        badge_count: null,
        follower_count: null,
        following_count: null,
        unique_venues: null,
        unique_bands: null,
      }],
    };

    mockDb.query.mockResolvedValueOnce(mockStatsResult);

    const stats = await userService.getUserStats('user-null');

    expect(stats).toEqual({
      totalCheckins: 0,
      badgesEarned: 0,
      followersCount: 0,
      followingCount: 0,
      uniqueVenues: 0,
      uniqueBands: 0,
    });
  });

  test('should pass userId parameter to query', async () => {
    const mockStatsResult = {
      rows: [{
        checkin_count: '1',
        review_count: '1',
        badge_count: '1',
        follower_count: '1',
        following_count: '1',
        unique_venues: '1',
        unique_bands: '1',
      }],
    };

    mockDb.query.mockResolvedValueOnce(mockStatsResult);

    await userService.getUserStats('specific-user-id');

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.any(String),
      ['specific-user-id']
    );
  });

  test('should handle database errors gracefully', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('Connection failed'));

    await expect(userService.getUserStats('user-123'))
      .rejects.toThrow('Failed to retrieve user statistics');
  });
});
