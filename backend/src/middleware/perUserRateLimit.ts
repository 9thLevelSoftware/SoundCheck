import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';
import logger from '../utils/logger';
import { getRedis } from '../utils/redisRateLimiter';

/**
 * Per-user rate limiting middleware
 *
 * This provides more sophisticated rate limiting based on authenticated user IDs
 * instead of just IP addresses. Prevents a single user from making too many requests
 * even if they switch IPs or use multiple devices.
 *
 * FEATURES:
 * - Rate limit by authenticated user ID (using Redis for distributed state)
 * - Different limits for different endpoints
 * - Graceful degradation (falls back to IP if not authenticated or Redis unavailable)
 * - Redis-based shared state across multiple Railway instances
 *
 * SECURITY FIX (P1): Migrated from in-memory to Redis-based storage to share
 * state across all Railway instances, preventing rate limit bypass by switching
 * to a different server instance.
 *
 * USAGE:
 * import { createPerUserRateLimit } from './middleware/perUserRateLimit';
 *
 * // Apply to specific routes
 * router.post('/reviews', createPerUserRateLimit({ maxRequests: 10, windowMs: 60000 }), ...);
 *
 * // Apply globally
 * app.use(createPerUserRateLimit({ maxRequests: 100, windowMs: 900000 }));
 */

interface RateLimitConfig {
  maxRequests: number; // Maximum number of requests
  windowMs: number; // Time window in milliseconds
  message?: string; // Custom error message
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * In-memory fallback store (used only when Redis unavailable)
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class PerUserRateLimiter {
  private fallbackStore: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor() {
    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    );
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.fallbackStore.entries()) {
      if (now > entry.resetAt) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.fallbackStore.delete(key);
    }

    if (keysToDelete.length > 0) {
      logger.debug(`Cleaned up ${keysToDelete.length} expired fallback rate limit entries`);
    }
  }

  private getKey(req: Request): string {
    // Use user ID if authenticated
    const userId = req.user?.id;
    if (userId) {
      return `user:${userId}`;
    }

    // Fall back to IP address
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  /**
   * Check rate limit using Redis (primary) or in-memory fallback
   */
  async checkLimit(req: Request, config: RateLimitConfig): Promise<RateLimitResult> {
    const key = this.getKey(req);
    const now = Date.now();
    const redis = getRedis();

    // Try Redis first for distributed rate limiting
    if (redis) {
      try {
        const windowStart = Math.floor(now / config.windowMs);
        const redisKey = `ratelimit:user:${key}:${windowStart}`;

        const pipeline = redis.pipeline();
        pipeline.incr(redisKey);
        pipeline.pexpire(redisKey, config.windowMs);
        const results = await pipeline.exec();

        if (!results) {
          // Fall through to in-memory if Redis fails
          throw new Error('Redis pipeline returned no results');
        }

        const currentCount = (results[0][1] as number) || 0;

        return {
          allowed: currentCount <= config.maxRequests,
          remaining: Math.max(0, config.maxRequests - currentCount),
          resetAt: (windowStart + 1) * config.windowMs,
        };
      } catch (error) {
        logger.error('Redis per-user rate limit failed, falling back to in-memory', {
          error: error instanceof Error ? error.message : String(error),
          key,
        });
        // Fall through to in-memory fallback
      }
    }

    // In-memory fallback (when Redis unavailable)
    let entry = this.fallbackStore.get(key);

    // Create new entry if doesn't exist or expired
    if (!entry || now > entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + config.windowMs,
      };
      this.fallbackStore.set(key, entry);
    }

    // Increment count
    entry.count++;

    return {
      allowed: entry.count <= config.maxRequests,
      remaining: Math.max(0, config.maxRequests - entry.count),
      resetAt: entry.resetAt,
    };
  }

  /**
   * Reset rate limit for a user
   */
  async reset(userId: string): Promise<void> {
    const key = `user:${userId}`;
    const redis = getRedis();

    if (redis) {
      try {
        // Find and delete all Redis keys for this user
        const pattern = `ratelimit:user:${key}:*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch (error) {
        logger.error('Error resetting Redis rate limit', {
          error: error instanceof Error ? error.message : String(error),
          userId,
        });
      }
    }

    // Also clear in-memory
    this.fallbackStore.delete(key);
  }

  getStats(): { totalEntries: number; mode: 'redis' | 'memory' } {
    const redis = getRedis();
    return {
      totalEntries: this.fallbackStore.size,
      mode: redis ? 'redis' : 'memory',
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.fallbackStore.clear();
  }
}

// Singleton instance
const rateLimiter = new PerUserRateLimiter();

/**
 * Create rate limiting middleware
 */
export function createPerUserRateLimit(config: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const result = await rateLimiter.checkLimit(req, config);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', new Date(result.resetAt).toISOString());

    if (!result.allowed) {
      const response: ApiResponse = {
        success: false,
        error: config.message || 'Too many requests. Please try again later.',
      };

      res.status(429).json(response);
      return;
    }

    next();
  };
}

/**
 * Preset rate limit configurations
 */
export const RateLimitPresets = {
  // Strict limits for auth endpoints
  auth: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },

  // Medium limits for write operations
  write: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 1 minute
    message: 'Too many requests. Please slow down.',
  },

  // Generous limits for read operations
  read: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  },

  // Very strict for expensive operations
  expensive: {
    maxRequests: 3,
    windowMs: 60 * 1000, // 1 minute
    message: 'This operation is rate limited. Please try again in a minute.',
  },
};

/**
 * Reset rate limit for a user (e.g., after successful password reset)
 */
export async function resetUserRateLimit(userId: string): Promise<void> {
  await rateLimiter.reset(userId);
}

/**
 * Get rate limiter stats
 */
export function getRateLimitStats(): { totalEntries: number; mode: 'redis' | 'memory' } {
  return rateLimiter.getStats();
}

// Export singleton for testing
export { rateLimiter };
