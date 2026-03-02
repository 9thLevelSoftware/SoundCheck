import { Request, Response, NextFunction } from 'express';
import { User } from '../types';
export interface AuthenticatedRequest extends Request {
    user: User;
}
/**
 * Middleware to authenticate JWT tokens
 */
export declare const authenticateToken: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
export declare const optionalAuth: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Middleware to check if user owns a resource
 */
export declare const requireOwnership: (resourceUserIdField?: string) => (req: Request, res: Response, next: NextFunction) => void;
/**
 * Middleware to require admin privileges
 */
export declare const requireAdmin: () => (req: Request, res: Response, next: NextFunction) => void;
/**
 * Middleware to require premium subscription
 */
export declare const requirePremium: () => (req: Request, res: Response, next: NextFunction) => void;
export declare const rateLimit: (windowMs?: number, maxRequests?: number) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Clean up expired in-memory rate limit entries
 */
export declare const cleanupRateLimit: () => void;
//# sourceMappingURL=auth.d.ts.map