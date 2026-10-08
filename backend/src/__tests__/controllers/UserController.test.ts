import request from 'supertest';
import express from 'express';
import { SIGNUP_ACKNOWLEDGEMENT_MESSAGE, UserController } from '../../controllers/UserController';
import { UserService } from '../../services/UserService';
import { validate } from '../../middleware/validate';
import { createUserSchema, loginUserSchema } from '../../utils/validationSchemas';

// Mock the UserService
jest.mock('../../services/UserService');

describe('UserController', () => {
  let app: express.Express;
  let mockUserService: jest.Mocked<UserService>;

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());

    mockUserService = new UserService() as jest.Mocked<UserService>;
    const userController = new UserController(mockUserService);
    app.post('/register', validate(createUserSchema), userController.register);
    app.post('/login', validate(loginUserSchema), userController.login);
    app.get('/me', userController.getProfile);
    app.get('/api/users/:username', userController.getUserByUsername);

    // Add error handler middleware for tests
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use(
      (err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
        const statusCode = err.statusCode || err.status || 500;
        res.status(statusCode).json({
          success: false,
          error: err.message || 'Request failed',
        });
      }
    );

    // Add error handler middleware for tests
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use(
      (err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
        const statusCode = err.statusCode || err.status || 500;
        res.status(statusCode).json({
          success: false,
          error: err.message || 'Request failed',
        });
      }
    );
  });

  describe('POST /register', () => {
    it('should register a user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      };

      mockUserService.createUser.mockResolvedValue(undefined);

      const response = await request(app).post('/register').send(userData);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        message: SIGNUP_ACKNOWLEDGEMENT_MESSAGE,
      });
      expect(mockUserService.createUser).toHaveBeenCalledWith(userData);
    });

    it('should return error for missing required fields', async () => {
      const userData = {
        email: 'test@example.com',
        // Missing password and username
      };

      const response = await request(app).post('/register').send(userData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('returns the same acknowledgement when the email is already registered', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        username: 'testuser',
        firstName: 'Test',
      };

      mockUserService.createUser.mockResolvedValue(undefined);

      const response = await request(app).post('/register').send(userData);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        message: SIGNUP_ACKNOWLEDGEMENT_MESSAGE,
      });
      expect(JSON.stringify(response.body)).not.toContain('already');
    });

    it('returns 409 when the username is already taken', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        username: 'testuser',
        firstName: 'Test',
      };
      const error = new Error('Username already taken') as Error & { statusCode: number };
      error.statusCode = 409;
      mockUserService.createUser.mockRejectedValue(error);

      const response = await request(app).post('/register').send(userData);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Username already taken');
    });
  });

  describe('POST /login', () => {
    it('should login user successfully', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'TestPass123!',
      };

      const mockAuthResponse = {
        user: {
          id: 'user-123',
          email: loginData.email,
          username: 'testuser',
          firstName: 'Test',
          lastName: 'User',
          isVerified: false,
          isActive: true,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        token: 'jwt-token-123',
        refreshToken: 'mock-refresh-token',
      };

      mockUserService.authenticateUser.mockResolvedValue(mockAuthResponse);

      const response = await request(app).post('/login').send(loginData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockAuthResponse);
      expect(response.body.message).toBe('Login successful');
      expect(mockUserService.authenticateUser).toHaveBeenCalledWith(loginData);
    });

    it('should return error for missing credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        // Missing password
      };

      const response = await request(app).post('/login').send(loginData);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('resolves a public profile by user id without exposing email', async () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      mockUserService.findById.mockResolvedValue({
        id: userId,
        email: 'private@example.com',
        username: 'alice',
        firstName: 'Alice',
        lastName: 'Listener',
        bio: 'Shows',
        profileImageUrl: null,
        location: 'Boston',
        isVerified: true,
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
      } as any);
      mockUserService.getUserStats.mockResolvedValue({
        totalCheckins: 3,
        badgesEarned: 1,
        followersCount: 2,
        followingCount: 4,
        uniqueVenues: 2,
        uniqueBands: 3,
      });

      const response = await request(app).get(`/api/users/${userId}`);

      expect(response.status).toBe(200);
      expect(mockUserService.findById).toHaveBeenCalledWith(userId);
      expect(mockUserService.findByUsername).not.toHaveBeenCalled();
      expect(response.body.data).toEqual(
        expect.objectContaining({
          id: userId,
          username: 'alice',
          stats: expect.objectContaining({ totalCheckins: 3 }),
        })
      );
      expect(response.body.data).not.toHaveProperty('email');
      expect(JSON.stringify(response.body)).not.toContain('private@example.com');
    });

    it('still resolves a public profile by username', async () => {
      mockUserService.findByUsername.mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'private@example.com',
        username: 'alice',
        isVerified: false,
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
      } as any);
      mockUserService.getUserStats.mockResolvedValue({
        totalCheckins: 0,
        badgesEarned: 0,
        followersCount: 0,
        followingCount: 0,
        uniqueVenues: 0,
        uniqueBands: 0,
      });

      const response = await request(app).get('/api/users/alice');

      expect(response.status).toBe(200);
      expect(mockUserService.findByUsername).toHaveBeenCalledWith('alice');
      expect(mockUserService.findById).not.toHaveBeenCalled();
      expect(response.body.data.username).toBe('alice');
      expect(response.body.data).not.toHaveProperty('email');
    });

    it('should return error for invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      mockUserService.authenticateUser.mockRejectedValue(new Error('Invalid email or password'));

      const response = await request(app).post('/login').send(loginData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Invalid email or password');
    });
  });
});
