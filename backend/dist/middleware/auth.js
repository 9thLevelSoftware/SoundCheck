"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupRateLimit = exports.rateLimit = exports.requireAdmin = exports.requireOwnership = exports.optionalAuth = exports.authenticateToken = void 0;
const auth_1 = require("../utils/auth");
const UserService_1 = require("../services/UserService");
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
 * Rate limiting middleware (simple in-memory implementation)
 */
const rateLimitStore = new Map();
const rateLimit = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
    return (req, res, next) => {
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
            const response = {
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
exports.rateLimit = rateLimit;
/**
 * Clean up expired rate limit entries (should be called periodically)
 */
const cleanupRateLimit = () => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now > data.resetTime) {
            rateLimitStore.delete(key);
        }
    }
};
exports.cleanupRateLimit = cleanupRateLimit;
// Clean up every 5 minutes
setInterval(exports.cleanupRateLimit, 5 * 60 * 1000);
//# sourceMappingURL=auth.js.map