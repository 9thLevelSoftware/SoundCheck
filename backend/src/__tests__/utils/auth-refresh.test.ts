import crypto from 'crypto';

/**
 * Refresh Token System Tests
 *
 * Security Finding: CVSS 4.0 Low - No JWT refresh or revocation strategy
 * This implements a complete refresh token system with:
 * - Secure random token generation
 * - Token hashing (only hash stored in DB)
 * - Expiration (30 days)
 * - Revocation support
 * - Token rotation on refresh
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

// Import after mocking
import {
  generateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,
} from '../../utils/auth';

describe('Refresh Token System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateRefreshToken', () => {
    test('should generate a refresh token', async () => {
      const userId = 'user-123';

      // Mock successful insert
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const token = await generateRefreshToken(userId);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes hex = 64 chars
    });

    test('should store token hash in database, not raw token', async () => {
      const userId = 'user-123';

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const token = await generateRefreshToken(userId);

      // Verify the query was called with hashed token
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [query, params] = mockQuery.mock.calls[0];

      expect(query).toContain('INSERT INTO refresh_tokens');
      expect(params[0]).toBe(userId);

      // The stored hash should be SHA256 of the token
      const expectedHash = crypto.createHash('sha256').update(token).digest('hex');
      expect(params[1]).toBe(expectedHash);

      // Expiration should be set (30 days from now)
      const expiresAt = params[2] as Date;
      expect(expiresAt).toBeInstanceOf(Date);
      const expectedExpiry = new Date();
      expectedExpiry.setDate(expectedExpiry.getDate() + 30);
      // Allow 1 minute tolerance for test execution time
      expect(Math.abs(expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(60000);
    });

    test('should generate unique tokens for each call', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const token1 = await generateRefreshToken('user-1');
      const token2 = await generateRefreshToken('user-2');

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyRefreshToken', () => {
    test('should verify a valid refresh token', async () => {
      const userId = 'user-123';
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Mock successful query returning user
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: userId }],
        rowCount: 1,
      });

      const result = await verifyRefreshToken(token);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe(userId);

      // Verify the query checks hash, expiration, and revocation
      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain('token_hash = $1');
      expect(query).toContain('expires_at > NOW()');
      expect(query).toContain('revoked_at IS NULL');
      expect(params[0]).toBe(tokenHash);
    });

    test('should reject an expired refresh token', async () => {
      const token = crypto.randomBytes(32).toString('hex');

      // Mock query returning no rows (expired)
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const result = await verifyRefreshToken(token);

      expect(result.valid).toBe(false);
      expect(result.userId).toBeUndefined();
    });

    test('should reject a revoked refresh token', async () => {
      const token = crypto.randomBytes(32).toString('hex');

      // Mock query returning no rows (revoked)
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const result = await verifyRefreshToken(token);

      expect(result.valid).toBe(false);
      expect(result.userId).toBeUndefined();
    });

    test('should reject an invalid/unknown refresh token', async () => {
      const token = 'invalid-token-not-in-db';

      // Mock query returning no rows
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const result = await verifyRefreshToken(token);

      expect(result.valid).toBe(false);
      expect(result.userId).toBeUndefined();
    });
  });

  describe('revokeRefreshToken', () => {
    test('should revoke a refresh token', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await revokeRefreshToken(token);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [query, params] = mockQuery.mock.calls[0];

      expect(query).toContain('UPDATE refresh_tokens');
      expect(query).toContain('revoked_at = NOW()');
      expect(query).toContain('token_hash = $1');
      expect(params[0]).toBe(tokenHash);
    });

    test('should not throw if token does not exist', async () => {
      const token = 'non-existent-token';

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Should not throw
      await expect(revokeRefreshToken(token)).resolves.not.toThrow();
    });
  });

  describe('revokeAllUserTokens', () => {
    test('should revoke all tokens for a user', async () => {
      const userId = 'user-123';

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 5 });

      await revokeAllUserTokens(userId);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const [query, params] = mockQuery.mock.calls[0];

      expect(query).toContain('UPDATE refresh_tokens');
      expect(query).toContain('revoked_at = NOW()');
      expect(query).toContain('user_id = $1');
      expect(query).toContain('revoked_at IS NULL');
      expect(params[0]).toBe(userId);
    });

    test('should not throw if user has no tokens', async () => {
      const userId = 'user-no-tokens';

      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(revokeAllUserTokens(userId)).resolves.not.toThrow();
    });
  });

  describe('Token Rotation (Integration)', () => {
    test('should work together: generate, verify, revoke', async () => {
      const userId = 'user-123';

      // 1. Generate token
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const token = await generateRefreshToken(userId);

      // 2. Verify token (valid)
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: userId }],
        rowCount: 1,
      });
      const validResult = await verifyRefreshToken(token);
      expect(validResult.valid).toBe(true);
      expect(validResult.userId).toBe(userId);

      // 3. Revoke token
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      await revokeRefreshToken(token);

      // 4. Verify token again (should be invalid)
      mockQuery.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });
      const invalidResult = await verifyRefreshToken(token);
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('cleanupExpiredTokens', () => {
    test('should delete expired and old revoked tokens', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 15 });

      const deletedCount = await cleanupExpiredTokens();

      expect(deletedCount).toBe(15);
      expect(mockQuery).toHaveBeenCalledTimes(1);

      const [query] = mockQuery.mock.calls[0];
      expect(query).toContain('DELETE FROM refresh_tokens');
      expect(query).toContain('expires_at < NOW()');
      expect(query).toContain("revoked_at < NOW() - INTERVAL '7 days'");
    });

    test('should return 0 when no tokens to cleanup', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const deletedCount = await cleanupExpiredTokens();

      expect(deletedCount).toBe(0);
    });

    test('should handle null rowCount gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: null });

      const deletedCount = await cleanupExpiredTokens();

      expect(deletedCount).toBe(0);
    });
  });

  describe('Transaction Support', () => {
    test('generateRefreshToken should use provided client', async () => {
      const userId = 'user-123';
      const mockClient = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };

      await generateRefreshToken(userId, mockClient);

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      expect(mockQuery).not.toHaveBeenCalled(); // Default db should not be used
    });

    test('revokeRefreshToken should use provided client', async () => {
      const token = crypto.randomBytes(32).toString('hex');
      const mockClient = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };

      await revokeRefreshToken(token, mockClient);

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      expect(mockQuery).not.toHaveBeenCalled(); // Default db should not be used
    });
  });
});
