import Database from '../config/database';
import crypto from 'crypto';

/**
 * Deletion request status types
 */
export type DeletionStatus = 'pending' | 'processing' | 'completed' | 'cancelled';

/**
 * Deletion request interface
 */
export interface DeletionRequest {
  id: string;
  userId: string;
  status: DeletionStatus;
  requestedAt: Date;
  scheduledFor: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

/**
 * Result of requesting account deletion
 */
export interface DeletionRequestResult {
  success: boolean;
  deletionRequest: DeletionRequest;
  message: string;
}

/**
 * Result of executing account deletion
 */
export interface DeletionExecutionResult {
  success: boolean;
  userId: string;
  anonymizedEmail: string;
  deletedNotifications: number;
  deletedFollows: number;
  deletedWishlists: number;
  revokedTokens: number;
}

/**
 * GDPR-compliant data retention service.
 * Handles account deletion requests with a 30-day grace period,
 * full data anonymization, and cleanup of user-related data.
 */
export class DataRetentionService {
  private db = Database.getInstance();

  /**
   * Default grace period in days before deletion is executed
   */
  private static readonly GRACE_PERIOD_DAYS = 30;

  /**
   * Request account deletion for a user.
   * Creates a deletion request with a 30-day grace period.
   *
   * @param userId - The ID of the user requesting deletion
   * @returns DeletionRequestResult with the created request
   * @throws Error if user not found or request already exists
   */
  async requestAccountDeletion(userId: string): Promise<DeletionRequestResult> {
    // Verify user exists
    const userCheck = await this.db.query(
      'SELECT id, is_active FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      throw new Error('User not found');
    }

    // Check for existing pending deletion request
    const existingRequest = await this.db.query(
      `SELECT id, status, scheduled_for FROM deletion_requests
       WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );

    if (existingRequest.rows.length > 0) {
      throw new Error('A pending deletion request already exists for this account');
    }

    // Calculate scheduled deletion date (30 days from now)
    const scheduledFor = new Date();
    scheduledFor.setDate(scheduledFor.getDate() + DataRetentionService.GRACE_PERIOD_DAYS);

    // Create deletion request
    const result = await this.db.query(
      `INSERT INTO deletion_requests (user_id, status, scheduled_for)
       VALUES ($1, 'pending', $2)
       RETURNING id, user_id, status, requested_at, scheduled_for, completed_at, cancelled_at`,
      [userId, scheduledFor]
    );

    const row = result.rows[0];
    const deletionRequest: DeletionRequest = {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      requestedAt: row.requested_at,
      scheduledFor: row.scheduled_for,
      completedAt: row.completed_at || undefined,
      cancelledAt: row.cancelled_at || undefined,
    };

    // Deactivate the user account immediately
    await this.db.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    return {
      success: true,
      deletionRequest,
      message: `Account scheduled for deletion on ${scheduledFor.toISOString().split('T')[0]}. You have ${DataRetentionService.GRACE_PERIOD_DAYS} days to cancel this request.`,
    };
  }

  /**
   * Execute account deletion for a user.
   * Anonymizes user data and deletes related records.
   *
   * @param userId - The ID of the user to delete
   * @returns DeletionExecutionResult with deletion statistics
   * @throws Error if user not found
   */
  async executeAccountDeletion(userId: string): Promise<DeletionExecutionResult> {
    // Verify user exists
    const userCheck = await this.db.query(
      'SELECT id, email FROM users WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      throw new Error('User not found');
    }

    // Generate anonymized values
    const anonymizedSuffix = crypto.randomBytes(8).toString('hex');
    const anonymizedEmail = `deleted_${anonymizedSuffix}@deleted.local`;
    const anonymizedUsername = `deleted_user_${anonymizedSuffix}`;

    // Start tracking deletions
    let deletedNotifications = 0;
    let deletedFollows = 0;
    let deletedWishlists = 0;
    let revokedTokens = 0;

    // 1. Delete notifications (both received and sent)
    const notificationResult = await this.db.query(
      'DELETE FROM notifications WHERE user_id = $1 OR from_user_id = $1',
      [userId]
    );
    deletedNotifications = notificationResult.rowCount || 0;

    // 2. Delete follows (both directions)
    const followsResult = await this.db.query(
      'DELETE FROM user_followers WHERE follower_id = $1 OR following_id = $1',
      [userId]
    );
    deletedFollows = followsResult.rowCount || 0;

    // 3. Delete wishlists
    const wishlistResult = await this.db.query(
      'DELETE FROM user_wishlist WHERE user_id = $1',
      [userId]
    );
    deletedWishlists = wishlistResult.rowCount || 0;

    // 4. Revoke all refresh tokens
    const tokenResult = await this.db.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
    revokedTokens = tokenResult.rowCount || 0;

    // 5. Anonymize user profile data
    await this.db.query(
      `UPDATE users SET
         email = $2,
         username = $3,
         password_hash = 'DELETED',
         first_name = NULL,
         last_name = NULL,
         bio = NULL,
         profile_image_url = NULL,
         location = NULL,
         date_of_birth = NULL,
         is_active = false,
         updated_at = NOW()
       WHERE id = $1`,
      [userId, anonymizedEmail, anonymizedUsername]
    );

    // 6. Update deletion request status to completed
    await this.db.query(
      `UPDATE deletion_requests
       SET status = 'completed', completed_at = NOW()
       WHERE user_id = $1 AND status IN ('pending', 'processing')`,
      [userId]
    );

    return {
      success: true,
      userId,
      anonymizedEmail,
      deletedNotifications,
      deletedFollows,
      deletedWishlists,
      revokedTokens,
    };
  }

  /**
   * Cancel a pending deletion request.
   * Reactivates the user account.
   *
   * @param userId - The ID of the user cancelling deletion
   * @returns The cancelled deletion request
   * @throws Error if no pending request found
   */
  async cancelDeletionRequest(userId: string): Promise<DeletionRequest> {
    // Find pending deletion request
    const existingRequest = await this.db.query(
      `SELECT id FROM deletion_requests
       WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );

    if (existingRequest.rows.length === 0) {
      throw new Error('No pending deletion request found');
    }

    // Cancel the deletion request
    const result = await this.db.query(
      `UPDATE deletion_requests
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE user_id = $1 AND status = 'pending'
       RETURNING id, user_id, status, requested_at, scheduled_for, completed_at, cancelled_at`,
      [userId]
    );

    // Reactivate the user account
    await this.db.query(
      'UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      requestedAt: row.requested_at,
      scheduledFor: row.scheduled_for,
      completedAt: row.completed_at || undefined,
      cancelledAt: row.cancelled_at || undefined,
    };
  }

