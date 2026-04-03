import request from 'supertest';
import express from 'express';
import { UserController } from '../../controllers/UserController';
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

    // Add error handler middleware for tests
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const statusCode = err.statusCode || err.status || 500;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Request failed',
      });
    });

    // Add error handler middleware for tests
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const statusCode = err.statusCode || err.status || 500;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Request failed',
      });
    });
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

      const mockUser = {
        id: 'user-123',
        email: userData.email,
        username: userData.username,
        firstName: userData.firstName,
        lastName: userData.lastName,
        isVerified: false,
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockUserService.createUser.mockResolvedValue(mockUser as any);

      const response = await request(app).post('/register').send(userData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockUser);
      expect(response.body.message).toBe('User registered successfully');
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

    it('should return error for duplicate email', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        username: 'testuser',
        firstName: 'Test',
      };

      mockUserService.createUser.mockRejectedValue(new Error('Email already registered'));

      const response = await request(app).post('/register').send(userData);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Email already registered');
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
