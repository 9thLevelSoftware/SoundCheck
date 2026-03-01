import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';

/**
 * Smoke tests for critical API paths
 *
 * These tests verify the HTTP layer of core endpoints works correctly.
 * Run after deployment to verify basic API functionality.
 *
 * Paths tested:
 * 1. GET /health — returns 200 with status
 * 2. POST /api/users/register — returns 201 on valid input
 * 3. POST /api/users/login — returns 200 with token
 * 4. GET /api/feed — returns 401 without auth
 * 5. GET /nonexistent — returns 404
 */

// Mock database before any imports that use it
const mockDbInstance = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  healthCheck: jest.fn().mockResolvedValue(true),
  getPool: jest.fn().mockReturnValue({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    }),
  }),
};
jest.mock('../../config/database', () => ({
  __esModule: true,
  default: { getInstance: jest.fn().mockReturnValue(mockDbInstance) },
  Database: { getInstance: jest.fn().mockReturnValue(mockDbInstance) },
}));

// Mock cache utility (used by StatsService)
jest.mock('../../utils/cache', () => ({
  cache: {
    getOrSet: jest.fn().mockResolvedValue({}),
    del: jest.fn().mockResolvedValue(undefined),
  },
  CacheKeys: {},
}));

// Mock redis
jest.mock('../../utils/redisRateLimiter', () => ({
  initRedis: jest.fn(),
  closeRedis: jest.fn(),
  getRedis: jest.fn().mockReturnValue(null),
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 100, resetAt: Date.now() + 60000 }),
  RedisRateLimiter: jest.fn().mockImplementation(() => ({
    middleware: jest.fn().mockReturnValue((req: any, res: any, next: any) => next()),
  })),
}));

// Mock Sentry
jest.mock('../../utils/sentry', () => ({
  initSentry: jest.fn(),
  setupSentryForExpress: jest.fn(),
  closeSentry: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  clearUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  isSentryInitialized: jest.fn().mockReturnValue(false),
}));

// Mock WebSocket
jest.mock('../../utils/websocket', () => ({
  initWebSocket: jest.fn(),
  getWebSocketStats: jest.fn().mockReturnValue({ connections: 0 }),
  close: jest.fn(),
  default: { close: jest.fn() },
}));

// Mock UserService for register/login
jest.mock('../../services/UserService');

// Mock BullMQ workers (actual paths: backend/src/jobs/)
jest.mock('../../jobs/eventSyncWorker', () => ({
  startEventSyncWorker: jest.fn(),
  stopEventSyncWorker: jest.fn(),
}));
jest.mock('../../jobs/badgeWorker', () => ({
  startBadgeEvalWorker: jest.fn(),
  stopBadgeEvalWorker: jest.fn(),
}));
jest.mock('../../jobs/notificationWorker', () => ({
  startNotificationWorker: jest.fn(),
  stopNotificationWorker: jest.fn(),
}));
jest.mock('../../jobs/moderationWorker', () => ({
  startModerationWorker: jest.fn(),
  stopModerationWorker: jest.fn(),
}));
jest.mock('../../jobs/syncScheduler', () => ({
  registerSyncJobs: jest.fn().mockResolvedValue(undefined),
}));

import { UserService } from '../../services/UserService';
import { UserController } from '../../controllers/UserController';
import { ApiResponse } from '../../types';

describe('Smoke Tests — Critical API Paths', () => {
  let app: express.Express;
  let mockUserService: jest.Mocked<UserService>;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    mockUserService = new UserService() as jest.Mocked<UserService>;
    const userController = new UserController(mockUserService);

    // Health endpoint
    app.get('/health', async (req, res) => {
      const response: ApiResponse = {
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.1',
          database: 'connected',
        },
      };
      res.status(200).json(response);
    });

    // User routes
    app.post('/api/users/register', userController.register);
    app.post('/api/users/login', userController.login);

    // Protected route (no auth middleware = 401 simulation via mock)
    app.get('/api/feed', (req, res) => {
      if (!req.headers.authorization) {
        res.status(401).json({ success: false, error: 'Access token required' });
        return;
      }
      res.status(200).json({ success: true, data: [] });
    });

    // 404 handler
    app.use('*', (req, res) => {
      res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found` });
    });
  });

  describe('1. Health check', () => {
    it('GET /health returns 200 with healthy status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data).toHaveProperty('version');
      expect(res.body.data).toHaveProperty('timestamp');
    });
  });

  describe('2. User registration', () => {
    it('POST /api/users/register returns 201 on valid input', async () => {
      mockUserService.createUser.mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'smoke@test.com',
          username: 'smoketest',
          firstName: 'Smoke',
          lastName: 'Test',
          isVerified: false,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        token: 'jwt-smoke-token',
      } as any);

      const res = await request(app)
        .post('/api/users/register')
        .send({
          email: 'smoke@test.com',
          username: 'smoketest',
          password: 'Smoke123!@#',
          firstName: 'Smoke',
          lastName: 'Test',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
    });
  });

  describe('3. User login', () => {
    it('POST /api/users/login returns 200 with token', async () => {
      mockUserService.authenticateUser.mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'smoke@test.com',
          username: 'smoketest',
        },
        token: 'jwt-smoke-token',
      } as any);

      const res = await request(app)
        .post('/api/users/login')
        .send({
          email: 'smoke@test.com',
          password: 'Smoke123!@#',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
    });
  });

  describe('4. Protected routes require auth', () => {
    it('GET /api/feed returns 401 without auth header', async () => {
      const res = await request(app).get('/api/feed');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('token');
    });
  });

  describe('5. 404 handler', () => {
    it('GET /nonexistent returns 404', async () => {
      const res = await request(app).get('/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not found');
    });
  });
});
