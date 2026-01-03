import { Request, Response, NextFunction } from 'express';
import { AuthUtils } from '../utils/auth';
import { UserService } from '../services/UserService';
import { ApiResponse, User } from '../types';

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
    console.error('Authentication middleware error:', error);
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
    console.error('Optional auth middleware error:', error);
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
 * Rate limiting middleware (simple in-memory implementation)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export const rateLimit = (windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    
    const clientData = rateLimitStore.get(clientIP);
    
    if (!clientData || now > clientData.resetTime) {
      // Reset window
      rateLimitStore.set(clientIP, {
        count: 1,
        resetTime: now + windowMs,
      });
      next();
      return;
    }

    if (clientData.count >= maxRequests) {
      const response: ApiResponse = {
        success: false,
        error: 'Too many requests, please try again later',
      };
      res.status(429).json(response);
      return;
    }

    clientData.count++;
    next();
  };
};

/**
 * Clean up expired rate limit entries (should be called periodically)
 */
export const cleanupRateLimit = (): void => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(key);
    }
  }
};

// Clean up every 5 minutes
setInterval(cleanupRateLimit, 5 * 60 * 1000);
