/**
 * ProfileService -- Profile CRUD and preferences
 *
 * Extracted from UserService as part of P1 service decomposition.
 * Handles:
 *   - Profile retrieval and updates
 *   - User search
 *   - Account deactivation
 *   - Profile preferences
 */

import Database from '../../config/database';
import { User } from '../../types';
import { mapDbUserToUser, camelToSnakeCase } from '../../utils/dbMappers';

export interface SearchUserResult {
  id: string;
  username: string;
  displayName: string | null;
  profileImageUrl: string | null;
  bio: string | null;
}

export interface SearchUsersResponse {
  users: SearchUserResult[];
  hasMore: boolean;
}

export class ProfileService {
  private db = Database.getInstance();

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
   * Update user profile
   */
  async updateProfile(userId: string, updateData: Partial<User>): Promise<User> {
    const allowedFields = [
      'firstName',
      'lastName',
      'bio',
      'profileImageUrl',
      'location',
      'dateOfBirth',
    ];
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
                location, date_of_birth, is_verified, is_active, is_admin, is_premium,
                created_at, updated_at
    `;

    const result = await this.db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('User not found or inactive');
    }

    return mapDbUserToUser(result.rows[0]);
  }

  /**
   * Deactivate user account.
   * Also dismisses pending reports targeting this user (CFR-DI-008).
   */
  async deactivateAccount(userId: string): Promise<void> {
    const query = `
      UPDATE users
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await this.db.query(query, [userId]);

    // CFR-DI-008: Dismiss pending reports targeting this user (account deactivated)
    await this.db.query(
      `UPDATE reports SET status = 'dismissed', review_notes = 'content_deleted'
       WHERE content_type = 'user' AND content_id = $1 AND status = 'pending'`,
      [userId]
    );
  }

  /**
   * Reactivate user account (admin function)
   */
  async reactivateAccount(userId: string): Promise<User | null> {
    const query = `
      UPDATE users
      SET is_active = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, username, first_name, last_name, bio, profile_image_url,
                location, date_of_birth, is_verified, is_active, is_admin, is_premium,
                created_at, updated_at
    `;

    const result = await this.db.query(query, [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return mapDbUserToUser(result.rows[0]);
  }

  /**
   * Search users by username or display name
   */
  async searchUsers(
    query: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<SearchUsersResponse> {
    const searchTerm = `%${query.toLowerCase()}%`;
    const exactTerm = query.toLowerCase();
    const prefixTerm = `${query.toLowerCase()}%`;

    const result = await this.db.query(
      `SELECT id, username,
              COALESCE(first_name || ' ' || last_name, first_name, last_name) as display_name,
              profile_image_url, bio
       FROM users
       WHERE is_active = true
         AND (LOWER(username) LIKE $1
              OR LOWER(first_name) LIKE $1
              OR LOWER(last_name) LIKE $1
              OR LOWER(COALESCE(first_name || ' ' || last_name, '')) LIKE $1)
       ORDER BY
         CASE WHEN LOWER(username) = $4 THEN 0
              WHEN LOWER(username) LIKE $5 THEN 1
              ELSE 2 END,
         created_at DESC
       LIMIT $2 OFFSET $3`,
      [searchTerm, limit, offset, exactTerm, prefixTerm]
    );

    return {
      users: result.rows.map((row: any) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name?.trim() || null,
        profileImageUrl: row.profile_image_url,
        bio: row.bio,
      })),
      hasMore: result.rows.length === limit,
    };
  }

  /**
   * Update user preferences (if preferences table exists)
   * This is a placeholder for future preferences implementation
   */
  async updatePreferences(_userId: string, _preferences: Record<string, any>): Promise<boolean> {
    // Placeholder for future preferences implementation
    // For now, just return success
    return true;
  }

  /**
   * Get user preferences (if preferences table exists)
   * This is a placeholder for future preferences implementation
   */
  async getPreferences(_userId: string): Promise<Record<string, any>> {
    // Placeholder for future preferences implementation
    // For now, return empty object
    return {};
  }
}
