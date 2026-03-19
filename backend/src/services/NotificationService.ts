import Database from '../config/database';
import { BlockService } from './BlockService';
import logger from '../utils/logger';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title?: string;
  message?: string;
  checkinId?: string;
  fromUserId?: string;
  badgeId?: string;
  showId?: string;
  eventId?: string;
  isRead: boolean;
  createdAt: Date;
  // Populated fields
  fromUser?: {
    id: string;
    username: string;
    profileImageUrl?: string;
  };
  checkin?: {
    id: string;
    reviewText?: string;
    band?: {
      id: string;
      name: string;
      imageUrl?: string;
    };
    venue?: {
      id: string;
      name: string;
    };
  };
  badge?: {
    id: string;
    name: string;
    iconUrl?: string;
    color?: string;
  };
  show?: {
    id: string;
    showDate: Date;
    band?: {
      id: string;
      name: string;
    };
    venue?: {
      id: string;
      name: string;
    };
  };
}

export interface CreateNotificationData {
  userId: string;
  type: string;
  title?: string;
  message?: string;
  checkinId?: string;
  fromUserId?: string;
  badgeId?: string;
  showId?: string;
  eventId?: string;
}

export interface GetNotificationsOptions {
  limit?: number;
  offset?: number;
}

export interface NotificationFeed {
  notifications: Notification[];
  unreadCount: number;
  total: number;
  hasMore: boolean;
}

export class NotificationService {
  private db = Database.getInstance();
  private blockService = new BlockService();