  /**
   * Get all pending deletion requests that are ready to process.
   * Returns requests where scheduled_for date has passed.
   *
   * @returns Array of deletion requests ready for processing
   */
  async getPendingDeletions(): Promise<DeletionRequest[]> {
    const result = await this.db.query(
      `SELECT id, user_id, status, requested_at, scheduled_for, completed_at, cancelled_at
       FROM deletion_requests
       WHERE status = 'pending' AND scheduled_for <= NOW()
       ORDER BY scheduled_for ASC`
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      status: row.status as DeletionStatus,
      requestedAt: row.requested_at,
      scheduledFor: row.scheduled_for,
      completedAt: row.completed_at || undefined,
      cancelledAt: row.cancelled_at || undefined,
    }));
  }

  /**
   * Process all pending deletions that are ready.
   * This method is intended to be called by a scheduled job.
   *
   * @returns Summary of processed deletions
   */
  async processPendingDeletions(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    const pendingDeletions = await this.getPendingDeletions();
    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const deletion of pendingDeletions) {
      try {
        // Mark as processing
        await this.db.query(
          `UPDATE deletion_requests SET status = 'processing' WHERE id = $1`,
          [deletion.id]
        );

        // Execute deletion
        await this.executeAccountDeletion(deletion.userId);
        succeeded++;
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ userId: deletion.userId, error: errorMessage });

        // Revert status to pending on failure
        await this.db.query(
          `UPDATE deletion_requests SET status = 'pending' WHERE id = $1`,
          [deletion.id]
        );

        console.error(`Failed to process deletion for user ${deletion.userId}:`, error);
      }
    }

    return {
      processed: pendingDeletions.length,
      succeeded,
      failed,
      errors,
    };
  }

  /**
   * Get deletion request status for a user.
   *
   * @param userId - The ID of the user
   * @returns The most recent deletion request or null if none exists
   */
  async getDeletionRequestStatus(userId: string): Promise<DeletionRequest | null> {
    const result = await this.db.query(
      `SELECT id, user_id, status, requested_at, scheduled_for, completed_at, cancelled_at
       FROM deletion_requests
       WHERE user_id = $1
       ORDER BY requested_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status as DeletionStatus,
      requestedAt: row.requested_at,
      scheduledFor: row.scheduled_for,
      completedAt: row.completed_at || undefined,
      cancelledAt: row.cancelled_at || undefined,
    };
  }
}
