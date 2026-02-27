import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import Database from '../config/database';
import { EmailService } from './EmailService';
import { AuthUtils } from '../utils/auth';
import { revokeAllUserTokens } from '../utils/auth';
import logger, { logInfo, logWarn, logError } from '../utils/logger';

// Placeholder password for social auth users (matches SocialAuthService constant)
const SOCIAL_AUTH_NO_PASSWORD = '$SOCIAL_AUTH$';

/**
 * PasswordResetService handles the full forgot-password lifecycle:
 * - Token generation with SHA-256 hash storage
 * - Social auth user detection
 * - Token verification and password update
 * - Old token invalidation
 * - Refresh token revocation after reset
 */
export class PasswordResetService {
  private db: typeof Database.prototype extends object ? ReturnType<typeof Database.getInstance> : any;
  private emailService: EmailService;

  constructor(db?: any, emailService?: EmailService) {
    this.db = db || Database.getInstance();
    this.emailService = emailService || new EmailService();
  }

  /**
   * Request a password reset for the given email.
   *
   * Returns a generic message regardless of whether the email exists to prevent
   * email enumeration attacks. Social auth users receive a specific message.
   */
  async requestReset(email: string): Promise<{ sent: boolean; message: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const genericMessage = 'If an account exists for that email, we\'ve sent a password reset link. Check your inbox.';

    try {
      // Look up user by email
      const userResult = await this.db.query(
        'SELECT id, password FROM users WHERE LOWER(email) = $1 AND is_active = true',
        [normalizedEmail]
      );

      if (userResult.rows.length === 0) {
        // User not found - return generic message (no enumeration)
        logInfo('Password reset requested for non-existent email', { email: normalizedEmail });
        return { sent: false, message: genericMessage };
      }

      const user = userResult.rows[0];

      // Check if social-auth-only user
      if (user.password === SOCIAL_AUTH_NO_PASSWORD) {
        logInfo('Password reset requested for social auth user', { userId: user.id });
        return {
          sent: false,
          message: 'This account uses Google/Apple Sign-In. Please use that method to log in.',
        };
      }

      // Revoke all existing reset tokens for this user
      await this.db.query(
        'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND used_at IS NULL',
        [user.id]
      );

      // Generate new secure token (same pattern as refresh tokens)
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.db.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, tokenHash, expiresAt]
      );

      // Send reset email
      await this.emailService.sendPasswordResetEmail(normalizedEmail, token);

      logInfo('Password reset token generated', { userId: user.id });
      return { sent: true, message: genericMessage };
    } catch (err) {
      logError('Error processing password reset request', { email: normalizedEmail, error: err });
      throw err;
    }
  }

  /**
   * Reset a user's password using a valid reset token.
   *
   * Validates the token, updates the password, marks the token as used,
   * and revokes all refresh tokens to force re-login on all devices.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Validate password meets requirements
    const validation = AuthUtils.validatePassword(newPassword);
    if (!validation.isValid) {
      const error = new Error(validation.errors.join('. '));
      (error as any).statusCode = 400;
      throw error;
    }

    // Hash the submitted token with SHA-256
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Look up the token
    const tokenResult = await this.db.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      const error = new Error('Invalid or expired reset token');
      (error as any).statusCode = 400;
      throw error;
    }

    const { id: tokenId, user_id: userId } = tokenResult.rows[0];

    // Hash new password with bcryptjs (same as registration flow)
    const passwordHash = await AuthUtils.hashPassword(newPassword);

    // Update user password
    await this.db.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, userId]
    );

    // Mark token as used
    await this.db.query(
      'UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [tokenId]
    );

    // Revoke all refresh tokens for this user (forces re-login on all devices)
    await revokeAllUserTokens(userId);

    logInfo('Password reset successful', { userId });
  }
}
