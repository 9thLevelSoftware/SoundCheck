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
    process.env.APPLE_BUNDLE_ID = 'com.test.pitpulse';

    socialAuthService = new SocialAuthService();
    mockGoogleClient = (socialAuthService as any).googleClient;
    jest.clearAllMocks();
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
    // Create a valid Apple JWT for testing
    const createAppleToken = (payload: object): string => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      return `${header}.${body}.fake-signature`;
    };

    it('should verify a valid Apple token and return profile', async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const validToken = createAppleToken({
        sub: 'apple-user-123',
        email: 'test@icloud.com',
        email_verified: 'true',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.pitpulse',
        exp: futureTime,
      });

      const result = await socialAuthService.verifyAppleToken(validToken, {
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
    });

    it('should return null for expired token', async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const expiredToken = createAppleToken({
        sub: 'apple-user-123',
        email: 'test@icloud.com',
        iss: 'https://appleid.apple.com',
        aud: 'com.test.pitpulse',
        exp: pastTime,
      });

      const result = await socialAuthService.verifyAppleToken(expiredToken);

      expect(result).toBeNull();
    });

    it('should return null for invalid issuer', async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      const invalidToken = createAppleToken({
        sub: 'apple-user-123',
        email: 'test@icloud.com',
        iss: 'https://fake-issuer.com',
        aud: 'com.test.pitpulse',
        exp: futureTime,
      });

      const result = await socialAuthService.verifyAppleToken(invalidToken);

      expect(result).toBeNull();
    });

    it('should return null for invalid token format', async () => {
      const result = await socialAuthService.verifyAppleToken('not-a-valid-jwt');

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

    it('should link social account to existing user with same email', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount - not found
        .mockResolvedValueOnce({ rows: [mockUser] }) // findUserByEmail - found
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

    it('should create new user when no existing account found', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount - not found
        .mockResolvedValueOnce({ rows: [] }) // findUserByEmail - not found
        .mockResolvedValueOnce({ rows: [] }) // usernameExists check - testuser available
        .mockResolvedValueOnce({ rows: [mockUser] }) // createSocialUser - INSERT
        .mockResolvedValueOnce({ rows: [] }); // linkSocialAccount

      const result = await socialAuthService.authenticateOrCreate(mockProfile);

      expect(result.isNewUser).toBe(true);
      expect(result.user.email).toBe(mockProfile.email);
    });

    it('should generate unique username when username already exists', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount
        .mockResolvedValueOnce({ rows: [] }) // findUserByEmail
        .mockResolvedValueOnce({ rows: [{ id: 'existing' }] }) // usernameExists - testuser taken
        .mockResolvedValueOnce({ rows: [] }) // usernameExists - testuser1 available
        .mockResolvedValueOnce({ rows: [mockUser] }) // createSocialUser
        .mockResolvedValueOnce({ rows: [] }); // linkSocialAccount

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

      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount
        .mockResolvedValueOnce({ rows: [] }) // findUserByEmail
        .mockResolvedValueOnce({ rows: [] }) // usernameExists
        .mockResolvedValueOnce({ rows: [userWithGeneratedUsername] }) // createSocialUser
        .mockResolvedValueOnce({ rows: [] }); // linkSocialAccount

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

      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount
        .mockResolvedValueOnce({ rows: [] }) // findUserByEmail
        .mockResolvedValueOnce({ rows: [] }) // usernameExists
        .mockResolvedValueOnce({ rows: [mockCreatedUser] }) // createSocialUser
        .mockResolvedValueOnce({ rows: [] }); // linkSocialAccount

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

      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findSocialAccount
        .mockResolvedValueOnce({ rows: [] }) // findUserByEmail
        .mockResolvedValueOnce({ rows: [] }) // usernameExists
        .mockResolvedValueOnce({ rows: [mockCreatedUser] }) // createSocialUser
        .mockResolvedValueOnce({ rows: [] }); // linkSocialAccount

      const result = await socialAuthService.authenticateOrCreate(longNameProfile);

      expect(result.isNewUser).toBe(true);
    });
  });
});
