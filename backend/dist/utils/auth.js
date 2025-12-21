"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthUtils = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const JWT_SECRET = (() => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('FATAL: JWT_SECRET environment variable is required');
    }
    if (secret.length < 32) {
        throw new Error('FATAL: JWT_SECRET must be at least 32 characters');
    }
    return secret;
})();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
class AuthUtils {
    /**
     * Hash a password using bcrypt
     */
    static async hashPassword(password) {
        const saltRounds = 12;
        return await bcryptjs_1.default.hash(password, saltRounds);
    }
    /**
     * Compare a plain password with a hashed password
     */
    static async comparePassword(password, hashedPassword) {
        return await bcryptjs_1.default.compare(password, hashedPassword);
    }
    /**
     * Generate a JWT token for a user
     */
    static generateToken(payload) {
        const options = {
            expiresIn: JWT_EXPIRES_IN, // '7d' format is valid but types are strict
            issuer: 'pitpulse-api',
            audience: 'pitpulse-mobile',
        };
        return jsonwebtoken_1.default.sign(payload, JWT_SECRET, options);
    }
    /**
     * Verify and decode a JWT token
     */
    static verifyToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET, {
                issuer: 'pitpulse-api',
                audience: 'pitpulse-mobile',
            });
            return decoded;
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                console.error('JWT verification failed:', error.message);
            }
            return null;
        }
    }
    /**
     * Extract token from Authorization header
     */
    static extractTokenFromHeader(authHeader) {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        return authHeader.substring(7); // Remove 'Bearer ' prefix
    }
    /**
     * Validate password strength
     */
    static validatePassword(password) {
        const errors = [];
        if (password.length < 8) {
            errors.push('Password must be at least 8 characters long');
        }
        if (!/(?=.*[a-z])/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }
        if (!/(?=.*[A-Z])/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }
        if (!/(?=.*\d)/.test(password)) {
            errors.push('Password must contain at least one number');
        }
        if (!/(?=.*[@$!%*?&])/.test(password)) {
            errors.push('Password must contain at least one special character (@$!%*?&)');
        }
        return {
            isValid: errors.length === 0,
            errors,
        };
    }
    /**
     * Validate email format
     */
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    /**
     * Validate username format
     */
    static validateUsername(username) {
        const errors = [];
        if (username.length < 3) {
            errors.push('Username must be at least 3 characters long');
        }
        if (username.length > 30) {
            errors.push('Username must be no more than 30 characters long');
        }
        if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
            errors.push('Username can only contain letters, numbers, dots, hyphens, and underscores');
        }
        if (/^[._-]/.test(username) || /[._-]$/.test(username)) {
            errors.push('Username cannot start or end with dots, hyphens, or underscores');
        }
        return {
            isValid: errors.length === 0,
            errors,
        };
    }
}
exports.AuthUtils = AuthUtils;
//# sourceMappingURL=auth.js.map