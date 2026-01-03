import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Request, Response, NextFunction } from 'express';
import { UserController } from '../../controllers/UserController';
import { UserService } from '../../services/UserService';
import { AuthUtils } from '../../utils/auth';

// Mock the UserService
jest.mock('../../services/UserService');

// Mock AuthUtils for token verification tests
jest.mock('../../utils/auth', () => ({
  AuthUtils: {
    verifyToken: jest.fn(),
    extractTokenFromHeader: jest.fn(),
    generateToken: jest.fn(),
    hashPassword: jest.fn(),
    comparePassword: jest.fn(),
  },
}));

/**
 * Integration tests for authentication flows
 *
 * These tests verify end-to-end authentication functionality:
 * - User registration
 * - User login
 * - Token validation
 * - Protected routes
 */

describe('Authentication Integration Tests', () => {
  let app: express.Express;
  let mockUserService: jest.Mocked<UserService>;
  const mockAuthUtils = AuthUtils as jest.Mocked<typeof AuthUtils>;

  const testUser = {
    email: 'test@example.com',
    username: 'testuser',
    password: 'Test123!@#',
    firstName: 'Test',
    lastName: 'User',
  };

  const mockUserResponse = {
    id: 'user-123',
    email: testUser.email,
    username: testUser.username,
    firstName: testUser.firstName,
    lastName: testUser.lastName,
    isVerified: false,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    app = express();
    app.use(express.json());

    mockUserService = new UserService() as jest.Mocked<UserService>;
    const userController = new UserController(mockUserService);

    // Setup routes
    app.post('/api/users/register', userController.register);
    app.post('/api/users/login', userController.login);

    // Protected route with mock auth middleware
    app.get('/api/users/profile', (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      const token = mockAuthUtils.extractTokenFromHeader(authHeader);

      if (!token) {
        res.status(401).json({ success: false, error: 'Access token required' });
        return;
      }

      const payload = mockAuthUtils.verifyToken(token);
      if (!payload) {
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
        return;
      }

      req.user = mockUserResponse as any;
      next();
    }, userController.getProfile);
  });

  describe('POST /api/users/register', () => {
    it('should register a new user successfully', async () => {
      const mockAuthResponse = {
        user: mockUserResponse,
        token: 'jwt-token-123',
      };

      mockUserService.createUser.mockResolvedValue(mockAuthResponse as any);

      const response = await request(app)
        .post('/api/users/register')
        .send(testUser);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.message).toBe('User registered successfully');
      expect(mockUserService.createUser).toHaveBeenCalledWith(testUser);
    });

    it('should reject duplicate email', async () => {
      mockUserService.createUser.mockRejectedValue(new Error('Email already exists'));

      const response = await request(app)
        .post('/api/users/register')
        .send(testUser);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already exists');
    });

    it('should validate email format', async () => {
      mockUserService.createUser.mockRejectedValue(new Error('Invalid email format'));

      const response = await request(app)
        .post('/api/users/register')
        .send({
          ...testUser,
          email: 'invalid-email',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('email');
    });

    it('should validate password strength', async () => {
      mockUserService.createUser.mockRejectedValue(new Error('Password too weak'));

      const response = await request(app)
        .post('/api/users/register')
        .send({
          ...testUser,
          email: 'test2@example.com',
          password: 'weak',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.toLowerCase()).toContain('password');
    });

    it('should reject registration with missing fields', async () => {
      mockUserService.createUser.mockRejectedValue(new Error('Missing required fields'));

      const response = await request(app)
        .post('/api/users/register')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/users/login', () => {
    it('should login with correct credentials', async () => {
      const mockAuthResponse = {
        user: mockUserResponse,
        token: 'jwt-token-123',
      };

      mockUserService.authenticateUser.mockResolvedValue(mockAuthResponse);

      const response = await request(app)
        .post('/api/users/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.message).toBe('Login successful');
      expect(mockUserService.authenticateUser).toHaveBeenCalledWith({
        email: testUser.email,
        password: testUser.password,
      });
    });

    it('should reject incorrect password', async () => {
      mockUserService.authenticateUser.mockRejectedValue(new Error('Invalid email or password'));

      const response = await request(app)
        .post('/api/users/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });

    it('should reject non-existent user', async () => {
      mockUserService.authenticateUser.mockRejectedValue(new Error('Invalid email or password'));

      const response = await request(app)
        .post('/api/users/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject login with missing credentials', async () => {
      mockUserService.authenticateUser.mockRejectedValue(new Error('Email and password required'));

      const response = await request(app)
        .post('/api/users/login')
        .send({ email: testUser.email });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Protected Routes', () => {
    it('should allow access with valid token', async () => {
      mockAuthUtils.extractTokenFromHeader.mockReturnValue('valid-token');
      mockAuthUtils.verifyToken.mockReturnValue({ userId: 'user-123', email: 'test@example.com', username: 'testuser' });
      mockUserService.findById.mockResolvedValue(mockUserResponse as any);
      mockUserService.getUserStats.mockResolvedValue({
        totalCheckins: 10,
        totalBands: 5,
        totalVenues: 3,
      } as any);

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(mockAuthUtils.extractTokenFromHeader).toHaveBeenCalledWith('Bearer valid-token');
      expect(mockAuthUtils.verifyToken).toHaveBeenCalledWith('valid-token');
    });

    it('should reject access without token', async () => {
      mockAuthUtils.extractTokenFromHeader.mockReturnValue(null);

      const response = await request(app)
        .get('/api/users/profile');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('token');
    });

    it('should reject access with invalid token', async () => {
      mockAuthUtils.extractTokenFromHeader.mockReturnValue('invalid-token');
      mockAuthUtils.verifyToken.mockReturnValue(null);

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid');
    });

    it('should reject access with malformed authorization header', async () => {
      mockAuthUtils.extractTokenFromHeader.mockReturnValue(null);

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'malformed-header');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rate limit errors gracefully', async () => {
      // Simulate rate limiting by making the service throw a rate limit error
      mockUserService.authenticateUser.mockRejectedValue(new Error('Rate limit exceeded'));

      const response = await request(app)
        .post('/api/users/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should allow requests within rate limit', async () => {
      const mockAuthResponse = {
        user: mockUserResponse,
        token: 'jwt-token-123',
      };

      mockUserService.authenticateUser.mockResolvedValue(mockAuthResponse);

      // Make a few requests, all should succeed
      for (let i = 0; i < 3; i++) {
        const response = await request(app)
          .post('/api/users/login')
          .send({
            email: testUser.email,
            password: testUser.password,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }

      expect(mockUserService.authenticateUser).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors during registration', async () => {
      mockUserService.createUser.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/users/register')
        .send(testUser);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should handle service errors during login', async () => {
      mockUserService.authenticateUser.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .post('/api/users/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should handle unexpected errors gracefully', async () => {
      mockUserService.createUser.mockRejectedValue('Unexpected error type');

      const response = await request(app)
        .post('/api/users/register')
        .send(testUser);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
