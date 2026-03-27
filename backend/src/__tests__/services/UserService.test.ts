import { UserService } from '../../services/UserService';
import Database from '../../config/database';
import { AuthUtils } from '../../utils/auth';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../utils/auth');

const mockDb = {
  query: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    jest.clearAllMocks();
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

      const result = await userService.createUser(userData);

      expect(result).toEqual({
        user: {
          id: 'user-123',
          email: userData.email,
          username: userData.username,
          firstName: userData.firstName,
          lastName: userData.lastName,
          bio: undefined,
          profileImageUrl: undefined,
          location: undefined,
          dateOfBirth: undefined,
          isVerified: false,
          isActive: true,
          // isAdmin and isPremium are stripped by sanitizeUserForClient (CFR-001)
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        token: 'mock-jwt-token',
      });

      // Verify isAdmin/isPremium are NOT exposed in auth responses (CFR-001)
      expect(result.user).not.toHaveProperty('isAdmin');
      expect(result.user).not.toHaveProperty('isPremium');
    });

    it('should throw error for existing email', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        username: 'testuser',
        firstName: 'Test',
      };

      (AuthUtils.validateEmail as jest.Mock).mockReturnValue(true);
      (AuthUtils.validateUsername as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
      (AuthUtils.validatePassword as jest.Mock).mockReturnValue({ isValid: true, errors: [] });

      // Mock existing user found
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] });

      await expect(userService.createUser(userData)).rejects.toThrow('Email already registered');
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

      await expect(userService.authenticateUser(loginData)).rejects.toThrow(
        'Invalid email or password'
      );
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
