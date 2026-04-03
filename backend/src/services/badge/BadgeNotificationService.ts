/**
 * BadgeNotificationService -- Notify users of new badges
 *
 * Extracted from BadgeService as part of P1 service decomposition.
 * Handles:
 *   - Creating persistent notification rows
 *   - Sending real-time WebSocket events
 *   - Batch notification operations
 */

import { NotificationService } from '../NotificationService';
import { sendToUser } from '../../utils/websocket';
import { Badge } from '../../types';
import logger from '../../utils/logger';

export interface NotificationResult {
  badgeId: string;
  userId: string;
  dbNotificationSent: boolean;
  websocketSent: boolean;
  error?: string;
}

export class BadgeNotificationService {
  private notificationService: NotificationService;

  constructor(notificationService?: NotificationService) {
    this.notificationService = notificationService || new NotificationService();
  }

  /**
   * Send notification for a newly earned badge.
   * Sends both:
   *   1. NotificationService.createNotification() -- persistent DB row
   *   2. sendToUser() -- real-time WebSocket event for in-app toast
   */
  async notifyBadgeEarned(userId: string, badge: Badge): Promise<NotificationResult> {
    let dbNotificationSent = false;
    let websocketSent = false;
    let error: string | undefined;

    // a) Create persistent notification row in database
    try {
      await this.notificationService.createNotification({
        userId,
        type: 'badge_earned',
        title: `Badge Earned: ${badge.name}`,
        message: badge.description,
        badgeId: badge.id,
      });
      dbNotificationSent = true;
    } catch (err) {
      logger.error(`[BadgeNotificationService] Notification create failed for badge ${badge.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      error = err instanceof Error ? err.message : 'DB notification failed';
      // Non-fatal -- badge was already awarded
    }

    // b) Send real-time WebSocket event for in-app toast
    try {
      sendToUser(userId, 'badge_earned', {
        badgeId: badge.id,
        badgeName: badge.name,
        badgeColor: badge.color,
        badgeIconUrl: badge.iconUrl,
      });
      websocketSent = true;
    } catch (err) {
      logger.error(`[BadgeNotificationService] WebSocket send failed for badge ${badge.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!error) {
        error = err instanceof Error ? err.message : 'WebSocket notification failed';
      }
      // Non-fatal -- badge was already awarded
    }

    return {
      badgeId: badge.id,
      userId,
      dbNotificationSent,
      websocketSent,
      error,
    };
  }

  /**
   * Send notifications for multiple badges.
   * Returns results for each badge notification.
   */
  async notifyBadgesEarned(userId: string, badges: Badge[]): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const badge of badges) {
      const result = await this.notifyBadgeEarned(userId, badge);
      results.push(result);
    }

    return results;
  }

  /**
   * Send WebSocket-only notification (for real-time updates without DB persistence)
   */
  sendRealtimeNotification(userId: string, badge: Badge): boolean {
    try {
      sendToUser(userId, 'badge_earned', {
        badgeId: badge.id,
        badgeName: badge.name,
        badgeColor: badge.color,
        badgeIconUrl: badge.iconUrl,
      });
      return true;
    } catch (err) {
      logger.error(`[BadgeNotificationService] Realtime notification failed for badge ${badge.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Send database-only notification (for persistent notification without real-time)
   */
  async sendPersistentNotification(userId: string, badge: Badge): Promise<boolean> {
    try {
      await this.notificationService.createNotification({
        userId,
        type: 'badge_earned',
        title: `Badge Earned: ${badge.name}`,
        message: badge.description,
        badgeId: badge.id,
      });
      return true;
    } catch (err) {
      logger.error(`[BadgeNotificationService] Persistent notification failed for badge ${badge.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }
}
