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
import { User, CreateUserRequest, LoginRequest, AuthResponse } from '../../types';
import { AuthUtils } from '../../utils/auth';
import { mapDbUserToUser, sanitizeUserForClient } from '../../utils/dbMappers';

export class AuthService {
  private db = Database.getInstance();

  /**
   * Create a new user (registration)
   */
  async register(userData: CreateUserRequest): Promise<AuthResponse> {
    const { email: rawEmail, password, username, firstName, lastName } = userData;
    const email = rawEmail.toLowerCase();

    // Check if email already exists
    const emailExists = await this.findByEmail(email);
    if (emailExists) {
      throw new Error('Email already registered');
    }

    // Check if username already exists
    const usernameExists = await this.findByUsername(username);
    if (usernameExists) {
      throw new Error('Username already taken');
    }

    // Hash password
    const passwordHash = await AuthUtils.hashPassword(password);

    // Insert user into database
    const query = `
      INSERT INTO users (email, password_hash, username, first_name, last_name)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, username, first_name, last_name, bio, profile_image_url,
                location, date_of_birth, is_verified, is_active, is_admin, is_premium,
                created_at, updated_at
    `;

    const values = [email, passwordHash, username, firstName || null, lastName || null];
    const result = await this.db.query(query, values);

    const user = mapDbUserToUser(result.rows[0]);

    // Generate JWT token for new user
    const token = AuthUtils.generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    return {
      user: sanitizeUserForClient(user) as User,
      token,
    };
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
      throw new Error('Invalid email or password');
    }

    if (!user.isActive) {
      throw new Error('Account is deactivated');
    }

    // Verify password
    const isValidPassword = await AuthUtils.comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = AuthUtils.generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    // Remove password hash and server-only fields from user object
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      user: sanitizeUserForClient(userWithoutPassword) as User,
      token,
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
             created_at, updated_at
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
