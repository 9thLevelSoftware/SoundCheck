import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PoolClient } from 'pg';
import { JWTPayload } from '../types';
import Database from '../config/database';
import logger from './logger';

// Type for database query executor (supports both Database and PoolClient for transactions)
type QueryExecutor = {
  query: (text: string, params?: any[]) => Promise<any>;
};

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is required');
  }
  if (secret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters');
  }
  return secret;
})();
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '30m';

export class AuthUtils {
  /**
   * Hash a password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Compare a plain password with a hashed password
   */
  static async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(password, hashedPassword);
  }

  /**
   * Generate a JWT token for a user
   */
  static generateToken(payload: JWTPayload): string {
    const options: SignOptions = {
      expiresIn: JWT_EXPIRES_IN as any, // '30m' format is valid but types are strict
      issuer: 'soundcheck-api',
      audience: 'soundcheck-mobile',
    };
    return jwt.sign(payload, JWT_SECRET, options);
  }

  /**
   * Verify and decode a JWT token
   */
  static verifyToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'soundcheck-api',
        audience: 'soundcheck-mobile',
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        logger.error('JWT verification failed', { error: error.message });
      }
      return null;
    }
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

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
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate username format
   */
  static validateUsername(username: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

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

// =====================================================
// REFRESH TOKEN SYSTEM
// =====================================================

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

/**
 * Hash a refresh token using bcrypt for secure storage
 * SECURITY FIX (P1): Changed from SHA-256 to bcrypt with cost factor 10
 * SHA-256 is fast and vulnerable to brute force attacks on leaked hashes
 * bcrypt is intentionally slow and resistant to GPU/ASIC attacks
 *
 * @param token - The raw refresh token to hash
 * @returns The bcrypt hash of the token
 */
export async function hashRefreshToken(token: string): Promise<string> {
  // Use bcrypt with cost factor 10 (refresh tokens are long-lived)
  return bcrypt.hash(token, 10);
}

/**
 * Verify a refresh token against a stored hash
 * @param token - The raw refresh token
 * @param hash - The stored bcrypt hash
 * @returns true if token matches the hash
 */
export async function verifyRefreshTokenHash(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash);
}

/**
 * Generate a secure refresh token for a user.
 * The token is a cryptographically secure random string.
 * Only the bcrypt hash is stored in the database for security.
 *
 * SECURITY: Uses bcrypt hashing instead of SHA-256 to prevent
 * brute force attacks on leaked token hashes.
 *
 * @param userId - The user ID to associate with the token
 * @param client - Optional database client for transaction support
 * @returns The raw refresh token (to be sent to client)
 */
export async function generateRefreshToken(
  userId: string,
  client?: QueryExecutor
): Promise<string> {
  const executor = client || Database.getInstance();

  // Generate secure random token
  const token = crypto.randomBytes(32).toString('hex');
  // SECURITY: Use bcrypt instead of SHA-256 for secure token hashing
  const tokenHash = await hashRefreshToken(token);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await executor.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );

  return token;
}

/**
 * Verify a refresh token and return the associated user ID.
 * Checks that the token exists, is not expired, and is not revoked.
 *
 * SECURITY: Uses bcrypt comparison instead of SHA-256 hash comparison
 *
 * @param token - The raw refresh token to verify
 * @returns Object with valid flag and userId if valid
 */
export async function verifyRefreshToken(
  token: string
): Promise<{ valid: boolean; userId?: string }> {
  const db = Database.getInstance();

  // Find all non-expired, non-revoked tokens for this user
  // We need to check bcrypt hashes one by one since bcrypt
  // requires the original hash for comparison
  const result = await db.query(
    `SELECT id, user_id, token_hash FROM refresh_tokens
     WHERE expires_at > NOW()
       AND revoked_at IS NULL`
  );

  // Check each token hash using bcrypt comparison
  for (const row of result.rows) {
    const isValid = await verifyRefreshTokenHash(token, row.token_hash);
    if (isValid) {
      return { valid: true, userId: row.user_id };
    }
  }

  return { valid: false };
}

/**
 * Revoke a specific refresh token.
 * Used during token rotation and logout.
 *
 * SECURITY: Uses bcrypt comparison to find the token
 *
 * @param token - The raw refresh token to revoke
 * @param client - Optional database client for transaction support
 */
export async function revokeRefreshToken(token: string, client?: QueryExecutor): Promise<void> {
  const executor = client || Database.getInstance();

  // Find the token by comparing bcrypt hashes
  const result = await executor.query(
    `SELECT id, token_hash FROM refresh_tokens
     WHERE revoked_at IS NULL`
  );

  for (const row of result.rows) {
    const isValid = await verifyRefreshTokenHash(token, row.token_hash);
    if (isValid) {
      await executor.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
        [row.id]
      );
      return;
    }
  }
}

/**
 * Revoke all refresh tokens for a user.
 * Used for security actions like password change, account compromise, etc.
 *
 * @param userId - The user ID whose tokens should be revoked
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const db = Database.getInstance();

  await db.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
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
export async function cleanupExpiredTokens(): Promise<number> {
  const db = Database.getInstance();

  const result = await db.query(
    `DELETE FROM refresh_tokens
     WHERE expires_at < NOW()
        OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days')`
  );

  return result.rowCount || 0;
}
