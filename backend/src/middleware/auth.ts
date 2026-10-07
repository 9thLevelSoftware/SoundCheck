import { Request, Response, NextFunction } from 'express';
import { AuthUtils } from '../utils/auth';
import { UserService } from '../services/UserService';
import { checkRateLimit, getRedis } from '../utils/redisRateLimiter';
import { ApiResponse, User } from '../types';
import logger from '../utils/logger';
import { setUser as sentrySetUser } from '../utils/sentry';

export interface AuthenticatedRequest extends Request {
  user: User;
}

/**
 * Access tokens stay valid through the second a password changes, so a
 * same-second re-login is not rejected. Anything issued earlier is stale.
 * A missing issued-at on a token is rejected once a change timestamp exists.
 */
export function accessTokenPredatesCredentialChange(
  issuedAtSeconds: number | undefined,
  credentialsChangedAt?: string
): boolean {
  if (!credentialsChangedAt) {
    return false;
  }
  const changedMs = new Date(credentialsChangedAt).getTime();
  if (issuedAtSeconds == null || !Number.isFinite(issuedAtSeconds) || Number.isNaN(changedMs)) {
    return true;
  }
  return issuedAtSeconds < Math.floor(changedMs / 1000);
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

    if (accessTokenPredatesCredentialChange(payload.iat, user.credentialsChangedAt)) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid or expired token',
      };
      res.status(401).json(response);
      return;
    }

    // Attach user info to request
    req.user = user;
    // Enrich Sentry error context with authenticated user
    sentrySetUser({ id: user.id, username: user.username });

    next();
  } catch (error) {
    logger.error('Authentication middleware error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
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

        if (
          user &&
          user.isActive &&
          !accessTokenPredatesCredentialChange(payload.iat, user.credentialsChangedAt)
        ) {
          req.user = user;
          sentrySetUser({ id: user.id, username: user.username });
        }
      }
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Continue without authentication
    next();
  }
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
 * Falls back to bounded in-memory limits when Redis is unavailable so auth
 * endpoints fail degraded instead of taking the API offline.
 */
const inMemoryRateLimitStore = new Map<string, { count: number; resetTime: number }>();

// INF-018: Cap in-memory rate limit map to prevent unbounded memory growth.
// At 10,000 entries (~1KB each), the map uses ~10MB -- acceptable for the
// fallback case. If this limit is reached, expired entries are purged first.
const MAX_RATE_LIMIT_ENTRIES = 10_000;

// Sensitive endpoints worth surfacing when Redis-backed limits degrade.
const CRITICAL_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/revoke',
  '/auth/social/google',
  '/auth/social/apple',
  '/upload',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/revoke',
  '/api/auth/social/google',
  '/api/auth/social/apple',
  '/api/users/login',
  '/api/users/register',
  '/api/tokens/refresh',
  '/api/tokens/revoke',
  '/api/upload',
];

/**
 * Check if endpoint is sensitive.
 */
function isCriticalEndpoint(path: string): boolean {
  return CRITICAL_ENDPOINTS.some((endpoint) => path.startsWith(endpoint));
}

function requestPathForRateLimit(req: Request): string {
  const rawPath = req.originalUrl || req.path || '';
  return rawPath.split('?')[0] || req.path;
}

/**
 * In-memory rate limit check (fallback when Redis unavailable)
 */
