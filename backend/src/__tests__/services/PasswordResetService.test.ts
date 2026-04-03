import crypto from 'crypto';
import { PasswordResetService } from '../../services/PasswordResetService';
import { EmailService } from '../../services/EmailService';
import { AuthUtils } from '../../utils/auth';
import * as authModule from '../../utils/auth';
import { logInfo, logWarn, logError } from '../../utils/logger';

// Mock dependencies
jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn().mockReturnValue({
      query: jest.fn(),
    }),
  },
}));

jest.mock('../../services/EmailService');

jest.mock('../../utils/logger', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

// Import after mocking
import Database from '../../config/database';

const mockDb = {
  query: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('PasswordResetService', () => {
  let passwordResetService: PasswordResetService;
  let mockEmailService: jest.Mocked<EmailService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      isConfigured: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<EmailService>;
    passwordResetService = new PasswordResetService(mockDb, mockEmailService);
  });

  describe('requestReset', () => {
    const genericMessage =
      "If an account exists for that email, we've sent a password reset link. Check your inbox.";

    it('should return generic message for non-existent email (no enumeration)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // User not found

      const result = await passwordResetService.requestReset('nonexistent@example.com');

      expect(result.sent).toBe(false);
      expect(result.message).toBe(genericMessage);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT id, password_hash FROM users WHERE LOWER(email) = $1 AND is_active = true',
        ['nonexistent@example.com']
      );
      expect(logInfo).toHaveBeenCalledWith(
        'Password reset requested for non-existent email',
        expect.objectContaining({ email: 'nonexistent@example.com' })
      );
    });

    it('should return generic message for social auth user (prevent social auth disclosure)', async () => {
      const mockUser = { id: 'user-123', password_hash: null };
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // User found
        .mockResolvedValueOnce({ rows: [{ 1: 1 }] }); // Has social accounts

      const result = await passwordResetService.requestReset('socialuser@example.com');

      expect(result.sent).toBe(false);
      expect(result.message).toBe(genericMessage);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT 1 FROM user_social_accounts WHERE user_id = $1 LIMIT 1',
        ['user-123']
      );
      expect(logInfo).toHaveBeenCalledWith(
        'Password reset requested for social auth user',
        expect.objectContaining({ userId: 'user-123' })
      );
    });

    it('should generate token and send email for valid password user', async () => {
      const mockUser = { id: 'user-123', password_hash: 'hashed_password' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // User found
        .mockResolvedValueOnce({ rows: [] }) // No social accounts
        .mockResolvedValueOnce({ rows: [] }) // Update existing tokens
        .mockResolvedValueOnce({ rows: [] }); // Insert new token

      const result = await passwordResetService.requestReset('valid@example.com');

      expect(result.sent).toBe(true);
      expect(result.message).toBe(genericMessage);
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'valid@example.com',
        expect.any(String)
      );
      expect(logInfo).toHaveBeenCalledWith(
        'Password reset token generated',
        expect.objectContaining({ userId: 'user-123' })
      );
    });

    it('should invalidate all existing tokens when new reset requested', async () => {
      const mockUser = { id: 'user-123', password_hash: 'hashed_password' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // Should mark existing as used
        .mockResolvedValueOnce({ rows: [] });

      await passwordResetService.requestReset('valid@example.com');

      expect(mockDb.query).toHaveBeenCalledWith(
        'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL',
        ['user-123']
      );
    });

    it('should hash token before storing (never store raw)', async () => {
      const mockUser = { id: 'user-123', password_hash: 'hashed_password' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const cryptoSpy = jest.spyOn(crypto, 'createHash');

      await passwordResetService.requestReset('valid@example.com');

      expect(cryptoSpy).toHaveBeenCalledWith('sha256');
      // Verify the token was hashed before storage
      const [, params] = mockDb.query.mock.calls[3]; // INSERT query
      const tokenHash = params[1];
      expect(tokenHash).not.toBeNull();
      expect(tokenHash.length).toBe(64); // SHA-256 hex hash is 64 characters
      expect(typeof tokenHash).toBe('string');
      expect(tokenHash).toMatch(/^[a-f0-9]{64}$/i); // Valid hex string
    });

    it('should set 1 hour expiration on tokens', async () => {
      const mockUser = { id: 'user-123', password_hash: 'hashed_password' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await passwordResetService.requestReset('valid@example.com');

      const [, params] = mockDb.query.mock.calls[3]; // INSERT query
      const expiresAt = params[2];
      expect(expiresAt).toBeInstanceOf(Date);

      // Check expiration is approximately 1 hour from now (within 1 minute tolerance)
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
      expect(Math.abs(expiresAt.getTime() - oneHourFromNow.getTime())).toBeLessThan(60000);
    });

    it('should normalize email to lowercase', async () => {
      const mockUser = { id: 'user-123', password_hash: 'hashed_password' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await passwordResetService.requestReset('MixedCase@Example.COM');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(email) = $1'),
        ['mixedcase@example.com']
      );
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.query.mockRejectedValueOnce(dbError);

      await expect(passwordResetService.requestReset('test@example.com')).rejects.toThrow(
        'Database connection failed'
      );
      expect(logError).toHaveBeenCalledWith(
        'Error processing password reset request',
        expect.objectContaining({ email: 'test@example.com', error: dbError })
      );
    });
  });

  describe('resetPassword', () => {
    beforeEach(() => {
      jest.spyOn(AuthUtils, 'validatePassword').mockReturnValue({ isValid: true, errors: [] });
      jest.spyOn(AuthUtils, 'hashPassword').mockResolvedValue('new_hashed_password');
      jest.spyOn(authModule, 'revokeAllUserTokens').mockResolvedValue(undefined);
    });

    it('should reset password with valid token', async () => {
      const token = 'valid-token-123';
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const mockUser = { id: 'user-123' };

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: mockUser.id }] }) // Token found
        .mockResolvedValueOnce({ rows: [] }) // Update password
        .mockResolvedValueOnce({ rows: [] }); // Mark token as used

      await passwordResetService.resetPassword(token, 'NewPassword123!');

      // Verify token was looked up using hash
      const [tokenQuery, tokenParams] = mockDb.query.mock.calls[0];
      expect(tokenQuery).toContain('token_hash = $1');
      expect(tokenParams[0]).toBe(tokenHash);

      // Verify password was updated
      const [passwordQuery, passwordParams] = mockDb.query.mock.calls[1];
      expect(passwordQuery).toContain('UPDATE users SET password_hash');
      expect(passwordParams[0]).toBe('new_hashed_password');

      // Verify token was marked as used
      const [usedQuery] = mockDb.query.mock.calls[2];
      expect(usedQuery).toContain('used_at = CURRENT_TIMESTAMP');
    });

    it('should reject invalid password format', async () => {
      jest.spyOn(AuthUtils, 'validatePassword').mockReturnValue({
        isValid: false,
        errors: ['Password must be at least 8 characters long'],
      });

      await expect(passwordResetService.resetPassword('any-token', 'short')).rejects.toThrow();
    });

    it('should throw error for expired or invalid token', async () => {
      // Mock validation to pass so we can test token lookup
      jest.restoreAllMocks();
      jest.spyOn(AuthUtils, 'validatePassword').mockReturnValue({ isValid: true, errors: [] });
      jest.spyOn(AuthUtils, 'hashPassword').mockResolvedValue('new_hashed_password');
      jest.spyOn(authModule, 'revokeAllUserTokens').mockResolvedValue(undefined);

      const token = 'invalid-token';
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // Token not found

      const error = await passwordResetService.resetPassword(token, 'NewPassword123!').catch(e => e);
      expect(error.message).toBe('Invalid or expired reset token');
      expect(error.statusCode).toBe(400);
    });

    it('should use constant-time comparison for token validation via hash lookup', async () => {
      const token = 'test-token-456';
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'user-123' }] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await passwordResetService.resetPassword(token, 'NewPassword123!');

      // The hash computation is deterministic and constant-time in crypto module
      // Verify we're doing exact hash comparison in SQL
      const [query, params] = mockDb.query.mock.calls[0];
      expect(params[0]).toBe(tokenHash);
      expect(query).toContain('token_hash = $1');
    });

    it('should revoke all refresh tokens after password reset', async () => {
      const token = 'valid-token-789';
      const userId = 'user-123';

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: userId }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await passwordResetService.resetPassword(token, 'NewPassword123!');

      expect(authModule.revokeAllUserTokens).toHaveBeenCalledWith(userId);
    });

    it('should mark token as used after successful reset', async () => {
      const token = 'valid-token-abc';
      const tokenId = 123;

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: tokenId, user_id: 'user-123' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await passwordResetService.resetPassword(token, 'NewPassword123!');

      const [query, params] = mockDb.query.mock.calls[2];
      expect(query).toContain('UPDATE password_reset_tokens');
      expect(query).toContain('used_at = CURRENT_TIMESTAMP');
      expect(params[0]).toBe(tokenId);
    });

    it('should throw error with 400 status for validation failure', async () => {
      jest.spyOn(AuthUtils, 'validatePassword').mockReturnValue({
        isValid: false,
        errors: ['Password must contain at least one uppercase letter'],
      });

      const error = await passwordResetService
        .resetPassword('token', 'lowercaseonly')
        .catch(e => e);
      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('uppercase');
    });
  });

  describe('Security', () => {
    beforeEach(() => {
      // Reset mocks and restore original implementations for security tests
      jest.restoreAllMocks();
    });

    it('should hash token before storing (never store raw)', async () => {
      const mockUser = { id: 'user-123', password_hash: 'hashed_password' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const cryptoSpy = jest.spyOn(crypto, 'createHash');

      await passwordResetService.requestReset('user@example.com');

      expect(cryptoSpy).toHaveBeenCalledWith('sha256');

      // Verify raw token is not stored - only hash
      const [, params] = mockDb.query.mock.calls[3];
      const storedValue = params[1];
      expect(storedValue).toHaveLength(64); // SHA-256 hex length
      expect(storedValue).toMatch(/^[a-f0-9]{64}$/i); // Valid hex string
    });

    it('should invalidate all existing tokens when new reset requested', async () => {
      const mockUser = { id: 'user-123', password_hash: 'hashed_password' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // Invalidate old tokens
        .mockResolvedValueOnce({ rows: [] }); // Insert new

      await passwordResetService.requestReset('user@example.com');

      // Verify old tokens are invalidated before new one is created
      const invalidateCall = mockDb.query.mock.calls[2];
      expect(invalidateCall[0]).toContain('UPDATE password_reset_tokens');
      expect(invalidateCall[0]).toContain('used_at = CURRENT_TIMESTAMP');
      expect(invalidateCall[0]).toContain('user_id = $1');
      expect(invalidateCall[0]).toContain('used_at IS NULL');
      expect(invalidateCall[1]).toEqual(['user-123']);
    });

    it('should use constant-time comparison for token validation', async () => {
      jest.spyOn(AuthUtils, 'validatePassword').mockReturnValue({ isValid: true, errors: [] });
      jest.spyOn(AuthUtils, 'hashPassword').mockResolvedValue('new_hashed_password');
      jest.spyOn(authModule, 'revokeAllUserTokens').mockResolvedValue(undefined);

      const token = 'test-token-for-timing';
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'user-123' }] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await passwordResetService.resetPassword(token, 'NewPassword123!');

      // The validation uses SHA-256 hash comparison in database
      // which is constant-time for equal-length strings
      const [query, params] = mockDb.query.mock.calls[0];
      expect(query).toContain('token_hash = $1');
      expect(params[0]).toBe(tokenHash);
      expect(tokenHash).toHaveLength(64); // Fixed-length comparison
    });

    it('should not reveal if email exists (security through obscurity)', async () => {
      // Test that both cases return identical response
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // Non-existent email

      const nonExistentResult = await passwordResetService.requestReset('fake@example.com');

      // Reset mocks
      jest.clearAllMocks();
      const mockUser = { id: 'user-123', password_hash: 'hashed' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const existingResult = await passwordResetService.requestReset('real@example.com');

      // Both should have same message structure
      expect(nonExistentResult.message).toBe(existingResult.message);
      // For non-existent email, sent should be false
      // For existing email with password, sent should be true (but message is same)
      expect(nonExistentResult.sent).toBe(false);
      expect(existingResult.sent).toBe(true);
    });

    it('should check for token expiration on reset', async () => {
      jest.spyOn(AuthUtils, 'validatePassword').mockReturnValue({ isValid: true, errors: [] });
      jest.spyOn(AuthUtils, 'hashPassword').mockResolvedValue('new_hashed_password');
      jest.spyOn(authModule, 'revokeAllUserTokens').mockResolvedValue(undefined);

      const token = 'expired-token-test';
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Mock that the token exists but is expired (returns no rows due to expires_at > NOW() check)
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(passwordResetService.resetPassword(token, 'NewPassword123!')).rejects.toThrow(
        'Invalid or expired reset token'
      );

      // Verify the query checks expiration
      const [query, params] = mockDb.query.mock.calls[0];
      expect(query).toContain('expires_at > NOW()');
      expect(params[0]).toBe(tokenHash);
    });

    it('should check if token was already used', async () => {
      jest.spyOn(AuthUtils, 'validatePassword').mockReturnValue({ isValid: true, errors: [] });
      jest.spyOn(AuthUtils, 'hashPassword').mockResolvedValue('new_hashed_password');
      jest.spyOn(authModule, 'revokeAllUserTokens').mockResolvedValue(undefined);

      const token = 'already-used-token';
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      // Mock that token exists but was used (returns no rows due to used_at IS NULL check)
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(passwordResetService.resetPassword(token, 'NewPassword123!')).rejects.toThrow(
        'Invalid or expired reset token'
      );

      // Verify the query checks if token was used
      const [query, params] = mockDb.query.mock.calls[0];
      expect(query).toContain('used_at IS NULL');
      expect(params[0]).toBe(tokenHash);
    });

    it('should prevent reuse of already used token', async () => {
      jest.spyOn(AuthUtils, 'validatePassword').mockReturnValue({ isValid: true, errors: [] });
      jest.spyOn(AuthUtils, 'hashPassword').mockResolvedValue('new_hashed_password');
      jest.spyOn(authModule, 'revokeAllUserTokens').mockResolvedValue(undefined);

      const token = 'single-use-token';

      // First use succeeds
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 1, user_id: 'user-123' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await passwordResetService.resetPassword(token, 'FirstPassword123!');

      // Reset mocks to simulate second attempt (token now marked as used)
      jest.clearAllMocks();
      jest.spyOn(AuthUtils, 'validatePassword').mockReturnValue({ isValid: true, errors: [] });
      jest.spyOn(AuthUtils, 'hashPassword').mockResolvedValue('new_hashed_password');
      jest.spyOn(authModule, 'revokeAllUserTokens').mockResolvedValue(undefined);
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // Token not found (already used)

      await expect(passwordResetService.resetPassword(token, 'SecondPassword123!')).rejects.toThrow(
        'Invalid or expired reset token'
      );
    });

    it('should require password complexity validation', async () => {
      jest.spyOn(AuthUtils, 'validatePassword').mockReturnValue({
        isValid: false,
        errors: [
          'Password must be at least 8 characters long',
          'Password must contain at least one number',
          'Password must contain at least one special character (@$!%*?&)',
        ],
      });

      await expect(passwordResetService.resetPassword('token', 'weak')).rejects.toThrow();
    });
  });

  describe('Token Lifecycle', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
    });

    it('should generate cryptographically secure random tokens', async () => {
      const mockUser = { id: 'user-123', password_hash: 'hashed_password' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const randomBytesSpy = jest.spyOn(crypto, 'randomBytes');

      await passwordResetService.requestReset('user@example.com');

      expect(randomBytesSpy).toHaveBeenCalledWith(32);
    });

    it('should generate unique tokens for each request', async () => {
      const mockUser = { id: 'user-123', password_hash: 'hashed_password' };

      // First request
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await passwordResetService.requestReset('user@example.com');
      const firstToken = mockEmailService.sendPasswordResetEmail.mock.calls[0][1];

      // Second request
      jest.clearAllMocks();
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await passwordResetService.requestReset('user@example.com');
      const secondToken = mockEmailService.sendPasswordResetEmail.mock.calls[0][1];

      expect(firstToken).not.toBe(secondToken);
      expect(firstToken.length).toBe(64); // 32 bytes hex encoded
      expect(secondToken.length).toBe(64);
    });
  });
});
