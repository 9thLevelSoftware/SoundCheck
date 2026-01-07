import { JWTPayload } from '../types';
type QueryExecutor = {
    query: (text: string, params?: any[]) => Promise<any>;
};
export declare class AuthUtils {
    /**
     * Hash a password using bcrypt
     */
    static hashPassword(password: string): Promise<string>;
    /**
     * Compare a plain password with a hashed password
     */
    static comparePassword(password: string, hashedPassword: string): Promise<boolean>;
    /**
     * Generate a JWT token for a user
     */
    static generateToken(payload: JWTPayload): string;
    /**
     * Verify and decode a JWT token
     */
    static verifyToken(token: string): JWTPayload | null;
    /**
     * Extract token from Authorization header
     */
    static extractTokenFromHeader(authHeader?: string): string | null;
    /**
     * Validate password strength
     */
    static validatePassword(password: string): {
        isValid: boolean;
        errors: string[];
    };
    /**
     * Validate email format
     */
    static validateEmail(email: string): boolean;
    /**
     * Validate username format
     */
    static validateUsername(username: string): {
        isValid: boolean;
        errors: string[];
    };
}
/**
 * Generate a secure refresh token for a user.
 * The token is a cryptographically secure random string.
 * Only the SHA-256 hash is stored in the database for security.
 *
 * @param userId - The user ID to associate with the token
 * @param client - Optional database client for transaction support
 * @returns The raw refresh token (to be sent to client)
 */
export declare function generateRefreshToken(userId: string, client?: QueryExecutor): Promise<string>;
/**
 * Verify a refresh token and return the associated user ID.
 * Checks that the token exists, is not expired, and is not revoked.
 *
 * @param token - The raw refresh token to verify
 * @returns Object with valid flag and userId if valid
 */
export declare function verifyRefreshToken(token: string): Promise<{
    valid: boolean;
    userId?: string;
}>;
/**
 * Revoke a specific refresh token.
 * Used during token rotation and logout.
 *
 * @param token - The raw refresh token to revoke
 * @param client - Optional database client for transaction support
 */
export declare function revokeRefreshToken(token: string, client?: QueryExecutor): Promise<void>;
/**
 * Revoke all refresh tokens for a user.
 * Used for security actions like password change, account compromise, etc.
 *
 * @param userId - The user ID whose tokens should be revoked
 */
export declare function revokeAllUserTokens(userId: string): Promise<void>;
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
export declare function cleanupExpiredTokens(): Promise<number>;
export {};
//# sourceMappingURL=auth.d.ts.map