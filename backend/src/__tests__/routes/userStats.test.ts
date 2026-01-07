import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';

/**
 * User Stats Route Integration Tests
 *
 * Tests for GET /api/users/:userId/stats endpoint.
 * Tests verify authentication, user validation, and stats retrieval.
 */

// Mock the database
const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      query: mockQuery,
    }),
  },
}));

// Mock JWT verification
const mockVerify = jest.fn();
jest.mock('jsonwebtoken', () => ({
  ...jest.requireActual('jsonwebtoken'),
  verify: (token: string, secret: string) => mockVerify(token, secret),
}));

// Mock rate limiter to avoid 429 responses during testing
jest.mock('../../middleware/auth', () => {
  const actual = jest.requireActual('../../middleware/auth');
  return {
    ...actual,
    rateLimit: () => (req: any, res: any, next: any) => next(),
    authenticateToken: (req: any, res: any, next: any) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
      }
      const token = authHeader.substring(7);
      if (token === 'valid-token') {
        req.user = { id: 'auth-user-123', email: 'auth@example.com', username: 'authuser' };
        return next();
      }
      return res.status(401).json({ success: false, error: 'Invalid token' });
    },
  };
});

// Import after mocking
import userRoutes from '../../routes/userRoutes';

describe('User Stats Routes', () => {
  let app: express.Express;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    first_name: 'Test',
    last_name: 'User',
    bio: null,
    profile_image_url: null,
    location: null,
    date_of_birth: null,
    is_verified: true,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const mockStats = {
    checkin_count: '5',
    review_count: '3',
    badge_count: '2',
    follower_count: '10',
    following_count: '15',
    unique_venues: '4',
    unique_bands: '6',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/users', userRoutes);

    mockVerify.mockReturnValue({ userId: 'auth-user-123', email: 'auth@example.com', username: 'authuser' });
  });

  describe('GET /api/users/:userId/stats', () => {
    it('should return 200 with user stats on success', async () => {
      // Mock findById - returns user
      mockQuery.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      });

      // Mock getUserStats
      mockQuery.mockResolvedValueOnce({
        rows: [mockStats],
        rowCount: 1,
      });

      const response = await request(app)
        .get('/api/users/user-123/stats')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        totalCheckins: 5,
        totalReviews: 3,
        badgesEarned: 2,
        followersCount: 10,
        followingCount: 15,
        uniqueVenues: 4,
        uniqueBands: 6,
      });
    });

    it('should return 404 for non-existent user', async () => {
      // Mock findById - returns no user
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request(app)
        .get('/api/users/non-existent-user/stats')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found');
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/users/user-123/stats');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied. No token provided.');
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .get('/api/users/user-123/stats')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should return 500 for server error', async () => {
      // Mock findById - throws error
      mockQuery.mockRejectedValueOnce(new Error('Database connection error'));

      const response = await request(app)
        .get('/api/users/user-123/stats')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get user stats');
    });

    it('should return 500 when stats query fails', async () => {
      // Mock findById - returns user
      mockQuery.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      });

      // Mock getUserStats - throws error
      mockQuery.mockRejectedValueOnce(new Error('Stats query failed'));

      const response = await request(app)
        .get('/api/users/user-123/stats')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to get user stats');
    });

    it('should handle empty stats gracefully', async () => {
      // Mock findById - returns user
      mockQuery.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      });

      // Mock getUserStats - returns empty stats
      mockQuery.mockResolvedValueOnce({
        rows: [{
          checkin_count: '0',
          review_count: '0',
          badge_count: '0',
          follower_count: '0',
          following_count: '0',
          unique_venues: '0',
          unique_bands: '0',
        }],
        rowCount: 1,
      });

      const response = await request(app)
        .get('/api/users/user-123/stats')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual({
        totalCheckins: 0,
        totalReviews: 0,
        badgesEarned: 0,
        followersCount: 0,
        followingCount: 0,
        uniqueVenues: 0,
        uniqueBands: 0,
      });
    });
  });
});
