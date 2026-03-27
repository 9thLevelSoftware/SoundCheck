import { User, Report, ModerationItem, UserBlock } from '../types';

/**
 * Strip server-only fields before sending user data to clients.
 * isAdmin and isPremium must NEVER be exposed in API responses.
 */
export function sanitizeUserForClient(user: User): Omit<User, 'isAdmin' | 'isPremium'> {
  const { isAdmin, isPremium, ...clientUser } = user;
  return clientUser;
}

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
    isAdmin: row.is_admin ?? false,
    isPremium: row.is_premium ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Helper to map database rows to Report objects
 */
export function mapDbRowToReport(row: any): Report {
  if (!row) {
    throw new Error('Cannot map null row to Report');
  }

  return {
    id: row.id,
    reporterId: row.reporter_id,
    contentType: row.content_type,
    contentId: row.content_id,
    targetUserId: row.target_user_id || undefined,
    reason: row.reason,
    description: row.description || undefined,
    status: row.status,
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    reviewNotes: row.review_notes || undefined,
    createdAt: row.created_at,
  };
}

/**
 * Helper to map database rows to ModerationItem objects
 */
export function mapDbRowToModerationItem(row: any): ModerationItem {
  if (!row) {
    throw new Error('Cannot map null row to ModerationItem');
  }

  return {
    id: row.id,
    contentType: row.content_type,
    contentId: row.content_id,
    source: row.source,
    reportId: row.report_id || undefined,
    safesearchResults: row.safesearch_results || undefined,
    status: row.status,
    reviewedBy: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    actionTaken: row.action_taken || undefined,
    createdAt: row.created_at,
  };
}

/**
 * Helper to map database rows to UserBlock objects
 */
export function mapDbRowToUserBlock(row: any): UserBlock {
  if (!row) {
    throw new Error('Cannot map null row to UserBlock');
  }

  return {
    id: row.id,
    blockerId: row.blocker_id,
    blockedId: row.blocked_id,
    createdAt: row.created_at,
  };
}

/**
 * Helper to convert camelCase to snake_case for SQL queries
 */
export function camelToSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
