import { User } from '../types';

/**
 * Helper to map database rows to User objects safely
 */
export function mapDbUserToUser(row: any): User {
  if (!row) {
    throw new Error('Cannot map null row to User');
  }
  
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    firstName: row.first_name || undefined,
    lastName: row.last_name || undefined,
    bio: row.bio || undefined,
    profileImageUrl: row.profile_image_url || undefined,
    location: row.location || undefined,
    dateOfBirth: row.date_of_birth || undefined,
    isVerified: row.is_verified ?? false,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Helper to convert camelCase to snake_case for SQL queries
 */
export function camelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}