function checkInMemoryRateLimit(
  clientIP: string,
  windowMs: number,
  maxRequests: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const clientData = inMemoryRateLimitStore.get(clientIP);

  if (!clientData || now > clientData.resetTime) {
    const resetTime = now + windowMs;
    // Enforce max size before adding new entries
    if (
      inMemoryRateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES &&
      !inMemoryRateLimitStore.has(clientIP)
    ) {
      // Purge expired entries first
      for (const [key, data] of inMemoryRateLimitStore.entries()) {
        if (now > data.resetTime) {
          inMemoryRateLimitStore.delete(key);
        }
      }
      // If still at capacity after purge, allow request without tracking
      // (fail-open for memory safety)
      if (inMemoryRateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
        return { allowed: true, remaining: maxRequests - 1, resetAt: resetTime };
      }
    }
    inMemoryRateLimitStore.set(clientIP, {
      count: 1,
      resetTime,
    });
    return { allowed: true, remaining: maxRequests - 1, resetAt: resetTime };
  }

  if (clientData.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: clientData.resetTime };
  }

  clientData.count++;
  return {
    allowed: true,
    remaining: maxRequests - clientData.count,
    resetAt: clientData.resetTime,
  };
}

function setRateLimitHeaders(
  res: Response,
  maxRequests: number,
  remaining: number,
  resetAt: number
): void {
  res.setHeader('X-RateLimit-Limit', maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000).toString());
}

function sendRateLimitExceeded(res: Response): void {
  const response: ApiResponse = {
    success: false,
    error: 'Too many requests, please try again later',
  };
  res.status(429).json(response);
}

let nextRateLimitBucket = 0;

export const rateLimit = (windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) => {
  // Each middleware instance keeps its own counter. A shared IP key let
  // high-volume catalog reads exhaust the login limiter.
  const bucket = `b${nextRateLimitBucket++}`;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
    const subject = `${bucket}:${clientIP}`;
    const requestPath = requestPathForRateLimit(req);
    const isCritical = isCriticalEndpoint(requestPath) || isCriticalEndpoint(req.path);

    try {
      // Try Redis first
      if (getRedis()) {
        const key = `rate_limit:${subject}`;
        const result = await checkRateLimit(key, maxRequests, windowMs);

        setRateLimitHeaders(res, maxRequests, result.remaining, result.resetAt);

        if (!result.allowed) {
          sendRateLimitExceeded(res);
          return;
        }

        next();
        return;
      }

      if (isCritical) {
        logger.warn('Redis rate limiting unavailable for sensitive endpoint, using fallback', {
          path: requestPath,
          clientIP,
        });
      }

      const result = checkInMemoryRateLimit(subject, windowMs, maxRequests);
      setRateLimitHeaders(res, maxRequests, result.remaining, result.resetAt);

      if (!result.allowed) {
        sendRateLimitExceeded(res);
        return;
      }

      next();
    } catch (error) {
      logger.error('Rate limit error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (isCritical) {
        logger.warn('Redis rate limiting failed for sensitive endpoint, using fallback', {
          path: requestPath,
          clientIP,
        });
      }

      const result = checkInMemoryRateLimit(subject, windowMs, maxRequests);
      setRateLimitHeaders(res, maxRequests, result.remaining, result.resetAt);
      if (!result.allowed) {
        sendRateLimitExceeded(res);
        return;
      }

      next();
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

/**
 * Timing attack prevention middleware
 * SEC-007/CFR-015: Add random jitter to enumeration endpoint responses
 * to prevent timing-based username/email enumeration attacks.
 *
 * Adds a random delay between 50-150ms to ensure both "available" and
 * "unavailable" responses take similar time.
 */
export const addJitter = (minMs: number = 50, maxMs: number = 150) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

    // Store original end function
    const originalEnd = res.end.bind(res);

    // Override end to add delay before sending response
    res.end = function (_chunk?: any, _encoding?: any, _cb?: any): Response {
      const args = arguments;

      setTimeout(() => {
        originalEnd.apply(res, args as any);
      }, delay);

      return res;
    } as any;

    // Also wrap json/send for cases where end isn't called directly
    const originalJson = res.json.bind(res);
    res.json = function (body: any): Response {
      setTimeout(() => {
        originalJson(body);
      }, delay);
      return res;
    };

    const originalSend = res.send.bind(res);
    res.send = function (body: any): Response {
      setTimeout(() => {
        originalSend(body);
      }, delay);
      return res;
    };

    next();
  };
};
