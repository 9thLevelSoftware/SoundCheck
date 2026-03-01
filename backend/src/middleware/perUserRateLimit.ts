import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types';
import logger from '../utils/logger';

/**
 * Per-user rate limiting middleware
 *
 * This provides more sophisticated rate limiting based on authenticated user IDs
 * instead of just IP addresses. Prevents a single user from making too many requests
 * even if they switch IPs or use multiple devices.
 *
 * FEATURES:
 * - Rate limit by authenticated user ID
 * - Different limits for different endpoints
 * - Graceful degradation (falls back to IP if not authenticated)
 * - In-memory storage (upgrade to Redis for production)
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

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class PerUserRateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.requests.entries()) {
      if (now > entry.resetAt) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.requests.delete(key);
    }

    if (keysToDelete.length > 0) {
      logger.debug(`Cleaned up ${keysToDelete.length} expired rate limit entries`);
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

  checkLimit(req: Request, config: RateLimitConfig): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  } {
    const key = this.getKey(req);
    const now = Date.now();

    let entry = this.requests.get(key);

    // Create new entry if doesn't exist or expired
    if (!entry || now > entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + config.windowMs,
      };
      this.requests.set(key, entry);
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    // Increment count
    entry.count++;

    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  reset(userId: string): void {
    const key = `user:${userId}`;
    this.requests.delete(key);
  }

  getStats(): { totalEntries: number } {
    return {
      totalEntries: this.requests.size,
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.requests.clear();
  }
}

// Singleton instance
const rateLimiter = new PerUserRateLimiter();

/**
 * Create rate limiting middleware
 */
export function createPerUserRateLimit(config: RateLimitConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = rateLimiter.checkLimit(req, config);

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
export function resetUserRateLimit(userId: string): void {
  rateLimiter.reset(userId);
}

/**
 * Get rate limiter stats
 */
export function getRateLimitStats(): { totalEntries: number } {
  return rateLimiter.getStats();
}

// Export singleton for testing
export { rateLimiter };
