/**
 * NotificationController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { NotificationService } from '../services/NotificationService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, BadRequestError } from '../utils/errors';

// UUID v4 validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class NotificationController {
  private notificationService = new NotificationService();

  /**
   * Get notifications for the current user
   * GET /api/notifications
   * Query: { limit?: number, offset?: number }
   */
  getNotifications = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
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
  });

  /**
   * Get unread notification count
   * GET /api/notifications/unread-count
   */
  getUnreadCount = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const count = await this.notificationService.getUnreadCount(userId);

    const response: ApiResponse = {
      success: true,
      data: { count },
    };

    res.status(200).json(response);
  });

  /**
   * Mark a single notification as read
   * POST /api/notifications/:id/read
   */
  markAsRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
      throw new BadRequestError('Invalid notification ID format');
    }

    await this.notificationService.markAsRead(id, userId);

    const response: ApiResponse = {
      success: true,
      message: 'Notification marked as read',
    };

    res.status(200).json(response);
  });

  /**
   * Mark all notifications as read
   * POST /api/notifications/read-all
   */
  markAllAsRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const count = await this.notificationService.markAllAsRead(userId);

    const response: ApiResponse = {
      success: true,
      data: { markedCount: count },
      message: `${count} notification(s) marked as read`,
    };

    res.status(200).json(response);
  });

  /**
   * Delete a notification
   * DELETE /api/notifications/:id
   */
  deleteNotification = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;

    if (!UUID_REGEX.test(id)) {
      throw new BadRequestError('Invalid notification ID format');
    }

    await this.notificationService.deleteNotification(id, userId);

    const response: ApiResponse = {
      success: true,
      message: 'Notification deleted',
    };

    res.status(200).json(response);
  });
}
