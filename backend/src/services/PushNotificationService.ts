/**
 * Push Notification Service using Firebase Cloud Messaging (FCM)
 *
 * Handles:
 * - FCM message sending (single user, multicast to all user devices)
 * - Device token management (register, remove, stale token cleanup)
 * - Graceful degradation when Firebase is not configured
 *
 * Phase 5: Social Feed & Real-time (Plan 2)
 */

import Database from '../config/database';
import logger from '../utils/logger';

// Firebase Admin SDK - imported dynamically to allow graceful degradation
let firebaseAdmin: any = null;
let messagingInstance: any = null;
let isConfigured = false;

try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const admin = require('firebase-admin');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

    // Only initialize if not already initialized
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    firebaseAdmin = admin;
    messagingInstance = admin.messaging();
    isConfigured = true;
    logger.info('[PushNotificationService] Firebase Admin initialized for FCM');
  } else {
    logger.warn('[PushNotificationService] FIREBASE_SERVICE_ACCOUNT_JSON not set. Push notifications disabled.');
  }
} catch (err) {
  logger.error('[PushNotificationService] Failed to initialize Firebase Admin', { error: (err as Error).message });
  isConfigured = false;
}

export class PushNotificationService {
  private db = Database.getInstance();

  /**
   * Check if push notifications are configured and available.
   */
  get isAvailable(): boolean {
    return isConfigured;
  }

  /**
   * Send a push notification to all devices of a specific user.
   *
   * Handles stale token cleanup: if FCM returns
   * 'messaging/registration-token-not-registered', the token is removed.
   */
  async sendToUser(
    userId: string,
    notification: { title: string; body: string; data?: Record<string, string> }
  ): Promise<void> {
    if (!isConfigured || !messagingInstance) return;

    try {
      const tokens = await this.getDeviceTokens(userId);
      if (tokens.length === 0) return;

      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data || {},
        tokens,
      };

      const response = await messagingInstance.sendEachForMulticast(message);

      // Clean up invalid/stale tokens
      if (response.failureCount > 0) {
        const tokensToRemove: string[] = [];
        response.responses.forEach((resp: any, idx: number) => {
          if (
            !resp.success &&
            resp.error?.code === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove.push(tokens[idx]);
          }
        });
        if (tokensToRemove.length > 0) {
          await this.removeDeviceTokens(userId, tokensToRemove);
          logger.info(`[PushNotificationService] Removed ${tokensToRemove.length} stale token(s) for user ${userId}`);
        }
      }
    } catch (error) {
      logger.error('[PushNotificationService] sendToUser error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      // Non-fatal: notification failure should not propagate
    }
  }

  /**
   * Get all device tokens for a user.
   */
  async getDeviceTokens(userId: string): Promise<string[]> {
    try {
      const result = await this.db.query(
        'SELECT token FROM device_tokens WHERE user_id = $1',
        [userId]
      );
      return result.rows.map((r: any) => r.token);
    } catch (error) {
      logger.error('[PushNotificationService] getDeviceTokens error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      return [];
    }
  }

  /**
   * Register (upsert) a device token for a user.
   * Called on every app launch to keep tokens fresh.
   *
   * ON CONFLICT updates the platform and updated_at timestamp,
   * ensuring the token stays current even if it already exists.
   */
  async registerDeviceToken(
    userId: string,
    token: string,
    platform: string
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO device_tokens (user_id, token, platform)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, token) DO UPDATE SET
           updated_at = CURRENT_TIMESTAMP,
           platform = EXCLUDED.platform`,
        [userId, token, platform]
      );
    } catch (error) {
      logger.error('[PushNotificationService] registerDeviceToken error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Remove multiple device tokens for a user (batch stale token cleanup).
   */
  async removeDeviceTokens(userId: string, tokens: string[]): Promise<void> {
    try {
      await this.db.query(
        'DELETE FROM device_tokens WHERE user_id = $1 AND token = ANY($2)',
        [userId, tokens]
      );
    } catch (error) {
      logger.error('[PushNotificationService] removeDeviceTokens error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    }
  }

  /**
   * Remove a single device token for a user (logout/unregister).
   */
  async removeDeviceToken(userId: string, token: string): Promise<void> {
    try {
      await this.db.query(
        'DELETE FROM device_tokens WHERE user_id = $1 AND token = $2',
        [userId, token]
      );
    } catch (error) {
      logger.error('[PushNotificationService] removeDeviceToken error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    }
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();
