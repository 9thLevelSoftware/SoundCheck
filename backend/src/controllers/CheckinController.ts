import { Request, Response } from 'express';
import { CheckinService } from '../services/CheckinService';
import { ApiResponse } from '../types';
import { broadcastToRoom, sendToUser, WebSocketEvents } from '../utils/websocket';

export class CheckinController {
  private checkinService = new CheckinService();

  /**
   * Create a new check-in
   * POST /api/checkins
   * Body: { venueId, bandId, rating, comment?, photoUrl?, eventDate?, vibeTagIds? }
   */
  createCheckin = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id; // From auth middleware

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const {
        venueId,
        bandId,
        rating,
        comment,
        photoUrl,
        eventDate,
        checkinLatitude,
        checkinLongitude,
        vibeTagIds,
      } = req.body;

      if (!venueId || !bandId || rating === undefined) {
        const response: ApiResponse = {
          success: false,
          error: 'Venue ID, band ID, and rating are required',
        };
        res.status(400).json(response);
        return;
      }

      const checkin = await this.checkinService.createCheckin({
        userId,
        venueId,
        bandId,
        rating,
        comment,
        photoUrl,
        eventDate: eventDate ? new Date(eventDate) : undefined,
        checkinLatitude,
        checkinLongitude,
        vibeTagIds,
      });

      const response: ApiResponse = {
        success: true,
        data: checkin,
        message: 'Check-in created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Create check-in error:', error);

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create check-in',
      };

      res.status(400).json(response);
    }
  };

  /**
   * Get check-in by ID
   * GET /api/checkins/:id
   */
  getCheckinById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;

      const checkin = await this.checkinService.getCheckinById(id, userId);

      const response: ApiResponse = {
        success: true,
        data: checkin,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get check-in error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Check-in not found',
      };

      res.status(404).json(response);
    }
  };

  /**
   * Get activity feed
   * GET /api/checkins/feed?filter=friends|nearby|global&limit=50&offset=0&lat=&lng=
   */
  getActivityFeed = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const filter = (req.query.filter as 'friends' | 'nearby' | 'global') || 'friends';
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const latitude = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
      const longitude = req.query.lng ? parseFloat(req.query.lng as string) : undefined;

      const checkins = await this.checkinService.getActivityFeed(userId, filter, {
        limit,
        offset,
        latitude,
        longitude,
      });

      const response: ApiResponse = {
        success: true,
        data: checkins,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get activity feed error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch activity feed',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Toast a check-in
   * POST /api/checkins/:id/toast
   */
  toastCheckin = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const username = (req as any).user?.username;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { id } = req.params;

      const result = await this.checkinService.toastCheckin(userId, id);

      // Broadcast real-time notification to check-in room
      broadcastToRoom(`checkin:${id}`, WebSocketEvents.NEW_TOAST, {
        checkinId: id,
        userId,
        username,
        toastCount: result?.toastCount,
        timestamp: new Date().toISOString(),
      });

      // Notify check-in owner if different from toaster
      if (result?.ownerId && result.ownerId !== userId) {
        sendToUser(result.ownerId, WebSocketEvents.NEW_TOAST, {
          checkinId: id,
          userId,
          username,
          message: `${username || 'Someone'} toasted your check-in!`,
          timestamp: new Date().toISOString(),
        });
      }

      const response: ApiResponse = {
        success: true,
        message: 'Check-in toasted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Toast check-in error:', error);

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to toast check-in',
      };

      res.status(400).json(response);
    }
  };

  /**
   * Untoast a check-in
   * DELETE /api/checkins/:id/toast
   */
  untoastCheckin = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { id } = req.params;

      await this.checkinService.untoastCheckin(userId, id);

      const response: ApiResponse = {
        success: true,
        message: 'Toast removed successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Untoast check-in error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to remove toast',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Add a comment to a check-in
   * POST /api/checkins/:id/comments
   * Body: { commentText }
   */
  addComment = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const username = (req as any).user?.username;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { id } = req.params;
      const { commentText } = req.body;

      if (!commentText || commentText.trim() === '') {
        const response: ApiResponse = {
          success: false,
          error: 'Comment text is required',
        };
        res.status(400).json(response);
        return;
      }

      const comment = await this.checkinService.addComment(userId, id, commentText);

      // Broadcast real-time notification to check-in room
      broadcastToRoom(`checkin:${id}`, WebSocketEvents.NEW_COMMENT, {
        checkinId: id,
        comment: {
          ...comment,
          username,
        },
        timestamp: new Date().toISOString(),
      });

      // Notify check-in owner if different from commenter
      if (comment?.ownerId && comment.ownerId !== userId) {
        sendToUser(comment.ownerId, WebSocketEvents.NEW_COMMENT, {
          checkinId: id,
          userId,
          username,
          message: `${username || 'Someone'} commented on your check-in!`,
          preview: commentText.substring(0, 50),
          timestamp: new Date().toISOString(),
        });
      }

      const response: ApiResponse = {
        success: true,
        data: comment,
        message: 'Comment added successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Add comment error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to add comment',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get comments for a check-in
   * GET /api/checkins/:id/comments
   */
  getComments = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const comments = await this.checkinService.getComments(id);

      const response: ApiResponse = {
        success: true,
        data: comments,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get comments error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch comments',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Delete a check-in
   * DELETE /api/checkins/:id
   */
  deleteCheckin = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { id } = req.params;

      await this.checkinService.deleteCheckin(userId, id);

      const response: ApiResponse = {
        success: true,
        message: 'Check-in deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Delete check-in error:', error);

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete check-in',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get check-ins with filters
   * GET /api/checkins?venueId=&bandId=&userId=&page=1&limit=20
   */
  getCheckins = async (req: Request, res: Response): Promise<void> => {
    try {
      const { venueId, bandId, userId, page, limit } = req.query;

      const checkins = await this.checkinService.getCheckins({
        venueId: venueId as string,
        bandId: bandId as string,
        userId: userId as string,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      });

      const response: ApiResponse = {
        success: true,
        data: checkins,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get check-ins error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch check-ins',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get vibe tags
   * GET /api/checkins/vibe-tags
   */
  getVibeTags = async (req: Request, res: Response): Promise<void> => {
    try {
      const vibeTags = await this.checkinService.getVibeTags();

      const response: ApiResponse = {
        success: true,
        data: vibeTags,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get vibe tags error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch vibe tags',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get toasts for a check-in
   * GET /api/checkins/:id/toasts
   */
  getToasts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const toasts = await this.checkinService.getToasts(id);

      const response: ApiResponse = {
        success: true,
        data: toasts,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get toasts error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch toasts',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Delete a comment
   * DELETE /api/checkins/:id/comments/:commentId
   */
  deleteComment = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { id, commentId } = req.params;

      await this.checkinService.deleteComment(userId, id, commentId);

      const response: ApiResponse = {
        success: true,
        message: 'Comment deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Delete comment error:', error);

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete comment',
      };

      res.status(500).json(response);
    }
  };
}
