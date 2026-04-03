"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addJitter = exports.cleanupRateLimit = exports.rateLimit = exports.requirePremium = exports.requireAdmin = exports.optionalAuth = exports.authenticateToken = void 0;
const auth_1 = require("../utils/auth");
const UserService_1 = require("../services/UserService");
const redisRateLimiter_1 = require("../utils/redisRateLimiter");
const logger_1 = __importDefault(require("../utils/logger"));
const sentry_1 = require("../utils/sentry");
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
        // Enrich Sentry error context with authenticated user
        (0, sentry_1.setUser)({ id: user.id, username: user.username });
        next();
    }
    catch (error) {
        logger_1.default.error('Authentication middleware error', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
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
                    (0, sentry_1.setUser)({ id: user.id, username: user.username });
                }
            }
        }
        next();
    }
    catch (error) {
        logger_1.default.error('Optional auth middleware error', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
        // Continue without authentication
        next();
    }
};
exports.optionalAuth = optionalAuth;
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
 * Middleware to require premium subscription
 */
const requirePremium = () => {
    return (req, res, next) => {
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
exports.requirePremium = requirePremium;
/**
 * Rate limiting middleware
 *
 * Uses Redis when available for distributed rate limiting across instances.
 * Falls back to in-memory when Redis is unavailable.
 *
 * SECURITY: Critical endpoints fail CLOSED when Redis is unavailable
 * to prevent DDoS attacks through degraded infrastructure.
 */
const inMemoryRateLimitStore = new Map();
// INF-018: Cap in-memory rate limit map to prevent unbounded memory growth.
// At 10,000 entries (~1KB each), the map uses ~10MB -- acceptable for the
// fallback case. If this limit is reached, expired entries are purged first.
const MAX_RATE_LIMIT_ENTRIES = 10000;
// Critical endpoints that fail closed when Redis is unavailable
const CRITICAL_ENDPOINTS = [
    '/auth/login',
    '/auth/register',
    '/auth/refresh',
    '/auth/social/google',
    '/auth/social/apple',
    '/upload',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/social/google',
    '/api/auth/social/apple',
    '/api/upload',
];
/**
 * Check if endpoint is critical (should fail closed)
 */
function isCriticalEndpoint(path) {
    return CRITICAL_ENDPOINTS.some(endpoint => path.startsWith(endpoint));
}
/**
 * In-memory rate limit check (fallback when Redis unavailable)
 */
function checkInMemoryRateLimit(clientIP, windowMs, maxRequests) {
    const now = Date.now();
    const clientData = inMemoryRateLimitStore.get(clientIP);
    if (!clientData || now > clientData.resetTime) {
        // Enforce max size before adding new entries
        if (inMemoryRateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES &&
            !inMemoryRateLimitStore.has(clientIP)) {
            // Purge expired entries first
            for (const [key, data] of inMemoryRateLimitStore.entries()) {
                if (now > data.resetTime) {
                    inMemoryRateLimitStore.delete(key);
                }
            }
            // If still at capacity after purge, allow request without tracking
            // (fail-open for memory safety)
            if (inMemoryRateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
                return { allowed: true, remaining: maxRequests - 1 };
            }
        }
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
        const isCritical = isCriticalEndpoint(req.path);
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
            // Redis unavailable - handle based on endpoint criticality
            if (isCritical) {
                // CRITICAL ENDPOINTS: Fail closed (block requests)
                logger_1.default.error('Rate limiting unavailable for critical endpoint, failing closed', {
                    path: req.path,
                    clientIP
                });
                const response = {
                    success: false,
                    error: 'Service temporarily unavailable',
                    retryAfter: 60,
                };
                res.status(503).setHeader('Retry-After', '60').json(response);
                return;
            }
            // Non-critical endpoints: Use in-memory fallback
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
            logger_1.default.error('Rate limit error', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            // Redis unavailable - handle based on endpoint criticality
            if (isCritical) {
                // CRITICAL ENDPOINTS: Fail closed (block requests)
                const response = {
                    success: false,
                    error: 'Service temporarily unavailable',
                    retryAfter: 60,
                };
                res.status(503).setHeader('Retry-After', '60').json(response);
                return;
            }
            // Non-critical endpoints: Allow through (fail-open with warning)
            logger_1.default.warn('Rate limiting failed for non-critical endpoint, allowing request', {
                path: req.path,
            });
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
/**
 * Timing attack prevention middleware
 * SEC-007/CFR-015: Add random jitter to enumeration endpoint responses
 * to prevent timing-based username/email enumeration attacks.
 *
 * Adds a random delay between 50-150ms to ensure both "available" and
 * "unavailable" responses take similar time.
 */
const addJitter = (minMs = 50, maxMs = 150) => {
    return (req, res, next) => {
        const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        // Store original end function
        const originalEnd = res.end.bind(res);
        // Override end to add delay before sending response
        res.end = function (chunk, encoding, cb) {
            const args = arguments;
            setTimeout(() => {
                originalEnd.apply(res, args);
            }, delay);
            return res;
        };
        // Also wrap json/send for cases where end isn't called directly
        const originalJson = res.json.bind(res);
        res.json = function (body) {
            setTimeout(() => {
                originalJson(body);
            }, delay);
            return res;
        };
        const originalSend = res.send.bind(res);
        res.send = function (body) {
            setTimeout(() => {
                originalSend(body);
            }, delay);
            return res;
        };
        next();
    };
};
exports.addJitter = addJitter;
//# sourceMappingURL=auth.js.map