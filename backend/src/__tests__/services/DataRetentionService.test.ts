import { DataRetentionService, DeletionRequest, DeletionStatus } from '../../services/DataRetentionService';
import Database from '../../config/database';

// Mock dependencies
jest.mock('../../config/database');

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn().mockResolvedValue(mockClient),
};

const mockDb = {
  query: jest.fn(),
  getPool: jest.fn().mockReturnValue(mockPool),
  getClient: jest.fn().mockResolvedValue(mockClient),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('DataRetentionService', () => {
  let dataRetentionService: DataRetentionService;

  beforeEach(() => {
    dataRetentionService = new DataRetentionService();
    jest.clearAllMocks();
    // Reset pool mock to return client
    mockPool.connect.mockResolvedValue(mockClient);
  });

  describe('requestAccountDeletion', () => {
    it('should create a deletion request with 30-day grace period', async () => {
      const userId = 'user-123';
      const now = new Date();
      const expectedScheduledDate = new Date(now);
      expectedScheduledDate.setDate(expectedScheduledDate.getDate() + 30);

      // Mock user exists
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: userId, is_active: true }] }) // User check
        .mockResolvedValueOnce({ rows: [] }) // No existing request
        .mockResolvedValueOnce({
          rows: [{
            id: 'request-123',
            user_id: userId,
            status: 'pending',
            requested_at: now,
            scheduled_for: expectedScheduledDate,
            completed_at: null,
            cancelled_at: null,
          }],
        }) // Insert request
        .mockResolvedValueOnce({ rowCount: 1 }); // Deactivate user

      const result = await dataRetentionService.requestAccountDeletion(userId);

      expect(result.success).toBe(true);
      expect(result.deletionRequest.userId).toBe(userId);
      expect(result.deletionRequest.status).toBe('pending');
      expect(result.message).toContain('30 days');

      // Verify user was deactivated
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET is_active = false'),
        [userId]
      );
    });

    it('should throw error if user not found', async () => {
      const userId = 'non-existent-user';

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(dataRetentionService.requestAccountDeletion(userId))
        .rejects.toThrow('User not found');
    });

    it('should throw error if pending request already exists', async () => {
      const userId = 'user-123';

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: userId, is_active: true }] }) // User exists
        .mockResolvedValueOnce({
          rows: [{
            id: 'existing-request',
            status: 'pending',
            scheduled_for: new Date(),
          }],
        }); // Existing request

      await expect(dataRetentionService.requestAccountDeletion(userId))
        .rejects.toThrow('A pending deletion request already exists');
    });
  });

  describe('executeAccountDeletion', () => {
    it('should anonymize user data and delete related records using a transaction', async () => {
      const userId = 'user-123';
      const originalEmail = 'test@example.com';

      // User check (outside transaction)
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: originalEmail }] });

      // Transaction queries (on client)
      // DB-010: includes new DELETE statements for badges, ratings, toasts, comments, social accounts, consents
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 5 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 10 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 3 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 2 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 1 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 4 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 3 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 1 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 2 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 2 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 4 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      const result = await dataRetentionService.executeAccountDeletion(userId);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);
      expect(result.anonymizedEmail).toMatch(/^deleted_[a-f0-9]+@deleted\.local$/);
      expect(result.deletedNotifications).toBe(5);
      expect(result.deletedFollows).toBe(10);
      expect(result.deletedWishlists).toBe(3);
      expect(result.revokedTokens).toBe(2);
      expect(result.anonymizedCheckinPhotos).toBe(4);

      // Verify transaction was used
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should anonymize email with unique suffix', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: 'test@example.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      const result = await dataRetentionService.executeAccountDeletion(userId);

      // Verify anonymized email format
      expect(result.anonymizedEmail).toMatch(/^deleted_[a-f0-9]{16}@deleted\.local$/);
    });

    it('should throw error if user not found', async () => {
      const userId = 'non-existent-user';

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(dataRetentionService.executeAccountDeletion(userId))
        .rejects.toThrow('User not found');
    });

    it('should delete notifications both received and sent', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: 'test@example.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 8 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      await dataRetentionService.executeAccountDeletion(userId);

      // Verify notification deletion query includes both directions
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('user_id = $1 OR from_user_id = $1'),
        [userId]
      );
    });

    it('should delete follows in both directions', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: 'test@example.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 15 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      await dataRetentionService.executeAccountDeletion(userId);

      // Verify follows deletion includes both directions
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('follower_id = $1 OR following_id = $1'),
        [userId]
      );
    });

    it('should revoke all active refresh tokens', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: 'test@example.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 5 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      const result = await dataRetentionService.executeAccountDeletion(userId);

      expect(result.revokedTokens).toBe(5);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens'),
        [userId]
      );
    });

    it('should set password_hash to DELETED', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: 'test@example.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      await dataRetentionService.executeAccountDeletion(userId);

      // Verify password_hash is set to 'DELETED'
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("password_hash = 'DELETED'"),
        expect.any(Array)
      );
    });

    it('should nullify personal profile fields', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: 'test@example.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      await dataRetentionService.executeAccountDeletion(userId);

      // Verify personal fields are nullified
      const anonymizeCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('first_name = NULL') &&
        call[0].includes('last_name = NULL') &&
        call[0].includes('bio = NULL') &&
        call[0].includes('profile_image_url = NULL') &&
        call[0].includes('location = NULL') &&
        call[0].includes('date_of_birth = NULL')
      );
      expect(anonymizeCall).toBeDefined();
    });

    it('should anonymize check-in photos', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: 'test@example.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 7 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      const result = await dataRetentionService.executeAccountDeletion(userId);

      expect(result.anonymizedCheckinPhotos).toBe(7);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE checkins SET photo_url = NULL WHERE user_id = $1'),
        [userId]
      );
    });

    it('should set is_verified to false', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: 'test@example.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      await dataRetentionService.executeAccountDeletion(userId);

      // Verify is_verified is set to false
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('is_verified = false'),
        expect.any(Array)
      );
    });

    it('should rollback transaction on error', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: 'test@example.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete notifications
        .mockRejectedValueOnce(new Error('Database error')); // Delete follows fails

      await expect(dataRetentionService.executeAccountDeletion(userId))
        .rejects.toThrow('Database error');

      // Verify rollback was called
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('cancelDeletionRequest', () => {
    it('should cancel pending deletion and reactivate account', async () => {
      const userId = 'user-123';
      const now = new Date();

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'request-123' }],
        }) // Find pending request
        .mockResolvedValueOnce({
          rows: [{
            id: 'request-123',
            user_id: userId,
            status: 'cancelled',
            requested_at: now,
            scheduled_for: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            completed_at: null,
            cancelled_at: now,
          }],
        }) // Cancel request
        .mockResolvedValueOnce({ rowCount: 1 }); // Reactivate user

      const result = await dataRetentionService.cancelDeletionRequest(userId);

      expect(result.status).toBe('cancelled');
      expect(result.cancelledAt).toBeDefined();

      // Verify user was reactivated
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET is_active = true'),
        [userId]
      );
    });

    it('should throw error if no pending request found', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(dataRetentionService.cancelDeletionRequest(userId))
        .rejects.toThrow('No pending deletion request found');
    });
  });

  describe('getPendingDeletions', () => {
    it('should return deletions ready for processing', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Yesterday

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'request-1',
            user_id: 'user-1',
            status: 'pending',
            requested_at: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
            scheduled_for: pastDate,
            completed_at: null,
            cancelled_at: null,
          },
          {
            id: 'request-2',
            user_id: 'user-2',
            status: 'pending',
            requested_at: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
            scheduled_for: pastDate,
            completed_at: null,
            cancelled_at: null,
          },
        ],
      });

      const result = await dataRetentionService.getPendingDeletions();

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe('user-1');
      expect(result[1].userId).toBe('user-2');
      expect(result[0].status).toBe('pending');
    });

    it('should return empty array if no pending deletions', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await dataRetentionService.getPendingDeletions();

      expect(result).toHaveLength(0);
    });

    it('should only return deletions where scheduled_for has passed', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await dataRetentionService.getPendingDeletions();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'pending' AND scheduled_for <= NOW()")
      );
    });
  });

  describe('processPendingDeletions', () => {
    it('should process all pending deletions successfully', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Mock getPendingDeletions
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'request-1',
              user_id: 'user-1',
              status: 'pending',
              requested_at: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
              scheduled_for: pastDate,
              completed_at: null,
              cancelled_at: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1 }) // Mark as processing
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', email: 'test1@example.com' }] }); // User check

      // Transaction queries (on client) - includes DB-010 cleanup steps
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 2 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 3 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 1 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 1 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      const result = await dataRetentionService.processPendingDeletions();

      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle failures and continue processing', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Mock getPendingDeletions
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'request-1',
              user_id: 'user-1',
              status: 'pending',
              requested_at: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
              scheduled_for: pastDate,
              completed_at: null,
              cancelled_at: null,
            },
            {
              id: 'request-2',
              user_id: 'user-2',
              status: 'pending',
              requested_at: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
              scheduled_for: pastDate,
              completed_at: null,
              cancelled_at: null,
            },
          ],
        })
        // First deletion fails
        .mockResolvedValueOnce({ rowCount: 1 }) // Mark as processing
        .mockResolvedValueOnce({ rows: [] }) // User not found - will throw
        .mockResolvedValueOnce({ rowCount: 1 }) // Revert status
        // Second deletion succeeds
        .mockResolvedValueOnce({ rowCount: 1 }) // Mark as processing
        .mockResolvedValueOnce({ rows: [{ id: 'user-2', email: 'test2@example.com' }] }); // User check

      // Transaction queries for second deletion (on client) - includes DB-010 cleanup steps
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 2 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 3 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 1 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 1 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      const result = await dataRetentionService.processPendingDeletions();

      expect(result.processed).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].userId).toBe('user-1');
    });

    it('should revert status to pending on failure', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'request-1',
            user_id: 'user-1',
            status: 'pending',
            requested_at: new Date(pastDate.getTime() - 30 * 24 * 60 * 60 * 1000),
            scheduled_for: pastDate,
            completed_at: null,
            cancelled_at: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 1 }) // Mark as processing
        .mockResolvedValueOnce({ rows: [] }) // User not found
        .mockResolvedValueOnce({ rowCount: 1 }); // Revert status

      await dataRetentionService.processPendingDeletions();

      // Verify status was reverted
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE deletion_requests SET status = 'pending'"),
        ['request-1']
      );
    });

    it('should return empty result when no pending deletions', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await dataRetentionService.processPendingDeletions();

      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getDeletionRequestStatus', () => {
    it('should return the most recent deletion request', async () => {
      const userId = 'user-123';
      const now = new Date();

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'request-123',
          user_id: userId,
          status: 'pending',
          requested_at: now,
          scheduled_for: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          completed_at: null,
          cancelled_at: null,
        }],
      });

      const result = await dataRetentionService.getDeletionRequestStatus(userId);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe(userId);
      expect(result?.status).toBe('pending');
    });

    it('should return null if no deletion request exists', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await dataRetentionService.getDeletionRequestStatus(userId);

      expect(result).toBeNull();
    });

    it('should return completed request if deletion was executed', async () => {
      const userId = 'user-123';
      const now = new Date();
      const completedAt = new Date();

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'request-123',
          user_id: userId,
          status: 'completed',
          requested_at: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
          scheduled_for: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          completed_at: completedAt,
          cancelled_at: null,
        }],
      });

      const result = await dataRetentionService.getDeletionRequestStatus(userId);

      expect(result).not.toBeNull();
      expect(result?.status).toBe('completed');
      expect(result?.completedAt).toBeDefined();
    });

    it('should return cancelled request if deletion was cancelled', async () => {
      const userId = 'user-123';
      const now = new Date();
      const cancelledAt = new Date();

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'request-123',
          user_id: userId,
          status: 'cancelled',
          requested_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          scheduled_for: new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000),
          completed_at: null,
          cancelled_at: cancelledAt,
        }],
      });

      const result = await dataRetentionService.getDeletionRequestStatus(userId);

      expect(result).not.toBeNull();
      expect(result?.status).toBe('cancelled');
      expect(result?.cancelledAt).toBeDefined();
    });
  });

  describe('GDPR compliance', () => {
    it('should anonymize all PII fields', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: 'personal@email.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      await dataRetentionService.executeAccountDeletion(userId);

      // Verify all PII fields are anonymized or nullified
      const updateCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE users SET')
      );

      expect(updateCall).toBeDefined();
      expect(updateCall[0]).toContain('email =');
      expect(updateCall[0]).toContain('username =');
      expect(updateCall[0]).toContain("password_hash = 'DELETED'");
      expect(updateCall[0]).toContain('first_name = NULL');
      expect(updateCall[0]).toContain('last_name = NULL');
      expect(updateCall[0]).toContain('bio = NULL');
      expect(updateCall[0]).toContain('profile_image_url = NULL');
      expect(updateCall[0]).toContain('location = NULL');
      expect(updateCall[0]).toContain('date_of_birth = NULL');
    });

    it('should use unique anonymized identifiers', async () => {
      const userId = 'user-123';

      mockDb.query.mockResolvedValueOnce({ rows: [{ id: userId, email: 'test@example.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      const result1 = await dataRetentionService.executeAccountDeletion(userId);

      // Reset mocks for second call
      jest.clearAllMocks();
      mockPool.connect.mockResolvedValue(mockClient);
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'user-456', email: 'another@example.com' }] });
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete notifications
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete follows
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete wishlists
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete user badges (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete band ratings (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete toasts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete comments (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete social accounts (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Delete consents (DB-010)
        .mockResolvedValueOnce({ rowCount: 0 }) // Revoke tokens
        .mockResolvedValueOnce({ rowCount: 0 }) // Anonymize check-in photos
        .mockResolvedValueOnce({ rowCount: 1 }) // Anonymize user
        .mockResolvedValueOnce({ rowCount: 1 }) // Update deletion request
        .mockResolvedValueOnce({}); // COMMIT

      const result2 = await dataRetentionService.executeAccountDeletion('user-456');

      // Verify unique suffixes
      expect(result1.anonymizedEmail).not.toBe(result2.anonymizedEmail);
    });

    it('should provide 30-day grace period before deletion', async () => {
      const userId = 'user-123';
      const now = new Date();

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: userId, is_active: true }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'request-123',
            user_id: userId,
            status: 'pending',
            requested_at: now,
            scheduled_for: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            completed_at: null,
            cancelled_at: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await dataRetentionService.requestAccountDeletion(userId);

      // Verify scheduled_for is approximately 30 days from now
      const scheduledDate = new Date(result.deletionRequest.scheduledFor);
      const daysDifference = Math.round((scheduledDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      expect(daysDifference).toBeGreaterThanOrEqual(29);
      expect(daysDifference).toBeLessThanOrEqual(31);
    });

    it('should allow cancellation within grace period', async () => {
      const userId = 'user-123';
      const now = new Date();

      // Request deletion
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: userId, is_active: true }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'request-123',
            user_id: userId,
            status: 'pending',
            requested_at: now,
            scheduled_for: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            completed_at: null,
            cancelled_at: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 1 });

      await dataRetentionService.requestAccountDeletion(userId);

      // Reset mocks for cancellation
      jest.clearAllMocks();
      mockPool.connect.mockResolvedValue(mockClient);
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'request-123' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'request-123',
            user_id: userId,
            status: 'cancelled',
            requested_at: now,
            scheduled_for: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            completed_at: null,
            cancelled_at: now,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 1 });

      const cancelResult = await dataRetentionService.cancelDeletionRequest(userId);

      expect(cancelResult.status).toBe('cancelled');
    });
  });
});
