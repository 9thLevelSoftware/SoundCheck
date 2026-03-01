import Database from '../config/database';
import logger from '../utils/logger';

interface WebhookEvent {
  id: string;
  type: string;
  app_user_id: string;
}

export class SubscriptionService {
  private db = Database.getInstance();

  /**
   * Process a RevenueCat webhook event idempotently.
   * Returns whether the event was processed and the reason.
   */
  async processWebhookEvent(event: WebhookEvent): Promise<{ processed: boolean; reason: string }> {
    // 1. Idempotency check: skip already-processed events
    const existing = await this.db.query(
      'SELECT event_id FROM processed_webhook_events WHERE event_id = $1',
      [event.id]
    );
    if (existing.rows.length > 0) {
      return { processed: false, reason: 'Already processed' };
    }

    // 2. Resolve user by app_user_id (set via Purchases.logIn(userId) on mobile)
    const userResult = await this.db.query(
      'SELECT id FROM users WHERE id = $1',
      [event.app_user_id]
    );
    if (userResult.rows.length === 0) {
      logger.warn(`SubscriptionService: User not found for app_user_id=${event.app_user_id}`);
      return { processed: false, reason: 'User not found' };
    }

    // 3. Process based on event type
    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
        await this.setUserPremium(event.app_user_id, true);
        break;
      case 'EXPIRATION':
        await this.setUserPremium(event.app_user_id, false);
        break;
      case 'CANCELLATION':
        // User still has access until expiration_at_ms
        // Don't revoke immediately -- wait for EXPIRATION event
        break;
      case 'TEST':
        // RevenueCat test event -- just log and mark processed
        logger.info(`SubscriptionService: Received TEST event ${event.id}`);
        break;
      default:
        // Unknown event type -- log but don't fail
        logger.warn(`SubscriptionService: Unknown event type: ${event.type}`);
    }

    // 4. Mark event as processed (ON CONFLICT for race condition safety)
    await this.db.query(
      `INSERT INTO processed_webhook_events (event_id, event_type, app_user_id)
       VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING`,
      [event.id, event.type, event.app_user_id]
    );

    return { processed: true, reason: 'OK' };
  }

  /**
   * Set a user's premium status.
   */
  async setUserPremium(userId: string, isPremium: boolean): Promise<void> {
    await this.db.query(
      'UPDATE users SET is_premium = $2 WHERE id = $1',
      [userId, isPremium]
    );
  }

  /**
   * Get a user's current subscription status.
   */
  async getSubscriptionStatus(userId: string): Promise<{ isPremium: boolean }> {
    const result = await this.db.query(
      'SELECT is_premium FROM users WHERE id = $1',
      [userId]
    );
    return { isPremium: result.rows[0]?.is_premium ?? false };
  }
}
