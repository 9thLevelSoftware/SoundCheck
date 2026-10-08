import { UserService } from '../../services/UserService';
import Database from '../../config/database';
import { AuthUtils } from '../../utils/auth';
import { SIGNUP_MAIL_UNAVAILABLE_MESSAGE } from '../../services/EmailService';

const mockIsConfigured = jest.fn(() => true);
const mockSendWelcome = jest.fn().mockResolvedValue(undefined);
const mockSendExisting = jest.fn().mockResolvedValue(undefined);

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../services/EmailService', () => ({
  SIGNUP_MAIL_UNAVAILABLE_MESSAGE: "We couldn't send the confirmation email. Try again later.",
  EmailService: jest.fn().mockImplementation(() => ({
    isConfigured: mockIsConfigured,
    sendSignupWelcomeEmail: mockSendWelcome,
    sendSignupExistingAccountEmail: mockSendExisting,
  })),
}));
jest.mock('../../utils/auth', () => ({
  AuthUtils: {
    validateEmail: jest.fn(),
    validateUsername: jest.fn(),
    validatePassword: jest.fn(),
    hashPassword: jest.fn(),
    comparePassword: jest.fn(),
    generateToken: jest.fn(),
  },
  generateRefreshToken: jest.fn().mockResolvedValue('mock-refresh-token'),
}));

