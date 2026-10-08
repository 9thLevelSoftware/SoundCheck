/**
 * AuthService -- Login, register, tokens
 *
 * Extracted from UserService as part of P1 service decomposition.
 * Handles:
 *   - User registration
 *   - User authentication/login
 *   - JWT token generation
 *   - Password hashing and verification
 */

import Database from '../../config/database';
import { EmailService, SIGNUP_MAIL_UNAVAILABLE_MESSAGE } from '../EmailService';
import { PasswordResetService } from '../PasswordResetService';
import { User, CreateUserRequest, LoginRequest, AuthResponse } from '../../types';
import { AuthUtils, generateRefreshToken } from '../../utils/auth';
import { mapDbUserToUser, sanitizeUserForClient } from '../../utils/dbMappers';
import { clientStatusError, ServiceUnavailableError, UnauthorizedError } from '../../utils/errors';
import { logError } from '../../utils/logger';

export class AuthService {
  private db = Database.getInstance();
  private emailService: EmailService;
  private passwordResetService: PasswordResetService;

  constructor(emailService?: EmailService, passwordResetService?: PasswordResetService) {
    this.emailService = emailService ?? new EmailService();
    this.passwordResetService =
      passwordResetService ?? new PasswordResetService(this.db, this.emailService);
  }

  /**
   * Create a new user when the email is unused.
   *
   * An existing email is not an error. Both paths send mail and return without
   * a session, so the HTTP result does not say which one happened. Signing the
   * client in afterwards would reopen that oracle: login with the submitted
   * password succeeds only when the account was just created.
   */
  async register(userData: CreateUserRequest): Promise<void> {
    if (!this.emailService.isConfigured()) {
      throw new ServiceUnavailableError(SIGNUP_MAIL_UNAVAILABLE_MESSAGE);
    }

    const { email: rawEmail, password, username, firstName, lastName } = userData;
    const email = rawEmail.toLowerCase();

    const emailExists = await this.findByEmail(email);
    // Hash on both paths so an existing email is not a faster response.
    const passwordHash = await AuthUtils.hashPassword(password);
    if (emailExists) {
      await this.sendExistingAccountNotice(emailExists.id, email);
      return;
    }

    const usernameExists = await this.findByUsername(username);
    if (usernameExists) {
      throw clientStatusError(409, 'Username already taken');
    }

    const query = `
      INSERT INTO users (email, password_hash, username, first_name, last_name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;

    const values = [email, passwordHash, username, firstName || null, lastName || null];
    const created = await this.db.query(query, values);
    const userId = created.rows[0].id as string;

    try {
      await this.emailService.sendSignupWelcomeEmail(email);
    } catch (error) {
      await this.db.query('DELETE FROM users WHERE id = $1', [userId]);
      logError('Signup welcome email failed');
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError(SIGNUP_MAIL_UNAVAILABLE_MESSAGE);
    }
  }

  private async sendExistingAccountNotice(userId: string, email: string): Promise<void> {
    try {
      const social = await this.db.query(
        'SELECT 1 FROM user_social_accounts WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      const resetToken =
        social.rows.length > 0 ? null : await this.passwordResetService.issueResetToken(userId);
      await this.emailService.sendSignupExistingAccountEmail(email, resetToken);
    } catch (error) {
      logError('Signup existing-account email failed');
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError(SIGNUP_MAIL_UNAVAILABLE_MESSAGE);
    }
  }

  /**
   * Authenticate user login
   */
  async authenticate(loginData: LoginRequest): Promise<AuthResponse> {
    const { email: rawEmail, password } = loginData;
    const email = rawEmail.toLowerCase();

    // Find user by email
    const user = await this.findByEmailWithPassword(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await AuthUtils.comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Generate JWT token
    const token = AuthUtils.generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    const refreshToken = await generateRefreshToken(user.id);

    // Remove password hash and server-only fields from user object
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      user: sanitizeUserForClient(userWithoutPassword) as User,
      token,
      refreshToken,
    };
  }

  /**
   * Generate a new token for an existing user
   */
  async generateTokenForUser(userId: string): Promise<string | null> {
    const user = await this.findById(userId);
    if (!user) {
      return null;
    }

    return AuthUtils.generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });
  }

  /**
   * Find user by ID (public fields only)
   */
  async findById(userId: string): Promise<User | null> {
    const query = `
      SELECT id, email, username, first_name, last_name, bio, profile_image_url,
             location, date_of_birth, is_verified, is_active, is_admin, is_premium,
             created_at, updated_at, credentials_changed_at
      FROM users
      WHERE id = $1 AND is_active = true
    `;

    const result = await this.db.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapDbUserToUser(result.rows[0]);
  }

  /**
   * Find user by email (public fields only)
   */
  async findByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, email, username, first_name, last_name, bio, profile_image_url,
             location, date_of_birth, is_verified, is_active, is_admin, is_premium,
             created_at, updated_at
      FROM users
      WHERE email = $1 AND is_active = true
    `;

    const result = await this.db.query(query, [email]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapDbUserToUser(result.rows[0]);
  }

  /**
   * Find user by username (public fields only)
   */
  async findByUsername(username: string): Promise<User | null> {
    const query = `
      SELECT id, email, username, first_name, last_name, bio, profile_image_url,
             location, date_of_birth, is_verified, is_active, is_admin, is_premium,
             created_at, updated_at
      FROM users
      WHERE username = $1 AND is_active = true
    `;

    const result = await this.db.query(query, [username]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapDbUserToUser(result.rows[0]);
  }

  /**
   * Find user by email including password hash (for authentication)
   */
  private async findByEmailWithPassword(
    email: string
  ): Promise<(User & { passwordHash: string }) | null> {
    const query = `
      SELECT id, email, password_hash, username, first_name, last_name, bio,
             profile_image_url, location, date_of_birth, is_verified, is_active,
             is_admin, is_premium, created_at, updated_at
      FROM users
      WHERE email = $1
    `;

    const result = await this.db.query(query, [email]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...mapDbUserToUser(row),
      passwordHash: row.password_hash,
    };
  }

  /**
   * Check if email is available (not taken)
   */
  async isEmailAvailable(email: string): Promise<boolean> {
    const query = `SELECT 1 FROM users WHERE email = $1 AND is_active = true`;
    const result = await this.db.query(query, [email.toLowerCase()]);
    return result.rows.length === 0;
  }

  /**
   * Check if username is available (not taken)
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const query = `SELECT 1 FROM users WHERE username = $1 AND is_active = true`;
    const result = await this.db.query(query, [username]);
    return result.rows.length === 0;
  }
}
