import { SubscriptionService } from '../../services/SubscriptionService';
import Database from '../../config/database';

// Mock dependencies
jest.mock('../../config/database');

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: mockLogger,
  logError: jest.fn(),
  logWarn: jest.fn(),
  logInfo: jest.fn(),
  logHttp: jest.fn(),
  logDebug: jest.fn(),
}));

const mockDb = {
  query: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService;

  beforeEach(() => {
    subscriptionService = new SubscriptionService();
    jest.clearAllMocks();
    // Reset logger mocks
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });

  describe('processWebhookEvent', () => {
    const mockEvent = {
      id: 'evt-123',
      type: 'INITIAL_PURCHASE',
      app_user_id: 'user-456',
    };

    it('should process INITIAL_PURCHASE event and grant premium', async () => {
      // Idempotency check - not processed yet
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // idempotency check
        .mockResolvedValueOnce({ rows: [{ id: 'user-456' }] }) // user exists
        .mockResolvedValueOnce({ rows: [] }); // mark as processed

      const result = await subscriptionService.processWebhookEvent(mockEvent);

      expect(result.processed).toBe(true);
      expect(result.reason).toBe('OK');
      // Should grant premium
      expect(mockDb.query).toHaveBeenCalledWith('UPDATE users SET is_premium = $2 WHERE id = $1', [
        'user-456',
        true,
      ]);
    });

    it('should process RENEWAL event and maintain premium', async () => {
      const renewalEvent = { ...mockEvent, type: 'RENEWAL' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-456' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.processWebhookEvent(renewalEvent);

      expect(result.processed).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith('UPDATE users SET is_premium = $2 WHERE id = $1', [
        'user-456',
        true,
      ]);
    });

    it('should process UNCANCELLATION event and re-grant premium', async () => {
      const uncancelEvent = { ...mockEvent, type: 'UNCANCELLATION' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-456' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.processWebhookEvent(uncancelEvent);

      expect(result.processed).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith('UPDATE users SET is_premium = $2 WHERE id = $1', [
        'user-456',
        true,
      ]);
    });

    it('should process EXPIRATION event and revoke premium', async () => {
      const expirationEvent = { ...mockEvent, type: 'EXPIRATION' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-456' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.processWebhookEvent(expirationEvent);

      expect(result.processed).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith('UPDATE users SET is_premium = $2 WHERE id = $1', [
        'user-456',
        false,
      ]);
    });

    it('should handle CANCELLATION without immediate revocation (grace period)', async () => {
      const cancelEvent = { ...mockEvent, type: 'CANCELLATION' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-456' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.processWebhookEvent(cancelEvent);

      expect(result.processed).toBe(true);
      // Should NOT update is_premium - user keeps access until expiration
      const updateCalls = mockDb.query.mock.calls.filter((call: any[]) =>
        call[0].includes('UPDATE users SET is_premium')
      );
      expect(updateCalls).toHaveLength(0);
    });

    it('should skip already processed events (idempotency)', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ event_id: 'evt-123' }] });

      const result = await subscriptionService.processWebhookEvent(mockEvent);

      expect(result.processed).toBe(false);
      expect(result.reason).toBe('Already processed');
      // Should only query for idempotency, nothing else
      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT event_id FROM processed_webhook_events WHERE event_id = $1',
        ['evt-123']
      );
    });

    it('should handle user not found', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // not processed yet
        .mockResolvedValueOnce({ rows: [] }); // user not found

      const result = await subscriptionService.processWebhookEvent(mockEvent);

      expect(result.processed).toBe(false);
      expect(result.reason).toBe('User not found');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'SubscriptionService: User not found for app_user_id=user-456'
      );
    });

    it('should handle TEST event type', async () => {
      const testEvent = { ...mockEvent, type: 'TEST' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-456' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.processWebhookEvent(testEvent);

      expect(result.processed).toBe(true);
      expect(result.reason).toBe('OK');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'SubscriptionService: Received TEST event evt-123'
      );
    });

    it('should handle unknown event types gracefully', async () => {
      const unknownEvent = { ...mockEvent, type: 'UNKNOWN_EVENT' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-456' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.processWebhookEvent(unknownEvent);

      expect(result.processed).toBe(true);
      expect(result.reason).toBe('OK');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'SubscriptionService: Unknown event type: UNKNOWN_EVENT'
      );
    });

    it('should mark event as processed after handling', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-456' }] })
        .mockResolvedValueOnce({ rows: [] });

      await subscriptionService.processWebhookEvent(mockEvent);

      expect(mockDb.query).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO processed_webhook_events'),
        ['evt-123', 'INITIAL_PURCHASE', 'user-456']
      );
    });

    it('should use ON CONFLICT for race condition safety', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-456' }] })
        .mockResolvedValueOnce({ rows: [] });

      await subscriptionService.processWebhookEvent(mockEvent);

      const lastCall = mockDb.query.mock.calls[mockDb.query.mock.calls.length - 1];
      expect(lastCall[0]).toContain('ON CONFLICT (event_id) DO NOTHING');
    });
  });

  describe('getSubscriptionStatus', () => {
    it('should return isPremium true for premium user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ is_premium: true }] });

      const result = await subscriptionService.getSubscriptionStatus('user-premium');

      expect(result.isPremium).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith('SELECT is_premium FROM users WHERE id = $1', [
        'user-premium',
      ]);
    });

    it('should return isPremium false for non-premium user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ is_premium: false }] });

      const result = await subscriptionService.getSubscriptionStatus('user-basic');

      expect(result.isPremium).toBe(false);
    });

    it('should return isPremium false for non-existent user', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.getSubscriptionStatus('user-nonexistent');

      expect(result.isPremium).toBe(false);
    });

    it('should handle null is_premium value', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ is_premium: null }] });

      const result = await subscriptionService.getSubscriptionStatus('user-null');

      expect(result.isPremium).toBe(false);
    });
  });

  describe('setUserPremium', () => {
    it('should grant premium status', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await subscriptionService.setUserPremium('user-123', true);

      expect(mockDb.query).toHaveBeenCalledWith('UPDATE users SET is_premium = $2 WHERE id = $1', [
        'user-123',
        true,
      ]);
    });

    it('should revoke premium status', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await subscriptionService.setUserPremium('user-123', false);

      expect(mockDb.query).toHaveBeenCalledWith('UPDATE users SET is_premium = $2 WHERE id = $1', [
        'user-123',
        false,
      ]);
    });
  });

  describe('Revenue Protection', () => {
    it('should handle multiple event types in sequence', async () => {
      // Initial purchase
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // idempotency
        .mockResolvedValueOnce({ rows: [{ id: 'user-789' }] }) // user exists
        .mockResolvedValueOnce({ rows: [] }); // mark processed

      await subscriptionService.processWebhookEvent({
        id: 'evt-1',
        type: 'INITIAL_PURCHASE',
        app_user_id: 'user-789',
      });

      expect(mockDb.query).toHaveBeenCalledWith('UPDATE users SET is_premium = $2 WHERE id = $1', [
        'user-789',
        true,
      ]);

      // Clear mocks for next event
      jest.clearAllMocks();

      // Then cancellation (should not revoke)
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-789' }] })
        .mockResolvedValueOnce({ rows: [] });

      await subscriptionService.processWebhookEvent({
        id: 'evt-2',
        type: 'CANCELLATION',
        app_user_id: 'user-789',
      });

      // Should NOT have called update for premium
      const updateCalls = mockDb.query.mock.calls.filter((call: any[]) =>
        call[0]?.includes('UPDATE users SET is_premium')
      );
      expect(updateCalls).toHaveLength(0);

      // Clear mocks for next event
      jest.clearAllMocks();

      // Then expiration (should revoke)
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-789' }] })
        .mockResolvedValueOnce({ rows: [] });

      await subscriptionService.processWebhookEvent({
        id: 'evt-3',
        type: 'EXPIRATION',
        app_user_id: 'user-789',
      });

      expect(mockDb.query).toHaveBeenCalledWith('UPDATE users SET is_premium = $2 WHERE id = $1', [
        'user-789',
        false,
      ]);
    });

    it('should handle uncancellation after cancellation', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-abc' }] })
        .mockResolvedValueOnce({ rows: [] });

      await subscriptionService.processWebhookEvent({
        id: 'evt-uncancel',
        type: 'UNCANCELLATION',
        app_user_id: 'user-abc',
      });

      expect(mockDb.query).toHaveBeenCalledWith('UPDATE users SET is_premium = $2 WHERE id = $1', [
        'user-abc',
        true,
      ]);
    });

    it('should ensure idempotency with concurrent event processing', async () => {
      // Simulate race condition - first call succeeds
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-race' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result1 = await subscriptionService.processWebhookEvent({
        id: 'evt-race',
        type: 'INITIAL_PURCHASE',
        app_user_id: 'user-race',
      });

      expect(result1.processed).toBe(true);

      // Simulate second concurrent call - event already processed
      jest.clearAllMocks();
      mockDb.query.mockResolvedValueOnce({ rows: [{ event_id: 'evt-race' }] });

      const result2 = await subscriptionService.processWebhookEvent({
        id: 'evt-race',
        type: 'INITIAL_PURCHASE',
        app_user_id: 'user-race',
      });

      expect(result2.processed).toBe(false);
      expect(result2.reason).toBe('Already processed');
    });
  });

  describe('Webhook Event Structure', () => {
    it('should handle event with minimal fields', async () => {
      const minimalEvent = {
        id: 'evt-min',
        type: 'TEST',
        app_user_id: 'user-min',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-min' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.processWebhookEvent(minimalEvent);

      expect(result.processed).toBe(true);
    });

    it('should handle different user IDs correctly', async () => {
      const users = ['user-a', 'user-b', 'user-c'];

      for (const userId of users) {
        jest.clearAllMocks();
        mockDb.query
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ id: userId }] })
          .mockResolvedValueOnce({ rows: [] });

        await subscriptionService.processWebhookEvent({
          id: `evt-${userId}`,
          type: 'INITIAL_PURCHASE',
          app_user_id: userId,
        });

        expect(mockDb.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE users SET is_premium'),
          [userId, true]
        );
      }
    });

    it('should handle special characters in user IDs', async () => {
      const specialUserId = 'user_123-abc.xyz';
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: specialUserId }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await subscriptionService.processWebhookEvent({
        id: 'evt-special',
        type: 'INITIAL_PURCHASE',
        app_user_id: specialUserId,
      });

      expect(result.processed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should propagate database errors during premium update', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-err' }] })
        .mockRejectedValueOnce(dbError);

      await expect(
        subscriptionService.processWebhookEvent({
          id: 'evt-err',
          type: 'INITIAL_PURCHASE',
          app_user_id: 'user-err',
        })
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle error during idempotency check', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Query timeout'));

      await expect(
        subscriptionService.processWebhookEvent({
          id: 'evt-err',
          type: 'INITIAL_PURCHASE',
          app_user_id: 'user-err',
        })
      ).rejects.toThrow('Query timeout');
    });

    it('should handle error when marking event processed', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'user-err' }] })
        .mockRejectedValueOnce(new Error('Insert failed'));

      await expect(
        subscriptionService.processWebhookEvent({
          id: 'evt-err',
          type: 'INITIAL_PURCHASE',
          app_user_id: 'user-err',
        })
      ).rejects.toThrow('Insert failed');
    });
  });
});