const mockDb = {
  query: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    jest.clearAllMocks();
    mockDb.query.mockReset();
    mockIsConfigured.mockReturnValue(true);
    mockSendWelcome.mockResolvedValue(undefined);
    mockSendExisting.mockResolvedValue(undefined);
  });

  describe('createUser', () => {
    it('should create a user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      };

      const mockHashedPassword = 'hashedPassword123';
      const mockUserResult = {
        id: 'user-123',
        email: userData.email,
        username: userData.username,
        first_name: userData.firstName,
        last_name: userData.lastName,
        bio: null,
        profile_image_url: null,
        location: null,
        date_of_birth: null,
        is_verified: false,
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (AuthUtils.validateEmail as jest.Mock).mockReturnValue(true);
      (AuthUtils.validateUsername as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
      (AuthUtils.validatePassword as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
      (AuthUtils.hashPassword as jest.Mock).mockResolvedValue(mockHashedPassword);
      (AuthUtils.generateToken as jest.Mock).mockReturnValue('mock-jwt-token');

      // Mock database calls for checking existing users
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // findByEmail - no existing user
        .mockResolvedValueOnce({ rows: [] }) // findByUsername - no existing user
        .mockResolvedValueOnce({ rows: [mockUserResult] }); // create user

      await expect(userService.createUser(userData)).resolves.toBeUndefined();
      expect(mockDb.query).toHaveBeenCalledTimes(3);
      expect(AuthUtils.generateToken).not.toHaveBeenCalled();
      expect(AuthUtils.hashPassword).toHaveBeenCalledWith(userData.password);
      expect(mockSendWelcome).toHaveBeenCalledWith(userData.email);
      expect(mockSendExisting).not.toHaveBeenCalled();
    });

    it('accepts an existing email without inserting and sends a reset link', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        username: 'testuser',
        firstName: 'Test',
      };

      (AuthUtils.hashPassword as jest.Mock).mockResolvedValue('hashedPassword123');
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(userService.createUser(userData)).resolves.toBeUndefined();
      const statements = mockDb.query.mock.calls.map((call) => String(call[0]));
      expect(statements.some((sql) => sql.includes('INSERT INTO users'))).toBe(false);
      expect(statements.some((sql) => sql.includes('INSERT INTO password_reset_tokens'))).toBe(
        true
      );
      expect(AuthUtils.hashPassword).toHaveBeenCalledWith(userData.password);
      expect(AuthUtils.generateToken).not.toHaveBeenCalled();
      expect(mockSendWelcome).not.toHaveBeenCalled();
      expect(mockSendExisting).toHaveBeenCalledWith(
        userData.email,
        expect.stringMatching(/^[a-f0-9]{64}$/)
      );
    });

    it('fails the same way for a new or existing email when mail is not configured', async () => {
      mockIsConfigured.mockReturnValue(false);
      const userData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        username: 'testuser',
      };

      await expect(userService.createUser(userData)).rejects.toMatchObject({
        statusCode: 503,
        message: SIGNUP_MAIL_UNAVAILABLE_MESSAGE,
      });
      await expect(
        userService.createUser({ ...userData, email: 'other@example.com' })
      ).rejects.toMatchObject({
        statusCode: 503,
        message: SIGNUP_MAIL_UNAVAILABLE_MESSAGE,
      });
      expect(mockDb.query).not.toHaveBeenCalled();
      expect(mockSendWelcome).not.toHaveBeenCalled();
      expect(mockSendExisting).not.toHaveBeenCalled();
    });

    it('rolls the new account back when the welcome email fails', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        username: 'testuser',
      };
      mockSendWelcome.mockRejectedValueOnce(new Error('provider down'));
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-123' }] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(userService.createUser(userData)).rejects.toMatchObject({
        statusCode: 503,
        message: SIGNUP_MAIL_UNAVAILABLE_MESSAGE,
      });
      const statements = mockDb.query.mock.calls.map((call) => String(call[0]));
      expect(statements.some((sql) => sql.includes('DELETE FROM users'))).toBe(true);
    });

    it('rejects a taken username when the email is new', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        username: 'testuser',
        firstName: 'Test',
      };

      (AuthUtils.hashPassword as jest.Mock).mockResolvedValue('hashedPassword123');
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] });

      await expect(userService.createUser(userData)).rejects.toMatchObject({
        statusCode: 409,
        message: 'Username already taken',
      });
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate user successfully', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'TestPass123!',
      };

      const mockUser = {
        id: 'user-123',
        email: loginData.email,
        password_hash: 'hashedPassword',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const mockToken = 'jwt-token-123';

      mockDb.query.mockResolvedValueOnce({ rows: [mockUser] });
      (AuthUtils.comparePassword as jest.Mock).mockResolvedValue(true);
      (AuthUtils.generateToken as jest.Mock).mockReturnValue(mockToken);

      const result = await userService.authenticateUser(loginData);

      expect(result).toEqual({
        user: expect.objectContaining({
          id: 'user-123',
          email: loginData.email,
          username: 'testuser',
        }),
        token: mockToken,
        refreshToken: 'mock-refresh-token',
      });

      // Verify isAdmin/isPremium are NOT exposed in auth responses (CFR-001)
      expect(result.user).not.toHaveProperty('isAdmin');
      expect(result.user).not.toHaveProperty('isPremium');
    });

    it('should throw error for invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [] }); // No user found

      await expect(userService.authenticateUser(loginData)).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid email or password',
      });
    });

    it('returns 401 when the password does not match', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            email: 'test@example.com',
            password_hash: 'hashedPassword',
            username: 'testuser',
            is_active: true,
          },
        ],
      });
      (AuthUtils.comparePassword as jest.Mock).mockResolvedValue(false);

      await expect(
        userService.authenticateUser({
          email: 'test@example.com',
          password: 'WrongPassword',
        })
      ).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid email or password',
      });
    });

    it('should throw error for inactive user', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'TestPass123!',
      };

      const mockUser = {
        id: 'user-123',
        email: loginData.email,
        password_hash: 'hashedPassword',
        is_active: false,
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockUser] });

      await expect(userService.authenticateUser(loginData)).rejects.toThrow(
        'Account is deactivated'
      );
    });
  });

  describe('updateProfile', () => {
    it('returns 400 when no writable profile fields are provided', async () => {
      await expect(userService.updateProfile('user-123', {})).rejects.toMatchObject({
        statusCode: 400,
        message: 'No valid fields to update',
      });
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find user by ID', async () => {
      const userId = 'user-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        bio: null,
        profile_image_url: null,
        location: null,
        date_of_birth: null,
        is_verified: false,
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await userService.findById(userId);

      expect(result).toEqual({
        id: userId,
        email: 'test@example.com',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        bio: undefined,
        profileImageUrl: undefined,
        location: undefined,
        dateOfBirth: undefined,
        isVerified: false,
        isActive: true,
        isAdmin: false,
        isPremium: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      });
    });

    it('should return null for non-existent user', async () => {
      const userId = 'non-existent';

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await userService.findById(userId);

      expect(result).toBeNull();
    });
  });
});
