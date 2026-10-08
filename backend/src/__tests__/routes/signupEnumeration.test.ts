import express from 'express';
import request from 'supertest';

const mockFindByUsername = jest.fn();
const mockFindByEmail = jest.fn();

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }),
  },
}));

jest.mock('../../utils/redisRateLimiter', () => ({
  getRedis: jest.fn(() => null),
  checkRateLimit: jest.fn(),
}));

jest.mock('../../services/UserService', () => ({
  UserService: jest.fn().mockImplementation(() => ({
    findByUsername: (...args: unknown[]) => mockFindByUsername(...args),
    findByEmail: (...args: unknown[]) => mockFindByEmail(...args),
    createUser: jest.fn(),
    findById: jest.fn(),
    getUserStats: jest.fn(),
    authenticateUser: jest.fn(),
    updateProfile: jest.fn(),
    deactivateAccount: jest.fn(),
  })),
}));

import userRoutes from '../../routes/userRoutes';
import { SIGNUP_ACKNOWLEDGEMENT_MESSAGE } from '../../controllers/UserController';

describe('signup enumeration', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);

  beforeEach(() => {
    mockFindByUsername.mockReset();
    mockFindByEmail.mockReset();
    mockFindByUsername.mockResolvedValue(null);
  });

  it('keeps username availability and caps it at 5 per 15 minutes', async () => {
    mockFindByUsername.mockResolvedValueOnce({ id: 'taken' });

    const taken = await request(app).get('/api/users/check-username/alice');
    expect(taken.status).toBe(200);
    expect(taken.body).toEqual({
      success: true,
      data: { username: 'alice', available: false },
    });
    expect(taken.headers['x-ratelimit-limit']).toBe('5');
    expect(mockFindByEmail).not.toHaveBeenCalled();

    for (let i = 0; i < 4; i += 1) {
      const allowed = await request(app).get('/api/users/check-username/bob');
      expect(allowed.status).toBe(200);
      expect(allowed.body.data.available).toBe(true);
    }

    const blocked = await request(app).get('/api/users/check-username/carol');
    expect(blocked.status).toBe(429);
    expect(mockFindByUsername).toHaveBeenCalledTimes(5);
  }, 15000);

  it('returns the same non-revealing body for every email check', async () => {
    mockFindByEmail.mockResolvedValue({ id: 'existing' });

    const first = await request(app)
      .get('/api/users/check-email')
      .query({ email: 'new@example.com' });
    const second = await request(app)
      .get('/api/users/check-email')
      .query({ email: 'taken@example.com' });

    const acknowledgement = {
      success: true,
      message: SIGNUP_ACKNOWLEDGEMENT_MESSAGE,
    };
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body).toEqual(acknowledgement);
    expect(second.body).toEqual(acknowledgement);
    expect(first.body).not.toHaveProperty('data');
    expect(mockFindByEmail).not.toHaveBeenCalled();
    expect(mockFindByUsername).not.toHaveBeenCalled();
  });
});
