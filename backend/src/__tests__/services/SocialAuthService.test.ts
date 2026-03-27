import { SocialAuthService, SocialProfile } from '../../services/SocialAuthService';
import Database from '../../config/database';
import { AuthUtils } from '../../utils/auth';
import * as authModule from '../../utils/auth';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../utils/auth');
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}));
jest.mock('apple-signin-auth', () => ({
  verifyIdToken: jest.fn(),
}));

import appleSignin from 'apple-signin-auth';
const mockAppleVerify = appleSignin.verifyIdToken as jest.Mock;

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
};

const mockDb = {
  query: jest.fn(),
  getPool: jest.fn().mockReturnValue(mockPool),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('SocialAuthService', () => {
  let socialAuthService: SocialAuthService;
  let mockGoogleClient: any;

  beforeEach(() => {
    // Set up environment variables
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.APPLE_BUNDLE_ID = 'com.test.soundcheck';

    socialAuthService = new SocialAuthService();
    mockGoogleClient = (socialAuthService as any).googleClient;

    // Reset all mocks including mockClient
    jest.clearAllMocks();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockDb.query.mockReset();
    mockPool.connect.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.APPLE_BUNDLE_ID;
  });

  describe('verifyGoogleToken', () => {
    it('should verify a valid Google token and return profile', async () => {
      const mockPayload = {
        sub: 'google-user-123',
        email: 'test@gmail.com',
        email_verified: true,
        given_name: 'Test',
        family_name: 'User',
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const result = await socialAuthService.verifyGoogleToken('valid-id-token');

      expect(result).toEqual({
        provider: 'google',
        providerId: 'google-user-123',
        email: 'test@gmail.com',
        firstName: 'Test',
        lastName: 'User',
      });
    });

    it('should return null for unverified email', async () => {
      const mockPayload = {
        sub: 'google-user-123',
        email: 'test@gmail.com',
        email_verified: false,
      };

      mockGoogleClient.verifyIdToken.mockResolvedValue({
        getPayload: () => mockPayload,
      });

      const result = await socialAuthService.verifyGoogleToken('token-with-unverified-email');

      expect(result).toBeNull();
    });

    it('should return null for invalid token', async () => {
      mockGoogleClient.verifyIdToken.mockRejectedValue(new Error('Invalid token'));

      const result = await socialAuthService.verifyGoogleToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null if GOOGLE_CLIENT_ID is not set', async () => {
      delete process.env.GOOGLE_CLIENT_ID;

      const result = await socialAuthService.verifyGoogleToken('any-token');

      expect(result).toBeNull();
    });
  });

  describe('verifyAppleToken', () => {
    beforeEach(() => {
      mockAppleVerify.mockReset();
      process.env.APPLE_BUNDLE_ID = 'com.test.soundcheck';
    });

    it('should verify a valid Apple token and return profile', async () => {
      mockAppleVerify.mockResolvedValueOnce({
        sub: 'apple-user-123',
        email: 'test@icloud.com',
      });

      const result = await socialAuthService.verifyAppleToken('valid-apple-token', {
        givenName: 'Apple',
        familyName: 'User',
      });

      expect(result).toEqual({
        provider: 'apple',
        providerId: 'apple-user-123',
        email: 'test@icloud.com',
        firstName: 'Apple',
        lastName: 'User',
      });
      expect(mockAppleVerify).toHaveBeenCalledWith('valid-apple-token', {
        audience: 'com.test.soundcheck',
        ignoreExpiration: false,
      });
    });

    it('should return null for expired token', async () => {
      mockAppleVerify.mockRejectedValueOnce(new Error('Token expired'));

      const result = await socialAuthService.verifyAppleToken('expired-token');

      expect(result).toBeNull();
    });

    it('should return null for invalid issuer', async () => {
      mockAppleVerify.mockRejectedValueOnce(new Error('Invalid issuer'));

      const result = await socialAuthService.verifyAppleToken('invalid-issuer-token');

      expect(result).toBeNull();
    });

    it('should return null for invalid token format', async () => {
      mockAppleVerify.mockRejectedValueOnce(new Error('jwt malformed'));

      const result = await socialAuthService.verifyAppleToken('not-a-valid-jwt');

      expect(result).toBeNull();
    });

    it('should return null when APPLE_BUNDLE_ID is not set', async () => {
      delete process.env.APPLE_BUNDLE_ID;

      const result = await socialAuthService.verifyAppleToken('any-token');

      expect(result).toBeNull();
      expect(mockAppleVerify).not.toHaveBeenCalled();
    });

    it('should return null when token has no subject', async () => {
      mockAppleVerify.mockResolvedValueOnce({
        email: 'test@icloud.com',
        // no sub field
      });

      const result = await socialAuthService.verifyAppleToken('token-no-subject');

      expect(result).toBeNull();
    });
  });

  describe('authenticateOrCreate', () => {
    const mockProfile: SocialProfile = {
      provider: 'google',
      providerId: 'google-user-123',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
    };

    const mockUser = {
      id: 'user-uuid-123',
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

    beforeEach(() => {
      (AuthUtils.generateToken as jest.Mock).mockReturnValue('mock-jwt-token');
      jest.spyOn(authModule, 'generateRefreshToken').mockResolvedValue('mock-refresh-token');
    });

    it('should return existing user when social account is linked', async () => {
      // Social account exists
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ user_id: mockUser.id }] }) // findSocialAccount
        .mockResolvedValueOnce({ rows: [mockUser] }); // findUserById

      const result = await socialAuthService.authenticateOrCreate(mockProfile);

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe(mockUser.id);
      expect(result.token).toBe('mock-jwt-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
    });

    it('should link social account to existing user with same email when user has social auth', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount - not found
        .mockResolvedValueOnce({ rows: [mockUser] }) // findUserByEmail - found
        .mockResolvedValueOnce({ rows: [{ user_id: mockUser.id }] }) // userHasSocialAccounts - has social auth
        .mockResolvedValueOnce({ rows: [] }); // linkSocialAccount

      const result = await socialAuthService.authenticateOrCreate(mockProfile);

      expect(result.isNewUser).toBe(false);
      expect(result.user.email).toBe(mockProfile.email);
      // Verify link was created
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_social_accounts'),
        [mockUser.id, 'google', 'google-user-123']
      );
    });

    it('should reject auto-linking when existing user is password-only', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount - not found
        .mockResolvedValueOnce({ rows: [mockUser] }) // findUserByEmail - found
        .mockResolvedValueOnce({ rows: [] }); // userHasSocialAccounts - no social accounts (password-only)

      await expect(socialAuthService.authenticateOrCreate(mockProfile)).rejects.toThrow(
        'An account with this email already exists'
      );
    });

    it('should create new user when no existing account found', async () => {
      // Mock db.query for findSocialAccount and findUserByEmail
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount - not found
        .mockResolvedValueOnce({ rows: [] }); // findUserByEmail - not found

      // Mock client.query for transaction (createSocialUser)
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // usernameExistsWithClient - testuser available
        .mockResolvedValueOnce({ rows: [mockUser] }) // INSERT user
        .mockResolvedValueOnce({}) // INSERT social_account (linkSocialAccountWithClient)
        .mockResolvedValueOnce({}); // COMMIT

      const result = await socialAuthService.authenticateOrCreate(mockProfile);

      expect(result.isNewUser).toBe(true);
      expect(result.user.email).toBe(mockProfile.email);
    });

    it('should generate unique username when username already exists', async () => {
      // Mock db.query for findSocialAccount and findUserByEmail
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount
        .mockResolvedValueOnce({ rows: [] }); // findUserByEmail

      // Mock client.query for transaction (createSocialUser)
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'existing' }] }) // usernameExistsWithClient - testuser taken
        .mockResolvedValueOnce({ rows: [] }) // usernameExistsWithClient - testuser1 available
        .mockResolvedValueOnce({ rows: [mockUser] }) // INSERT user
        .mockResolvedValueOnce({}) // INSERT social_account (linkSocialAccountWithClient)
        .mockResolvedValueOnce({}); // COMMIT

      const result = await socialAuthService.authenticateOrCreate(mockProfile);

      expect(result.isNewUser).toBe(true);
    });

    it('should throw error for deactivated user', async () => {
      const deactivatedUser = { ...mockUser, is_active: false };

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ user_id: deactivatedUser.id }] }) // findSocialAccount
        .mockResolvedValueOnce({ rows: [deactivatedUser] }); // findUserById

      await expect(socialAuthService.authenticateOrCreate(mockProfile)).rejects.toThrow(
        'Account is deactivated'
      );
    });

    it('should throw error when email is missing for new social sign-in', async () => {
      const profileWithoutEmail: SocialProfile = {
        provider: 'apple',
        providerId: 'apple-user-123',
        email: '', // Empty email (Apple after first sign-in)
      };

      mockDb.query.mockResolvedValueOnce({ rows: [] }); // findSocialAccount - not found

      await expect(socialAuthService.authenticateOrCreate(profileWithoutEmail)).rejects.toThrow(
        'Email is required for new social sign-in'
      );
    });

    it('should use email prefix for username when name not provided', async () => {
      const profileWithoutName: SocialProfile = {
        provider: 'google',
        providerId: 'google-user-456',
        email: 'john.doe@example.com',
        // No firstName or lastName
      };

      const userWithGeneratedUsername = {
        ...mockUser,
        username: 'johndoe',
      };

      // Mock db.query for findSocialAccount and findUserByEmail
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount
        .mockResolvedValueOnce({ rows: [] }); // findUserByEmail

      // Mock client.query for transaction (createSocialUser)
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // usernameExistsWithClient
        .mockResolvedValueOnce({ rows: [userWithGeneratedUsername] }) // INSERT user
        .mockResolvedValueOnce({}) // INSERT social_account (linkSocialAccountWithClient)
        .mockResolvedValueOnce({}); // COMMIT

      const result = await socialAuthService.authenticateOrCreate(profileWithoutName);

      expect(result.isNewUser).toBe(true);
    });
  });

  describe('username generation', () => {
    it('should handle short names by appending "user"', async () => {
      const shortNameProfile: SocialProfile = {
        provider: 'google',
        providerId: 'google-short',
        email: 'ab@test.com', // Very short email prefix
        firstName: 'Jo', // Short name
      };

      const mockCreatedUser = {
        id: 'user-uuid-123',
        email: 'ab@test.com',
        username: 'jouser',
        first_name: 'Jo',
        last_name: null,
        bio: null,
        profile_image_url: null,
        location: null,
        date_of_birth: null,
        is_verified: true,
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (AuthUtils.generateToken as jest.Mock).mockReturnValue('mock-jwt-token');
      jest.spyOn(authModule, 'generateRefreshToken').mockResolvedValue('mock-refresh-token');

      // Mock db.query for findSocialAccount and findUserByEmail
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount
        .mockResolvedValueOnce({ rows: [] }); // findUserByEmail

      // Mock client.query for transaction (createSocialUser)
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // usernameExistsWithClient
        .mockResolvedValueOnce({ rows: [mockCreatedUser] }) // INSERT user
        .mockResolvedValueOnce({}) // INSERT social_account (linkSocialAccountWithClient)
        .mockResolvedValueOnce({}); // COMMIT

      const result = await socialAuthService.authenticateOrCreate(shortNameProfile);

      expect(result.isNewUser).toBe(true);
    });

    it('should handle long names by truncating', async () => {
      const longNameProfile: SocialProfile = {
        provider: 'google',
        providerId: 'google-long',
        email: 'test@example.com',
        firstName: 'VeryLongFirstNameThatExceedsLimit',
        lastName: 'AndVeryLongLastName',
      };

      const mockCreatedUser = {
        id: 'user-uuid-123',
        email: 'test@example.com',
        username: 'verylongfirstnamethatexcee',
        first_name: longNameProfile.firstName,
        last_name: longNameProfile.lastName,
        bio: null,
        profile_image_url: null,
        location: null,
        date_of_birth: null,
        is_verified: true,
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (AuthUtils.generateToken as jest.Mock).mockReturnValue('mock-jwt-token');
      jest.spyOn(authModule, 'generateRefreshToken').mockResolvedValue('mock-refresh-token');

      // Mock db.query for findSocialAccount and findUserByEmail
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount
        .mockResolvedValueOnce({ rows: [] }); // findUserByEmail

      // Mock client.query for transaction (createSocialUser)
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // usernameExistsWithClient
        .mockResolvedValueOnce({ rows: [mockCreatedUser] }) // INSERT user
        .mockResolvedValueOnce({}) // INSERT social_account (linkSocialAccountWithClient)
        .mockResolvedValueOnce({}); // COMMIT

      const result = await socialAuthService.authenticateOrCreate(longNameProfile);

      expect(result.isNewUser).toBe(true);
    });
  });
});
