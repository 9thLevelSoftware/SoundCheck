import { describe, expect, it, jest, beforeEach } from '@jest/globals';
jest.mock('../../utils/redisRateLimiter', () => ({
  getRedis: jest.fn(() => null),
  checkRateLimit: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { rateLimit } from '../../middleware/auth';
import { checkRateLimit, getRedis } from '../../utils/redisRateLimiter';

describe('rateLimit security behavior', () => {
  let json: jest.Mock;
  let setHeader: jest.Mock;
  let status: jest.Mock;
  let req: any;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (getRedis as jest.Mock).mockReturnValue(null);
    json = jest.fn();
    setHeader = jest.fn().mockReturnThis();
    status = jest.fn().mockReturnValue({ setHeader, json });
    req = {
      ip: '203.0.113.10',
      path: '/refresh',
      originalUrl: '/api/tokens/refresh',
      socket: { remoteAddress: '203.0.113.10' } as any,
    };
    res = { status, setHeader, json };
    next = jest.fn();
  });

  it('uses the in-memory fallback for sensitive paths when Redis is unavailable', async () => {
    const limiter = rateLimit(15 * 60 * 1000, 1);
    await limiter(req, res, next);
    await limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Too many requests, please try again later',
      })
    );
  });

  it('does not let one limiter consume another limiter quota for the same IP', async () => {
    req.ip = '203.0.113.40';
    req.socket.remoteAddress = '203.0.113.40';
    req.path = '/venues';
    req.originalUrl = '/api/venues';

    const catalogLimiter = rateLimit(15 * 60 * 1000, 1);
    const loginLimiter = rateLimit(15 * 60 * 1000, 1);

    await catalogLimiter(req, res, next);
    req.path = '/login';
    req.originalUrl = '/api/users/login';
    await loginLimiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(status).not.toHaveBeenCalled();
  });

  it('stores Redis counters in separate keys per limiter instance', async () => {
    req.ip = '203.0.113.50';
    req.socket.remoteAddress = '203.0.113.50';
    (getRedis as jest.Mock).mockReturnValue({});
    (checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      remaining: 99,
      resetAt: Date.now() + 60_000,
    } as never);

    const catalogLimiter = rateLimit(15 * 60 * 1000, 100);
    const loginLimiter = rateLimit(15 * 60 * 1000, 5);
    await catalogLimiter(req, res, next);
    await loginLimiter(req, res, next);

    const keys = (checkRateLimit as jest.Mock).mock.calls.map((call) => call[0]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).toMatch(/^rate_limit:.+:203\.0\.113\.50$/);
    expect(keys[1]).toMatch(/^rate_limit:.+:203\.0\.113\.50$/);
    expect((checkRateLimit as jest.Mock).mock.calls[0][1]).toBe(100);
    expect((checkRateLimit as jest.Mock).mock.calls[1][1]).toBe(5);

    await catalogLimiter(req, res, next);
    const repeatedKey = (checkRateLimit as jest.Mock).mock.calls[2][0];
    expect(repeatedKey).toBe(keys[0]);
  });

  it('allows non-critical paths to use the in-memory fallback', async () => {
    req.ip = '203.0.113.20';
    req.socket.remoteAddress = '203.0.113.20';
    req.path = '/bands';
    req.originalUrl = '/api/bands';

    await rateLimit(15 * 60 * 1000, 10)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('falls back instead of blocking when Redis check throws for a sensitive path', async () => {
    req.ip = '203.0.113.30';
    req.socket.remoteAddress = '203.0.113.30';
    (getRedis as jest.Mock).mockReturnValue({});
    (checkRateLimit as jest.Mock).mockRejectedValue(new Error('Redis command timed out') as never);

    await rateLimit(15 * 60 * 1000, 10)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
    expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
  });
});
