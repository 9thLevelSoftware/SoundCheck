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

import { scopedRateLimit } from '../../middleware/auth';
import { checkRateLimit, getRedis } from '../../utils/redisRateLimiter';

describe('scopedRateLimit', () => {
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
      ip: '203.0.113.40',
      path: '/upcoming',
      originalUrl: '/api/events/upcoming',
      socket: { remoteAddress: '203.0.113.40' } as any,
    };
    res = { status, setHeader, json };
    next = jest.fn();
  });

  it('trips a per-bucket ceiling without sharing the unscoped IP counter', async () => {
    const events = scopedRateLimit('events-public', 15 * 60 * 1000, 1);
    const reports = scopedRateLimit('reports', 15 * 60 * 1000, 1);

    await events(req, res, next);
    await events(req, res, next);
    await reports(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(429);
  });

  it('stores the Redis key under the named bucket', async () => {
    (getRedis as jest.Mock).mockReturnValue({});
    (checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: Date.now() + 1000,
    } as never);

    await scopedRateLimit('wrapped-public', 15 * 60 * 1000, 10)(req, res, next);

    expect(checkRateLimit).toHaveBeenCalledWith(
      'rate_limit:wrapped-public:203.0.113.40',
      10,
      15 * 60 * 1000
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
