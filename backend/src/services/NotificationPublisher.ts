/**
 * NotificationPublisher Service
 * 
 * Handles WebSocket-based real-time notification publishing.
 * Separated from NotificationService to maintain single responsibility:
 * - NotificationService: Database operations for notifications
 * - NotificationPublisher: WebSocket publishing for real-time updates
 */

import { websocket } from '../utils/websocket';
import logger from '../utils/logger';

export interface WebSocketNotificationPayload {
  type: string;
  title?: string;
  message?: string;
  notificationId?: string;
  checkinId?: string;
  fromUserId?: string;
  badgeId?: string;
  eventId?: string;
  data?: Record<string, any>;
}

export class NotificationPublisher {
  /**
   * Publish a notification to a specific user via WebSocket
   * @param userId - Target user ID
   * @param payload - Notification payload
   */
  publishToUser(userId: string, payload: WebSocketNotificationPayload): void {
    try {
      websocket.sendToUser(userId, 'notification', {
        ...payload,
        timestamp: new Date().toISOString(),
      });
      logger.debug(`[NotificationPublisher] Published notification to user ${userId}`);
    } catch (error) {
      logger.error(`[NotificationPublisher] Failed to publish to user ${userId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Broadcast a notification to multiple users
   * @param userIds - Array of target user IDs
   * @param payload - Notification payload
   */
  publishToUsers(userIds: string[], payload: WebSocketNotificationPayload): void {
    for (const userId of userIds) {
      this.publishToUser(userId, payload);
    }
    logger.debug(`[NotificationPublisher] Broadcast notification to ${userIds.length} users`);
  }

  /**
   * Publish notification for new check-in (to followers)
   * @param followerIds - IDs of users following the check-in author
   * @param checkinId - The new check-in ID
   * @param authorUsername - Username of check-in author
   */
  publishNewCheckin(followerIds: string[], checkinId: string, authorUsername: string): void {
    this.publishToUsers(followerIds, {
      type: 'new_checkin',
      message: `${authorUsername} checked in to a show`,
      checkinId,
    });
  }

  /**
   * Publish badge earned notification
   * @param userId - User who earned the badge
   * @param badgeId - Badge ID
   * @param badgeName - Badge name for display
   */
  publishBadgeEarned(userId: string, badgeId: string, badgeName: string): void {
    this.publishToUser(userId, {
      type: 'badge_earned',
      title: 'Badge Earned!',
      message: `You earned the ${badgeName} badge!`,
      badgeId,
    });
  }

  /**
   * Publish toast received notification
   * @param userId - User who received the toast
   * @param checkinId - Check-in that was toasted
   * @param fromUserId - User who sent the toast
   * @param fromUsername - Username of user who sent the toast
   */
  publishToastReceived(
    userId: string,
    checkinId: string,
    fromUserId: string,
    fromUsername: string
  ): void {
    this.publishToUser(userId, {
      type: 'toast_received',
      title: 'New Toast!',
      message: `${fromUsername} toasted your check-in`,
      checkinId,
      fromUserId,
    });
  }

  /**
   * Publish comment received notification
   * @param userId - User who received the comment
   * @param checkinId - Check-in that was commented on
   * @param fromUserId - User who commented
   * @param fromUsername - Username of commenter
   * @param commentText - Comment text preview
   */
  publishCommentReceived(
    userId: string,
    checkinId: string,
    fromUserId: string,
    fromUsername: string,
    commentText?: string
  ): void {
    this.publishToUser(userId, {
      type: 'comment_received',
      title: 'New Comment',
      message: commentText
        ? `${fromUsername}: ${commentText.substring(0, 100)}`
        : `${fromUsername} commented on your check-in`,
      checkinId,
      fromUserId,
    });
  }

  /**
   * Publish follow received notification
   * @param userId - User who was followed
   * @param fromUserId - User who followed
   * @param fromUsername - Username of follower
   */
  publishFollowReceived(userId: string, fromUserId: string, fromUsername: string): void {
    this.publishToUser(userId, {
      type: 'follow_received',
      title: 'New Follower',
      message: `${fromUsername} started following you`,
      fromUserId,
    });
  }
}

// Singleton instance
export const notificationPublisher = new NotificationPublisher();
