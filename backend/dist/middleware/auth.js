"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupRateLimit = exports.rateLimit = exports.requireAdmin = exports.requireOwnership = exports.optionalAuth = exports.authenticateToken = void 0;
const auth_1 = require("../utils/auth");
const UserService_1 = require("../services/UserService");
const redisRateLimiter_1 = require("../utils/redisRateLimiter");
/**
 * Middleware to authenticate JWT tokens
 */
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = auth_1.AuthUtils.extractTokenFromHeader(authHeader);
        if (!token) {
            const response = {
                success: false,
                error: 'Access token required',
            };
            res.status(401).json(response);
            return;
        }
        const payload = auth_1.AuthUtils.verifyToken(token);
        if (!payload) {
            const response = {
                success: false,
                error: 'Invalid or expired token',
            };
            res.status(401).json(response);
            return;
        }
        // Verify user still exists and is active
        const userService = new UserService_1.UserService();
        const user = await userService.findById(payload.userId);
        if (!user || !user.isActive) {
            const response = {
                success: false,
                error: 'User not found or inactive',
            };
            res.status(401).json(response);
            return;
        }
        // Attach user info to request
        req.user = user;
        next();
    }
    catch (error) {
        console.error('Authentication middleware error:', error);
        const response = {
            success: false,
            error: 'Authentication failed',
        };
        res.status(500).json(response);
    }
};
exports.authenticateToken = authenticateToken;
/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = auth_1.AuthUtils.extractTokenFromHeader(authHeader);
        if (token) {
            const payload = auth_1.AuthUtils.verifyToken(token);
            if (payload) {
                const userService = new UserService_1.UserService();
                const user = await userService.findById(payload.userId);
                if (user && user.isActive) {
                    req.user = user;
                }
            }
        }
        next();
    }
    catch (error) {
        console.error('Optional auth middleware error:', error);
        // Continue without authentication
        next();
    }
};
exports.optionalAuth = optionalAuth;
/**
 * Middleware to check if user owns a resource
 */
const requireOwnership = (resourceUserIdField = 'userId') => {
    return (req, res, next) => {
        const user = req.user;
        const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
        if (!user) {
            const response = {
                success: false,
                error: 'Authentication required',
            };
            res.status(401).json(response);
            return;
        }
        if (user.id !== resourceUserId) {
            const response = {
                success: false,
                error: 'Access denied: You can only access your own resources',
            };
            res.status(403).json(response);
            return;
        }
        next();
    };
};
exports.requireOwnership = requireOwnership;
/**
 * Middleware to require admin privileges
 */
const requireAdmin = () => {
    return (req, res, next) => {
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
exports.requireAdmin = requireAdmin;
/**
 * Rate limiting middleware
 *
 * Uses Redis when available for distributed rate limiting across instances.
 * Falls back to in-memory when Redis is unavailable.
 */
const inMemoryRateLimitStore = new Map();
/**
 * In-memory rate limit check (fallback when Redis unavailable)
 */
function checkInMemoryRateLimit(clientIP, windowMs, maxRequests) {
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
const rateLimit = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
    return async (req, res, next) => {
        const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
        try {
            // Try Redis first
            if ((0, redisRateLimiter_1.getRedis)()) {
                const key = `rate_limit:${clientIP}`;
                const result = await (0, redisRateLimiter_1.checkRateLimit)(key, maxRequests, windowMs);
                // Set rate limit headers
                res.setHeader('X-RateLimit-Limit', maxRequests.toString());
                res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining).toString());
                res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000).toString());
                if (!result.allowed) {
                    const response = {
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
                const response = {
                    success: false,
                    error: 'Too many requests, please try again later',
                };
                res.status(429).json(response);
                return;
            }
            next();
        }
        catch (error) {
            // On any error, fail-open (allow request through)
            console.error('Rate limit error:', error);
            next();
        }
    };
};
exports.rateLimit = rateLimit;
/**
 * Clean up expired in-memory rate limit entries
 */
const cleanupRateLimit = () => {
    const now = Date.now();
    for (const [key, data] of inMemoryRateLimitStore.entries()) {
        if (now > data.resetTime) {
            inMemoryRateLimitStore.delete(key);
        }
    }
};
exports.cleanupRateLimit = cleanupRateLimit;
// Clean up in-memory store every 5 minutes
setInterval(exports.cleanupRateLimit, 5 * 60 * 1000).unref();
//# sourceMappingURL=auth.js.map