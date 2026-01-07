"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthUtils = void 0;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.revokeRefreshToken = revokeRefreshToken;
exports.revokeAllUserTokens = revokeAllUserTokens;
exports.cleanupExpiredTokens = cleanupExpiredTokens;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const database_1 = __importDefault(require("../config/database"));
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
// =====================================================
// REFRESH TOKEN SYSTEM
// =====================================================
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
/**
 * Generate a secure refresh token for a user.
 * The token is a cryptographically secure random string.
 * Only the SHA-256 hash is stored in the database for security.
 *
 * @param userId - The user ID to associate with the token
 * @param client - Optional database client for transaction support
 * @returns The raw refresh token (to be sent to client)
 */
async function generateRefreshToken(userId, client) {
    const executor = client || database_1.default.getInstance();
    // Generate secure random token
    const token = crypto_1.default.randomBytes(32).toString('hex');
    const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
    await executor.query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [userId, tokenHash, expiresAt]);
    return token;
}
/**
 * Verify a refresh token and return the associated user ID.
 * Checks that the token exists, is not expired, and is not revoked.
 *
 * @param token - The raw refresh token to verify
 * @returns Object with valid flag and userId if valid
 */
async function verifyRefreshToken(token) {
    const db = database_1.default.getInstance();
    const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
    const result = await db.query(`SELECT user_id FROM refresh_tokens
     WHERE token_hash = $1
       AND expires_at > NOW()
       AND revoked_at IS NULL`, [tokenHash]);
    if (result.rows.length === 0) {
        return { valid: false };
    }
    return { valid: true, userId: result.rows[0].user_id };
}
/**
 * Revoke a specific refresh token.
 * Used during token rotation and logout.
 *
 * @param token - The raw refresh token to revoke
 * @param client - Optional database client for transaction support
 */
async function revokeRefreshToken(token, client) {
    const executor = client || database_1.default.getInstance();
    const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
    await executor.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`, [tokenHash]);
}
/**
 * Revoke all refresh tokens for a user.
 * Used for security actions like password change, account compromise, etc.
 *
 * @param userId - The user ID whose tokens should be revoked
 */
async function revokeAllUserTokens(userId) {
    const db = database_1.default.getInstance();
    await db.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}
/**
 * Clean up expired and revoked refresh tokens from the database.
 * Should be called periodically (e.g., daily cron job) to prevent table bloat.
 *
 * Removes tokens that are:
 * - Expired (expires_at < NOW())
 * - Revoked more than 7 days ago (grace period for audit trail)
 *
 * @returns The number of tokens deleted
 */
async function cleanupExpiredTokens() {
    const db = database_1.default.getInstance();
    const result = await db.query(`DELETE FROM refresh_tokens
     WHERE expires_at < NOW()
        OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days')`);
    return result.rowCount || 0;
}
//# sourceMappingURL=auth.js.map