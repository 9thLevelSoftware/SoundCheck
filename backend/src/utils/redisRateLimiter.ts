/**
 * Redis-based rate limiting for production use
 *
 * This replaces the in-memory rate limiting with a distributed solution
 * that works across multiple server instances.
 *
 * Uses sliding window algorithm with Redis sorted sets for accurate
 * rate limiting across distributed systems.
 */

import Redis from 'ioredis';
import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';

let redis: Redis | null = null;

/**
 * Initialize Redis connection
 * Returns null if REDIS_URL is not configured (graceful fallback)
 */
export function initRedis(): Redis | null {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.log('REDIS_URL not configured, using in-memory rate limiting');
    return null;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      lazyConnect: false,
    });

    redis.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });

    redis.on('connect', () => {
      console.log('Redis connected');
    });

    redis.on('ready', () => {
      console.log('Redis ready');
    });

    redis.on('close', () => {
      console.log('Redis connection closed');
    });

    return redis;
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    return null;
  }
}

/**
 * Get the current Redis instance
 */
export function getRedis(): Redis | null {
  return redis;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit using Redis sliding window algorithm
 * Falls back to allowing requests if Redis is not available
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (!redis) {
    // Fallback to allowing (in-memory handled by existing middleware)
    return { allowed: true, remaining: maxRequests, resetAt: Date.now() + windowMs };
  }

  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // Use Redis sorted set for sliding window rate limiting
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.pexpire(key, windowMs);

    const results = await pipeline.exec();
    if (!results) {
      return { allowed: true, remaining: maxRequests, resetAt: now + windowMs };
    }

    // Results format: [[error, result], [error, result], ...]
    const currentCount = (results[1][1] as number) || 0;

    if (currentCount >= maxRequests) {
      return { allowed: false, remaining: 0, resetAt: now + windowMs };
    }

    return {
      allowed: true,
      remaining: maxRequests - currentCount - 1,
      resetAt: now + windowMs,
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // On error, allow the request through (fail-open)
    return { allowed: true, remaining: maxRequests, resetAt: now + windowMs };
  }
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
      redis = null;
      console.log('Redis connection closed gracefully');
    } catch (error) {
      console.error('Error closing Redis connection:', error);
      redis = null;
    }
  }
}

/**
 * Redis-based rate limiter class for Express middleware
 */
export class RedisRateLimiter {
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Express middleware for rate limiting
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
      const key = `rate_limit:${clientIP}`;

      try {
        const result = await checkRateLimit(key, this.maxRequests, this.windowMs);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', this.maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

        if (!result.allowed) {
          const response: ApiResponse = {
            success: false,
            error: 'Too many requests, please try again later',
          };
          res.status(429).json(response);
          return;
        }

        next();
      } catch (error) {
        console.error('Rate limiting error:', error);
        // On error, allow the request through (fail-open)
        next();
      }
    };
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await closeRedis();
  }

  /**
   * Get current request count for an IP
   */
  async getRequestCount(ip: string): Promise<number> {
    const key = `rate_limit:${ip}`;

    if (!redis) {
      return 0;
    }

    try {
      const now = Date.now();
      const windowStart = now - this.windowMs;

      await redis.zremrangebyscore(key, 0, windowStart);
      return await redis.zcard(key);
    } catch (error) {
      console.error('Error getting request count:', error);
      return 0;
    }
  }

  /**
   * Reset rate limit for a specific IP
   */
  async reset(ip: string): Promise<void> {
    const key = `rate_limit:${ip}`;

    if (redis) {
      try {
        await redis.del(key);
      } catch (error) {
        console.error('Error resetting rate limit:', error);
      }
    }
  }
}

// Export singleton instance
export const rateLimiter = new RedisRateLimiter();
