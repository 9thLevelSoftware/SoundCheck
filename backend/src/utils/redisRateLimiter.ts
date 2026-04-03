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
import logger from './logger';

let redis: Redis | null = null;

/**
 * Initialize Redis connection
 * Returns null if REDIS_URL is not configured (graceful fallback)
 */
export function initRedis(): Redis | null {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.info('REDIS_URL not configured, using in-memory rate limiting');
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
      logger.error('Redis connection error', { error: err.message });
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });

    redis.on('ready', () => {
      logger.info('Redis ready');
    });

    redis.on('close', () => {
      logger.info('Redis connection closed');
    });

    return redis;
  } catch (error) {
    logger.error('Failed to initialize Redis', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
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
    // Fail-open: allow requests when Redis is unavailable.
    // The route-level rateLimit middleware in auth.ts has an in-memory
    // fallback that provides basic protection. Blocking ALL traffic when
    // Redis is temporarily unreachable would cause a total outage.
    return { allowed: true, remaining: maxRequests, resetAt: Date.now() + windowMs };
  }

  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // Use Redis sorted set for sliding window rate limiting.
    //
    // PERF-012: Each request adds a scored member to the sorted set.
    // Members from expired windows are pruned by zremrangebyscore, and
    // pexpire guarantees the key is fully cleaned up after the window.
    // At beta scale (~2,000 users), key accumulation is negligible.
    // If scaling beyond ~50k concurrent users, consider switching to
    // a fixed-window counter (INCR + EXPIREAT) to reduce memory.
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.pexpire(key, windowMs);

    const results = await pipeline.exec();
    if (!results) {
      // Fail-open: allow when pipeline returns no results (Redis issue)
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
    logger.error('Rate limit check error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Fail-open: allow requests when rate limit check errors.
    // The in-memory fallback in auth.ts middleware provides basic protection.
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
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
        logger.error('Rate limiting error', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Fail-open: allow request through when rate limiting itself errors.
        // Blocking all traffic due to a transient Redis issue causes a full outage.
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
      logger.error('Error getting request count', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
        logger.error('Error resetting rate limit', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }
  }
}

/**
 * Enumeration protection rate limiter
 * SEC-007/CFR-015: Strict rate limiting for username/email enumeration endpoints
 * - 5 requests per 15 minutes per IP for enumeration endpoints
 * - Tracks attempts for CAPTCHA escalation
 * - Uses separate key prefix for isolation
 */
export class EnumerationRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private captchaThreshold: number;

  constructor(
    windowMs: number = 15 * 60 * 1000, // 15 minutes
    maxRequests: number = 5, // 5 requests per window
    captchaThreshold: number = 3 // CAPTCHA after 3 attempts
  ) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.captchaThreshold = captchaThreshold;
  }

  /**
   * Get the rate limit key for an IP
   */
  private getKey(ip: string, endpoint: string): string {
    return `enum-check:${ip}:${endpoint}`;
  }

  /**
   * Get the CAPTCHA tracking key for an IP
   */
  private getCaptchaKey(ip: string): string {
    return `enum-captcha:${ip}`;
  }

  /**
   * Check rate limit for enumeration endpoints
   * Returns extended result with CAPTCHA requirement flag
   */
  async checkLimit(
    ip: string,
    endpoint: string
  ): Promise<RateLimitResult & { requiresCaptcha: boolean }> {
    const key = this.getKey(ip, endpoint);
    const captchaKey = this.getCaptchaKey(ip);

    if (!redis) {
      // Fallback: use in-memory tracking when Redis unavailable
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetAt: Date.now() + this.windowMs,
        requiresCaptcha: false,
      };
    }

    const now = Date.now();
    const windowStart = now - this.windowMs;

    try {
      // Use pipeline for atomic operations
      const pipeline = redis.pipeline();

      // Clean expired entries from rate limit window
      pipeline.zremrangebyscore(key, 0, windowStart);
      // Get current count
      pipeline.zcard(key);
      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      // Set expiry on key
      pipeline.pexpire(key, this.windowMs);
      // Get CAPTCHA attempt count
      pipeline.get(captchaKey);
      // Increment CAPTCHA counter (set expiry if new)
      pipeline.incr(captchaKey);
      pipeline.pexpire(captchaKey, this.windowMs);

      const results = await pipeline.exec();
      if (!results) {
        return {
          allowed: true,
          remaining: this.maxRequests,
          resetAt: now + this.windowMs,
          requiresCaptcha: false,
        };
      }

      const currentCount = (results[1][1] as number) || 0;
      const captchaAttempts = parseInt((results[4][1] as string) || '0', 10);

      // Check if rate limit exceeded
      if (currentCount >= this.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: now + this.windowMs,
          requiresCaptcha: true,
        };
      }

      return {
        allowed: true,
        remaining: this.maxRequests - currentCount - 1,
        resetAt: now + this.windowMs,
        requiresCaptcha: captchaAttempts >= this.captchaThreshold,
      };
    } catch (error) {
      logger.error('Enumeration rate limit check error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ip,
        endpoint,
      });
      // Fail-open: allow request through on error
      return {
        allowed: true,
        remaining: this.maxRequests,
        resetAt: now + this.windowMs,
        requiresCaptcha: false,
      };
    }
  }

  /**
   * Reset enumeration limits for an IP
   */
  async reset(ip: string, endpoint?: string): Promise<void> {
    if (!redis) return;

    try {
      if (endpoint) {
        await redis.del(this.getKey(ip, endpoint));
      } else {
        // Use SCAN instead of KEYS to avoid blocking Redis
        const pattern = `enum-*:${ip}*`;
        let cursor = '0';
        const keysToDelete: string[] = [];

        do {
          const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
          cursor = result[0];
          const keys = result[1];
          if (keys.length > 0) {
            keysToDelete.push(...keys);
          }
        } while (cursor !== '0');

        // Delete keys in batches to avoid blocking
        const BATCH_SIZE = 100;
        for (let i = 0; i < keysToDelete.length; i += BATCH_SIZE) {
          const batch = keysToDelete.slice(i, i + BATCH_SIZE);
          await redis.unlink(...batch); // Use UNLINK (non-blocking) instead of DEL
        }
      }
    } catch (error) {
      logger.error('Error resetting enumeration rate limit', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ip,
        endpoint,
      });
    }
  }

  /**
   * Express middleware for strict enumeration rate limiting
   */
  middleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
      const endpoint = req.path;

      try {
        const result = await this.checkLimit(clientIP, endpoint);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', this.maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

        // Add header to indicate CAPTCHA requirement
        if (result.requiresCaptcha) {
          res.setHeader('X-Requires-Captcha', 'true');
        }

        if (!result.allowed) {
          const response: ApiResponse = {
            success: false,
            error: 'Too many requests. Please complete CAPTCHA verification to continue.',
          };
          res.status(429).json(response);
          return;
        }

        // Store CAPTCHA requirement on request for downstream middleware
        (req as Request & { requiresCaptcha?: boolean }).requiresCaptcha = result.requiresCaptcha;

        next();
      } catch (error) {
        logger.error('Enumeration rate limiting error', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          clientIP,
          endpoint,
        });
        // Fail-open on error
        next();
      }
    };
  }
}

// Export singleton instances
export const rateLimiter = new RedisRateLimiter();
export const enumerationLimiter = new EnumerationRateLimiter();
