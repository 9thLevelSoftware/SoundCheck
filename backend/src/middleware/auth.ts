import { Request, Response, NextFunction } from 'express';
import { AuthUtils } from '../utils/auth';
import { UserService } from '../services/UserService';
import { checkRateLimit, getRedis } from '../utils/redisRateLimiter';
import { ApiResponse, User } from '../types';
import logger from '../utils/logger';

export interface AuthenticatedRequest extends Request {
  user: User;
}

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = AuthUtils.extractTokenFromHeader(authHeader);

    if (!token) {
      const response: ApiResponse = {
        success: false,
        error: 'Access token required',
      };
      res.status(401).json(response);
      return;
    }

    const payload = AuthUtils.verifyToken(token);
    if (!payload) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid or expired token',
      };
      res.status(401).json(response);
      return;
    }

    // Verify user still exists and is active
    const userService = new UserService();
    const user = await userService.findById(payload.userId);

    if (!user || !user.isActive) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found or inactive',
      };
      res.status(401).json(response);
      return;
    }

    // Attach user info to request
    req.user = user;

    next();
  } catch (error) {
    logger.error('Authentication middleware error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    const response: ApiResponse = {
      success: false,
      error: 'Authentication failed',
    };
    res.status(500).json(response);
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = AuthUtils.extractTokenFromHeader(authHeader);

    if (token) {
      const payload = AuthUtils.verifyToken(token);
      if (payload) {
        const userService = new UserService();
        const user = await userService.findById(payload.userId);
        
        if (user && user.isActive) {
          req.user = user;
        }
      }
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    // Continue without authentication
    next();
  }
};

/**
 * Middleware to check if user owns a resource
 */
export const requireOwnership = (resourceUserIdField: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];

    if (!user) {
      const response: ApiResponse = {
        success: false,
        error: 'Authentication required',
      };
      res.status(401).json(response);
      return;
    }

    if (user.id !== resourceUserId) {
      const response: ApiResponse = {
        success: false,
        error: 'Access denied: You can only access your own resources',
      };
      res.status(403).json(response);
      return;
    }

    next();
  };
};

/**
 * Middleware to require admin privileges
 */
export const requireAdmin = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!user.isAdmin) {
      res.status(403).json({
        success: false,
        error: 'Admin privileges required',
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to require premium subscription
 */
export const requirePremium = () => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!user.isPremium) {
      res.status(403).json({
        success: false,
        error: 'SoundCheck Pro subscription required',
      });
      return;
    }

    next();
  };
};

/**
 * Rate limiting middleware
 *
 * Uses Redis when available for distributed rate limiting across instances.
 * Falls back to in-memory when Redis is unavailable.
 */
const inMemoryRateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * In-memory rate limit check (fallback when Redis unavailable)
 */
function checkInMemoryRateLimit(
  clientIP: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const clientData = inMemoryRateLimitStore.get(clientIP);

  if (!clientData || now > clientData.resetTime) {
    inMemoryRateLimitStore.set(clientIP, {
      count: 1,
      resetTime: now + windowMs,
    });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (clientData.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  clientData.count++;
  return { allowed: true, remaining: maxRequests - clientData.count };
}

export const rateLimit = (windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const clientIP = req.ip || req.socket.remoteAddress || 'unknown';

    try {
      // Try Redis first
      if (getRedis()) {
        const key = `rate_limit:${clientIP}`;
        const result = await checkRateLimit(key, maxRequests, windowMs);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining).toString());
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000).toString());

        if (!result.allowed) {
          const response: ApiResponse = {
            success: false,
            error: 'Too many requests, please try again later',
          };
          res.status(429).json(response);
          return;
        }

        next();
        return;
      }

      // Fallback to in-memory when Redis unavailable
      const result = checkInMemoryRateLimit(clientIP, windowMs, maxRequests);

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
      logger.error('Rate limit error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      // Fail-closed: deny request when rate limiting is unavailable
      const response: ApiResponse = {
        success: false,
        error: 'Service temporarily unavailable, please try again later',
      };
      res.status(429).json(response);
    }
  };
};

/**
 * Clean up expired in-memory rate limit entries
 */
export const cleanupRateLimit = (): void => {
  const now = Date.now();
  for (const [key, data] of inMemoryRateLimitStore.entries()) {
    if (now > data.resetTime) {
      inMemoryRateLimitStore.delete(key);
    }
  }
};

// Clean up in-memory store every 5 minutes
setInterval(cleanupRateLimit, 5 * 60 * 1000).unref();
