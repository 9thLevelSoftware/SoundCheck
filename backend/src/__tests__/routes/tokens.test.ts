import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

/**
 * Token Routes Integration Tests
 *
 * Tests for /api/tokens/refresh and /api/tokens/revoke endpoints.
 * These tests verify token rotation, revocation, and error handling.
 */

// Mock the database
const mockQuery = jest.fn();
const mockGetClient = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      query: mockQuery,
      getClient: mockGetClient,
    }),
  },
}));

// Mock rate limiter to avoid 429 responses during testing
jest.mock('../../middleware/auth', () => ({
  rateLimit: () => (req: any, res: any, next: any) => next(),
  authenticate: jest.fn((req, res, next) => next()),
}));

// Mock UserService
const mockFindById = jest.fn();
jest.mock('../../services/UserService', () => ({
  UserService: jest.fn().mockImplementation(() => ({
    findById: mockFindById,
  })),
}));

// Import after mocking
import tokenRoutes from '../../routes/tokenRoutes';

describe('Token Routes', () => {
  let app: express.Express;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isVerified: true,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/tokens', tokenRoutes);

    // Setup mock client for transactions
    mockGetClient.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
  });

  describe('POST /api/tokens/refresh', () => {
    const validToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(validToken).digest('hex');

    it('should refresh tokens successfully with valid refresh token', async () => {
      // Mock verifyRefreshToken - returns valid user
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: mockUser.id }],
        rowCount: 1,
      });

      // Mock findById - returns active user
      mockFindById.mockResolvedValueOnce(mockUser);

      // Mock transaction BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] });

      // Mock revokeRefreshToken in transaction
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Mock generateRefreshToken in transaction
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Mock transaction COMMIT
      mockClientQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/tokens/refresh')
        .send({ refreshToken: validToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.body.data.accessToken).toBeDefined();

      // Verify transaction was used
      expect(mockGetClient).toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should return 400 when refresh token is missing', async () => {
      const response = await request(app)
        .post('/api/tokens/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Refresh token required');
    });

    it('should return 400 when refresh token has invalid format', async () => {
      const response = await request(app)
        .post('/api/tokens/refresh')
        .send({ refreshToken: 12345 }); // Not a string

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid refresh token format');
    });

    it('should return 401 when refresh token is invalid or expired', async () => {
      // Mock verifyRefreshToken - returns no rows (invalid/expired)
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request(app)
        .post('/api/tokens/refresh')
        .send({ refreshToken: validToken });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid or expired refresh token');
    });

    it('should return 401 when user not found', async () => {
      // Mock verifyRefreshToken - returns valid
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: mockUser.id }],
        rowCount: 1,
      });

      // Mock findById - returns null (user not found)
      mockFindById.mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/tokens/refresh')
        .send({ refreshToken: validToken });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found or inactive');
    });

    it('should return 401 when user is inactive', async () => {
      // Mock verifyRefreshToken - returns valid
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: mockUser.id }],
        rowCount: 1,
      });

      // Mock findById - returns inactive user
      mockFindById.mockResolvedValueOnce({ ...mockUser, isActive: false });

      const response = await request(app)
        .post('/api/tokens/refresh')
        .send({ refreshToken: validToken });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found or inactive');
    });

    it('should rollback transaction on error and return 500', async () => {
      // Mock verifyRefreshToken - returns valid
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: mockUser.id }],
        rowCount: 1,
      });

      // Mock findById - returns active user
      mockFindById.mockResolvedValueOnce(mockUser);

      // Mock transaction BEGIN
      mockClientQuery.mockResolvedValueOnce({ rows: [] });

      // Mock revokeRefreshToken - fails
      mockClientQuery.mockRejectedValueOnce(new Error('Database error'));

      // Mock transaction ROLLBACK
      mockClientQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/tokens/refresh')
        .send({ refreshToken: validToken });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token refresh failed');

      // Verify rollback was called
      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should handle general errors gracefully', async () => {
      // Mock verifyRefreshToken - throws error
      mockQuery.mockRejectedValueOnce(new Error('Connection error'));

      const response = await request(app)
        .post('/api/tokens/refresh')
        .send({ refreshToken: validToken });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token refresh failed');
    });
  });

  describe('POST /api/tokens/revoke', () => {
    const validToken = crypto.randomBytes(32).toString('hex');

    it('should revoke token successfully', async () => {
      // Mock verifyRefreshToken (returns userId for audit logging)
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'test-user-id' }], rowCount: 1 });
      // Mock revokeRefreshToken
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Mock audit log (fire-and-forget)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const response = await request(app)
        .post('/api/tokens/revoke')
        .send({ refreshToken: validToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Token revoked');

      // Verify verifyRefreshToken and revokeRefreshToken queries were called
      // (audit log also makes a query, but we don't assert exact count for flexibility)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT user_id FROM refresh_tokens'),
        expect.any(Array)
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens'),
        expect.any(Array)
      );
    });

    it('should return success even when token does not exist (idempotent)', async () => {
      // Mock verifyRefreshToken - no rows found (invalid token)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Mock revokeRefreshToken - no rows affected
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await request(app)
        .post('/api/tokens/revoke')
        .send({ refreshToken: validToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Token revoked');
    });

    it('should return success when no token provided (idempotent)', async () => {
      const response = await request(app)
        .post('/api/tokens/revoke')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Token revoked');

      // No database call should be made
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should ignore non-string token values', async () => {
      const response = await request(app)
        .post('/api/tokens/revoke')
        .send({ refreshToken: 12345 }); // Not a string

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toBe('Token revoked');

      // No database call should be made for non-string token
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      // Mock revokeRefreshToken - throws error
      mockQuery.mockRejectedValueOnce(new Error('Database connection error'));

      const response = await request(app)
        .post('/api/tokens/revoke')
        .send({ refreshToken: validToken });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token revocation failed');
    });
  });

  describe('Token Rotation Security', () => {
    const validToken = crypto.randomBytes(32).toString('hex');

    it('should use database transaction for token rotation', async () => {
      // Reset mocks for this specific test
      mockClientQuery.mockReset();
      mockClientRelease.mockReset();
      mockGetClient.mockReset();

      // Setup mock client
      mockGetClient.mockResolvedValue({
        query: mockClientQuery,
        release: mockClientRelease,
      });

      // Mock verifyRefreshToken
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: mockUser.id }],
        rowCount: 1,
      });

      // Mock findById
      mockFindById.mockResolvedValueOnce(mockUser);

      // Mock transaction
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // revoke
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // generate
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const response = await request(app)
        .post('/api/tokens/refresh')
        .send({ refreshToken: validToken });

      expect(response.status).toBe(200);

      // Verify transaction was used
      expect(mockGetClient).toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockClientRelease).toHaveBeenCalled();
    });

    it('should ensure client is always released even on error', async () => {
      // Reset mocks for this specific test
      mockClientQuery.mockReset();
      mockClientRelease.mockReset();
      mockGetClient.mockReset();

      // Setup mock client
      mockGetClient.mockResolvedValue({
        query: mockClientQuery,
        release: mockClientRelease,
      });

      // Mock verifyRefreshToken
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: mockUser.id }],
        rowCount: 1,
      });

      // Mock findById
      mockFindById.mockResolvedValueOnce(mockUser);

      // Mock transaction with error
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB Error')) // revoke fails
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const response = await request(app)
        .post('/api/tokens/refresh')
        .send({ refreshToken: validToken });

      expect(response.status).toBe(500);

      // Client should always be released
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });
});