  /**
   * Get notifications for a user with pagination.
   * Resolves show/event data through both events table (primary) and
   * shows table (fallback for legacy data). Prefers events data when available.
   */
  async getNotifications(
    userId: string,
    options: GetNotificationsOptions = {}
  ): Promise<NotificationFeed> {
    try {
      const { limit = 20, offset = 0 } = options;

      // Get notifications with related data
      // JOIN events table for event-based notifications
      // LEFT JOIN shows for backward compat (if shows table exists, its data is available)
      // CFR-PERF-005: Fold serial count queries into main query via window functions.
      // Eliminates 2 of 3 serial queries by computing total_count and unread_count inline.
      const blockFilter = this.blockService.getBlockFilterSQL(userId, 'n.from_user_id');

      const query = `
        SELECT
          n.*,
          -- From user data
          fu.id as from_user_id,
          fu.username as from_user_username,
          fu.profile_image_url as from_user_profile_image,
          -- Checkin data
          c.id as checkin_id,
          c.comment as checkin_comment,
          -- Checkin band
          cb.id as checkin_band_id,
          cb.name as checkin_band_name,
          cb.image_url as checkin_band_image,
          -- Checkin venue
          cv.id as checkin_venue_id,
          cv.name as checkin_venue_name,
          -- Badge data
          b.id as badge_id,
          b.name as badge_name,
          b.icon_url as badge_icon_url,
          b.color as badge_color,
          -- Event data (primary path for show-related notifications)
          ev.id as event_id,
          ev.event_date as event_date,
          ev.event_name as event_name,
          ev.venue_id as event_venue_id,
          evv.name as event_venue_name,
          -- Event headliner band (via event_lineup)
          el.band_id as event_band_id,
          evb.name as event_band_name,
          -- Inline window aggregates (eliminates 2 serial queries)
          COUNT(*) OVER() AS total_count,
          COUNT(*) FILTER (WHERE n.is_read = FALSE) OVER() AS unread_count
        FROM notifications n
        LEFT JOIN users fu ON n.from_user_id = fu.id
        LEFT JOIN checkins c ON n.checkin_id = c.id
        LEFT JOIN bands cb ON c.band_id = cb.id
        LEFT JOIN venues cv ON c.venue_id = cv.id
        LEFT JOIN badges b ON n.badge_id = b.id
        LEFT JOIN events ev ON n.event_id = ev.id
        LEFT JOIN venues evv ON ev.venue_id = evv.id
        LEFT JOIN LATERAL (
          SELECT el2.band_id FROM event_lineup el2
          WHERE el2.event_id = ev.id AND el2.is_headliner = true
          ORDER BY el2.set_order ASC LIMIT 1
        ) el ON TRUE
        LEFT JOIN bands evb ON el.band_id = evb.id
        WHERE n.user_id = $1
          ${blockFilter}
        ORDER BY n.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.db.query(query, [userId, limit, offset]);

      // Extract counts from the first row (window functions compute over entire result set)
      const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
      const unreadCount = result.rows.length > 0 ? parseInt(result.rows[0].unread_count, 10) : 0;

      const notifications = result.rows.map((row: any) => this.mapDbRowToNotification(row));

      return {
        notifications,
        unreadCount,
        total,
        hasMore: offset + notifications.length < total,
      };
    } catch (error) {
      logger.error('Get notifications error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Create a new notification.
   * Accepts optional eventId alongside showId for backward compatibility.
   * New callers should use eventId; showId is for legacy code paths.
   */
  async createNotification(data: CreateNotificationData): Promise<Notification> {
    try {
      const {
        userId,
        type,
        title,
        message,
        checkinId,
        fromUserId,
        badgeId,
        showId,
        eventId,
      } = data;

      // Write event_id to notifications table
      // The show_id column may not exist on production (created by migration 007 without it)
      // so we only write event_id
      const query = `
        INSERT INTO notifications (
          user_id, type, title, message,
          checkin_id, from_user_id, badge_id, event_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      // Use eventId if provided; fall back to showId for backward compat
      // (showId and eventId are the same UUID since migration 010 mapped show_id -> event_id)
      const resolvedEventId = eventId || showId || null;

      const result = await this.db.query(query, [
        userId,
        type,
        title || null,
        message || null,
        checkinId || null,
        fromUserId || null,
        badgeId || null,
        resolvedEventId,
      ]);

      // Get full notification with related data
      return this.getNotificationById(result.rows[0].id);
    } catch (error) {
      logger.error('Create notification error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      const result = await this.db.query(
        'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
        [notificationId, userId]
      );

      if (result.rowCount === 0) {
        throw new Error('Notification not found or access denied');
      }
    } catch (error) {
      logger.error('Mark as read error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await this.db.query(
        'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
        [userId]
      );

      return result.rowCount || 0;
    } catch (error) {
      logger.error('Mark all as read error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const result = await this.db.query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
        [userId]
      );

      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      logger.error('Get unread count error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    try {
      const result = await this.db.query(
        'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
        [notificationId, userId]
      );

      if (result.rowCount === 0) {
        throw new Error('Notification not found or access denied');
      }
    } catch (error) {
      logger.error('Delete notification error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Get notification by ID with related data
   */
  private async getNotificationById(notificationId: string): Promise<Notification> {
    const query = `
      SELECT
        n.*,
        fu.id as from_user_id,
        fu.username as from_user_username,
        fu.profile_image_url as from_user_profile_image,
        c.id as checkin_id,
        c.comment as checkin_comment,
        cb.id as checkin_band_id,
        cb.name as checkin_band_name,
        cb.image_url as checkin_band_image,
        cv.id as checkin_venue_id,
        cv.name as checkin_venue_name,
        b.id as badge_id,
        b.name as badge_name,
        b.icon_url as badge_icon_url,
        b.color as badge_color,
        ev.id as event_id,
        ev.event_date as event_date,
        ev.event_name as event_name,
        ev.venue_id as event_venue_id,
        evv.name as event_venue_name,
        el.band_id as event_band_id,
        evb.name as event_band_name
      FROM notifications n
      LEFT JOIN users fu ON n.from_user_id = fu.id
      LEFT JOIN checkins c ON n.checkin_id = c.id
      LEFT JOIN bands cb ON c.band_id = cb.id
      LEFT JOIN venues cv ON c.venue_id = cv.id
      LEFT JOIN badges b ON n.badge_id = b.id
      LEFT JOIN events ev ON n.event_id = ev.id
      LEFT JOIN venues evv ON ev.venue_id = evv.id
      LEFT JOIN event_lineup el ON ev.id = el.event_id AND el.is_headliner = true
      LEFT JOIN bands evb ON el.band_id = evb.id
      WHERE n.id = $1
    `;

    const result = await this.db.query(query, [notificationId]);

    if (result.rows.length === 0) {
      throw new Error('Notification not found');
    }

    return this.mapDbRowToNotification(result.rows[0]);
  }

  /**
   * Map database row to Notification type.
   * Resolves show data from events table (primary) with backward-compat shape.
   */
  private mapDbRowToNotification(row: any): Notification {
    const notification: Notification = {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      checkinId: row.checkin_id,
      fromUserId: row.from_user_id,
      badgeId: row.badge_id,
      showId: row.event_id,   // Backward compat: showId = eventId
      eventId: row.event_id,
      isRead: row.is_read,
      createdAt: row.created_at,
    };

    // Add from user if present
    if (row.from_user_username) {
      notification.fromUser = {
        id: row.from_user_id,
        username: row.from_user_username,
        profileImageUrl: row.from_user_profile_image,
      };
    }

    // Add checkin if present
    if (row.checkin_id) {
      notification.checkin = {
        id: row.checkin_id,
        reviewText: row.checkin_comment,
      };

      if (row.checkin_band_id) {
        notification.checkin.band = {
          id: row.checkin_band_id,
          name: row.checkin_band_name,
          imageUrl: row.checkin_band_image,
        };
      }

      if (row.checkin_venue_id) {
        notification.checkin.venue = {
          id: row.checkin_venue_id,
          name: row.checkin_venue_name,
        };
      }
    }

    // Add badge if present
    if (row.badge_id && row.badge_name) {
      notification.badge = {
        id: row.badge_id,
        name: row.badge_name,
        iconUrl: row.badge_icon_url,
        color: row.badge_color,
      };
    }

    // Add show/event data if present (resolved from events table)
    if (row.event_id) {
      notification.show = {
        id: row.event_id,
        showDate: row.event_date,
      };

      if (row.event_band_id) {
        notification.show.band = {
          id: row.event_band_id,
          name: row.event_band_name,
        };
      }

      if (row.event_venue_id) {
        notification.show.venue = {
          id: row.event_venue_id,
          name: row.event_venue_name,
        };
      }
    }

    return notification;
  }
}
