import Database from '../config/database';

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

  /**
   * Get notifications for a user with pagination
   */
  async getNotifications(
    userId: string,
    options: GetNotificationsOptions = {}
  ): Promise<NotificationFeed> {
    try {
      const { limit = 20, offset = 0 } = options;

      // Get notifications with related data
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
          -- Show data
          s.id as show_id,
          s.show_date as show_date,
          sb.id as show_band_id,
          sb.name as show_band_name,
          sv.id as show_venue_id,
          sv.name as show_venue_name
        FROM notifications n
        LEFT JOIN users fu ON n.from_user_id = fu.id
        LEFT JOIN checkins c ON n.checkin_id = c.id
        LEFT JOIN bands cb ON c.band_id = cb.id
        LEFT JOIN venues cv ON c.venue_id = cv.id
        LEFT JOIN badges b ON n.badge_id = b.id
        LEFT JOIN shows s ON n.show_id = s.id
        LEFT JOIN bands sb ON s.band_id = sb.id
        LEFT JOIN venues sv ON s.venue_id = sv.id
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.db.query(query, [userId, limit, offset]);

      // Get unread count
      const unreadResult = await this.db.query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
        [userId]
      );

      // Get total count
      const totalResult = await this.db.query(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1',
        [userId]
      );

      const unreadCount = parseInt(unreadResult.rows[0].count, 10);
      const total = parseInt(totalResult.rows[0].count, 10);

      const notifications = result.rows.map((row: any) => this.mapDbRowToNotification(row));

      return {
        notifications,
        unreadCount,
        total,
        hasMore: offset + notifications.length < total,
      };
    } catch (error) {
      console.error('Get notifications error:', error);
      throw error;
    }
  }

  /**
   * Create a new notification
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
      } = data;

      const query = `
        INSERT INTO notifications (
          user_id, type, title, message,
          checkin_id, from_user_id, badge_id, show_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const result = await this.db.query(query, [
        userId,
        type,
        title || null,
        message || null,
        checkinId || null,
        fromUserId || null,
        badgeId || null,
        showId || null,
      ]);

      // Get full notification with related data
      return this.getNotificationById(result.rows[0].id);
    } catch (error) {
      console.error('Create notification error:', error);
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
      console.error('Mark as read error:', error);
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
      console.error('Mark all as read error:', error);
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
      console.error('Get unread count error:', error);
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
      console.error('Delete notification error:', error);
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
        s.id as show_id,
        s.show_date as show_date,
        sb.id as show_band_id,
        sb.name as show_band_name,
        sv.id as show_venue_id,
        sv.name as show_venue_name
      FROM notifications n
      LEFT JOIN users fu ON n.from_user_id = fu.id
      LEFT JOIN checkins c ON n.checkin_id = c.id
      LEFT JOIN bands cb ON c.band_id = cb.id
      LEFT JOIN venues cv ON c.venue_id = cv.id
      LEFT JOIN badges b ON n.badge_id = b.id
      LEFT JOIN shows s ON n.show_id = s.id
      LEFT JOIN bands sb ON s.band_id = sb.id
      LEFT JOIN venues sv ON s.venue_id = sv.id
      WHERE n.id = $1
    `;

    const result = await this.db.query(query, [notificationId]);

    if (result.rows.length === 0) {
      throw new Error('Notification not found');
    }

    return this.mapDbRowToNotification(result.rows[0]);
  }

  /**
   * Map database row to Notification type
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
      showId: row.show_id,
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

    // Add show if present
    if (row.show_id) {
      notification.show = {
        id: row.show_id,
        showDate: row.show_date,
      };

      if (row.show_band_id) {
        notification.show.band = {
          id: row.show_band_id,
          name: row.show_band_name,
        };
      }

      if (row.show_venue_id) {
        notification.show.venue = {
          id: row.show_venue_id,
          name: row.show_venue_name,
        };
      }
    }

    return notification;
  }
}
