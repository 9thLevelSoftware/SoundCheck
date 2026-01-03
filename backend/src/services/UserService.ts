import Database from '../config/database';
import { User, CreateUserRequest, LoginRequest, AuthResponse } from '../types';
import { AuthUtils } from '../utils/auth';
import { mapDbUserToUser, camelToSnakeCase } from '../utils/dbMappers';

export class UserService {
  private db = Database.getInstance();

  /**
   * Create a new user
   */
  async createUser(userData: CreateUserRequest): Promise<AuthResponse> {
    const { email, password, username, firstName, lastName } = userData;

    // Note: Basic validation is handled by middleware now,
    // but business logic validation (duplicates) remains here.

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
                location, date_of_birth, is_verified, is_active, created_at, updated_at
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
      user,
      token,
    };
  }

  /**
   * Authenticate user login
   */
  async authenticateUser(loginData: LoginRequest): Promise<AuthResponse> {
    const { email, password } = loginData;

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

    // Remove password hash from user object
    const { passwordHash, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      token,
    };
  }

  /**
   * Find user by ID
   */
  async findById(userId: string): Promise<User | null> {
    const query = `
      SELECT id, email, username, first_name, last_name, bio, profile_image_url,
             location, date_of_birth, is_verified, is_active, created_at, updated_at
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
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const query = `
      SELECT id, email, username, first_name, last_name, bio, profile_image_url,
             location, date_of_birth, is_verified, is_active, created_at, updated_at
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
   * Find user by email including password hash (for authentication)
   */
  private async findByEmailWithPassword(email: string): Promise<(User & { passwordHash: string }) | null> {
    const query = `
      SELECT id, email, password_hash, username, first_name, last_name, bio, 
             profile_image_url, location, date_of_birth, is_verified, is_active, 
             created_at, updated_at
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
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    const query = `
      SELECT id, email, username, first_name, last_name, bio, profile_image_url,
             location, date_of_birth, is_verified, is_active, created_at, updated_at
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
   * Update user profile
   */
  async updateProfile(userId: string, updateData: Partial<User>): Promise<User> {
    const allowedFields = ['firstName', 'lastName', 'bio', 'profileImageUrl', 'location', 'dateOfBirth'];
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        const dbField = camelToSnakeCase(key);
        updates.push(`${dbField} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(userId);
    const query = `
      UPDATE users 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND is_active = true
      RETURNING id, email, username, first_name, last_name, bio, profile_image_url,
                location, date_of_birth, is_verified, is_active, created_at, updated_at
    `;

    const result = await this.db.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('User not found or inactive');
    }

    return mapDbUserToUser(result.rows[0]);
  }

  /**
   * Deactivate user account
   */
  async deactivateAccount(userId: string): Promise<void> {
    const query = `
      UPDATE users 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await this.db.query(query, [userId]);
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<{
    totalCheckins: number;
    badgesEarned: number;
    followersCount: number;
    followingCount: number;
  }> {
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM reviews WHERE user_id = $1) as review_count,
        (SELECT COUNT(*) FROM user_badges WHERE user_id = $1) as badge_count,
        (SELECT COUNT(*) FROM user_followers WHERE following_id = $1) as follower_count,
        (SELECT COUNT(*) FROM user_followers WHERE follower_id = $1) as following_count
    `;

    const result = await this.db.query(statsQuery, [userId]);
    const stats = result.rows[0];

    return {
      totalCheckins: parseInt(stats.review_count) || 0,
      badgesEarned: parseInt(stats.badge_count) || 0,
      followersCount: parseInt(stats.follower_count) || 0,
      followingCount: parseInt(stats.following_count) || 0,
    };
  }
}