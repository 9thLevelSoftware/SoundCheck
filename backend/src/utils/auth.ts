import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWTPayload } from '../types';

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
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

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
      expiresIn: JWT_EXPIRES_IN as any, // '7d' format is valid but types are strict
      issuer: 'pitpulse-api',
      audience: 'pitpulse-mobile',
    };
    return jwt.sign(payload, JWT_SECRET, options);
  }

  /**
   * Verify and decode a JWT token
   */
  static verifyToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'pitpulse-api',
        audience: 'pitpulse-mobile',
      }) as JWTPayload;
      
      return decoded;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        console.error('JWT verification failed:', error.message);
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