import { Request, Response } from 'express';
import { NotificationService } from '../services/NotificationService';
import { ApiResponse } from '../types';
import logger from '../utils/logger';

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class NotificationController {
  private notificationService = new NotificationService();

  /**
   * Get notifications for the current user
   * GET /api/notifications
   * Query: { limit?: number, offset?: number }
   */
  getNotifications = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);
      const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

      const result = await this.notificationService.getNotifications(userId, {
        limit,
        offset,
      });

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get notifications error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch notifications',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get unread notification count
   * GET /api/notifications/unread-count
   */
  getUnreadCount = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const count = await this.notificationService.getUnreadCount(userId);

      const response: ApiResponse = {
        success: true,
        data: { count },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get unread count error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to get unread count',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Mark a single notification as read
   * POST /api/notifications/:id/read
   */
  markAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { id } = req.params;

      if (!UUID_REGEX.test(id)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid notification ID format',
        };
        res.status(400).json(response);
        return;
      }

      await this.notificationService.markAsRead(id, userId);

      const response: ApiResponse = {
        success: true,
        message: 'Notification marked as read',
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Mark as read error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark notification as read',
      };

      res.status(400).json(response);
    }
  };

  /**
   * Mark all notifications as read
   * POST /api/notifications/read-all
   */
  markAllAsRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const count = await this.notificationService.markAllAsRead(userId);

      const response: ApiResponse = {
        success: true,
        data: { markedCount: count },
        message: `${count} notification(s) marked as read`,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Mark all as read error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to mark notifications as read',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Delete a notification
   * DELETE /api/notifications/:id
   */
  deleteNotification = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { id } = req.params;

      if (!UUID_REGEX.test(id)) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid notification ID format',
        };
        res.status(400).json(response);
        return;
      }

      await this.notificationService.deleteNotification(id, userId);

      const response: ApiResponse = {
        success: true,
        message: 'Notification deleted',
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Delete notification error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete notification',
      };

      res.status(400).json(response);
    }
  };
}
