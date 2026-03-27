import { Request, Response } from 'express';
import { CheckinService } from '../services/CheckinService';
import { AuditService } from '../services/AuditService';
import { ApiResponse } from '../types';
import { AppError, NotFoundError } from '../utils/errors';
import { broadcastToRoom, sendToUser, WebSocketEvents } from '../utils/websocket';
import logger from '../utils/logger';

export class CheckinController {
  private checkinService = new CheckinService();
  private auditService = new AuditService();

  /**
   * Create a new check-in
   * POST /api/checkins
   *
   * Supports two paths:
   *   Event-first: { eventId, locationLat?, locationLon?, comment?, vibeTagIds? }
   *   Manual:      { bandId, venueId, rating?, locationLat?, locationLon?, comment?, vibeTagIds? }
   */
  createCheckin = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id; // From auth middleware

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const {
        eventId,
        bandId,
        venueId,
        rating,
        checkinLatitude,
        checkinLongitude,
        locationLat,
        locationLon,
        comment,
        vibeTagIds,
      } = req.body;

      let checkin;

      if (eventId) {
        // Event-first path (primary)
        checkin = await this.checkinService.createEventCheckin({
          userId,
          eventId,
          locationLat: locationLat ?? checkinLatitude,
          locationLon: locationLon ?? checkinLongitude,
          comment,
          vibeTagIds,
        });
      } else if (bandId && venueId) {
        // Manual fallback path (band + venue, no event)
        checkin = await this.checkinService.createManualCheckin({
          userId,
          bandId,
          venueId,
          rating,
          locationLat: locationLat ?? checkinLatitude,
          locationLon: locationLon ?? checkinLongitude,
          comment,
          vibeTagIds,
        });
      } else {
        const response: ApiResponse = {
          success: false,
          error: 'Either eventId OR both bandId and venueId are required',
        };
        res.status(400).json(response);
        return;
      }

      // Audit log: check-in created
      this.auditService.logCheckinCreated(
        userId,
        checkin.id,
        {
          eventId: eventId || undefined,
          bandId: bandId || undefined,
          venueId: venueId || undefined,
          isVerified: checkin.isVerified,
          manual: !eventId,
        },
        req
      );

      const response: ApiResponse = {
        success: true,
        data: checkin,
        message: 'Check-in created successfully',
      };

      res.status(201).json(response);
    } catch (error: any) {
      logger.error('Create check-in error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Determine appropriate status code from error
      const statusCode = error.statusCode || 400;
      const message = error instanceof Error ? error.message : 'Failed to create check-in';

      const response: ApiResponse = {
        success: false,
        error: message,
      };

      res.status(statusCode).json(response);
    }
  };

  /**
   * Get check-in by ID
   * GET /api/checkins/:id
   */
  getCheckinById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const checkin = await this.checkinService.getCheckinById(id, userId);

      const response: ApiResponse = {
        success: true,
        data: checkin,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get check-in error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // API-016/CFR-012: Distinguish NotFound from server errors
      if (
        error instanceof NotFoundError ||
        (error instanceof Error && error.message === 'Check-in not found')
      ) {
        const response: ApiResponse = { success: false, error: 'Check-in not found' };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch check-in',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get activity feed
   * GET /api/checkins/feed?filter=friends|nearby|global&limit=50&offset=0&lat=&lng=
   */
  getActivityFeed = async (req: Request, res: Response): Promise<void> => {
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

      const filter = (req.query.filter as 'friends' | 'nearby' | 'global') || 'friends';
      // API-014: Bounded parseInt with NaN handling
      const rawLimit = parseInt(req.query.limit as string, 10);
      const limit = isNaN(rawLimit) ? 50 : Math.max(1, Math.min(100, rawLimit));
      const rawOffset = parseInt(req.query.offset as string, 10);
      const offset = isNaN(rawOffset) ? 0 : Math.max(0, rawOffset);
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
      logger.error('Get activity feed error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

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
      const userId = req.user?.id;
      const username = req.user?.username;

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
      logger.error('Toast check-in error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

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

      await this.checkinService.untoastCheckin(userId, id);

      const response: ApiResponse = {
        success: true,
        message: 'Toast removed successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Untoast check-in error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

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
      const userId = req.user?.id;
      const username = req.user?.username;

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

      // SEC-009/CFR-010: Enforce max comment length to prevent abuse
      if (commentText.length > 2000) {
        const response: ApiResponse = {
          success: false,
          error: 'Comment text must be 2000 characters or fewer',
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
      logger.error('Add comment error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

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
      logger.error('Get comments error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

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

      await this.checkinService.deleteCheckin(userId, id);

      const response: ApiResponse = {
        success: true,
        message: 'Check-in deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      if (error instanceof Error) {
        const statusCode = (error as any).statusCode;
        if (statusCode === 404) {
          res.status(404).json({ success: false, error: 'Check-in not found' } as ApiResponse);
          return;
        }
        if (statusCode === 403) {
          res.status(403).json({ success: false, error: error.message } as ApiResponse);
          return;
        }
      }

      logger.error('Delete check-in error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to delete check-in',
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

      // API-014: Bounded parseInt with NaN handling
      const rawPage = parseInt(page as string, 10);
      const rawLimitVal = parseInt(limit as string, 10);

      const checkins = await this.checkinService.getCheckins({
        venueId: venueId as string,
        bandId: bandId as string,
        userId: userId as string,
        page: isNaN(rawPage) ? 1 : Math.max(1, rawPage),
        limit: isNaN(rawLimitVal) ? 20 : Math.max(1, Math.min(100, rawLimitVal)),
      });

      const response: ApiResponse = {
        success: true,
        data: checkins,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get check-ins error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

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
      logger.error('Get vibe tags error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

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
      logger.error('Get toasts error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

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
      const userId = req.user?.id;

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
      logger.error('Delete comment error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete comment',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Request presigned upload URLs for photos
   * POST /api/checkins/:id/photos
   * Body: { contentTypes: ['image/jpeg', 'image/png', ...] }
   *
   * Returns presigned URLs for client to PUT directly to R2.
   * Photos never touch the Railway server filesystem.
   */
  requestPhotoUpload = async (req: Request, res: Response): Promise<void> => {
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
      const { contentTypes } = req.body;

      // Validate contentTypes
      if (!contentTypes || !Array.isArray(contentTypes) || contentTypes.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: 'contentTypes must be a non-empty array of MIME types',
        };
        res.status(400).json(response);
        return;
      }

      if (contentTypes.length > 4) {
        const response: ApiResponse = {
          success: false,
          error: 'Maximum 4 photos per request',
        };
        res.status(400).json(response);
        return;
      }

      // Validate each content type is an image type
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
      for (const ct of contentTypes) {
        if (!validTypes.includes(ct)) {
          const response: ApiResponse = {
            success: false,
            error: `Invalid content type: ${ct}. Allowed: ${validTypes.join(', ')}`,
          };
          res.status(400).json(response);
          return;
        }
      }

      const presignedUrls = await this.checkinService.requestPhotoUploadUrls(
        id,
        userId,
        contentTypes
      );

      const response: ApiResponse = {
        success: true,
        data: presignedUrls,
      };

      res.status(200).json(response);
    } catch (error: any) {
      logger.error('Request photo upload error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const statusCode = error.statusCode || 400;
      const message = error instanceof Error ? error.message : 'Failed to generate upload URLs';

      const response: ApiResponse = {
        success: false,
        error: message,
      };

      res.status(statusCode).json(response);
    }
  };

  /**
   * Confirm photo uploads and store URLs in check-in
   * PATCH /api/checkins/:id/photos
   * Body: { photoKeys: ['checkins/abc123/random.jpg', ...] }
   *
   * Called after client has successfully uploaded to R2 via presigned URLs.
   */
  confirmPhotoUpload = async (req: Request, res: Response): Promise<void> => {
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
      const { photoKeys } = req.body;

      // Validate photoKeys
      if (!photoKeys || !Array.isArray(photoKeys) || photoKeys.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: 'photoKeys must be a non-empty array of object keys',
        };
        res.status(400).json(response);
        return;
      }

      if (photoKeys.length > 4) {
        const response: ApiResponse = {
          success: false,
          error: 'Maximum 4 photos per request',
        };
        res.status(400).json(response);
        return;
      }

      const checkin = await this.checkinService.addPhotos(id, userId, photoKeys);

      const response: ApiResponse = {
        success: true,
        data: checkin,
        message: 'Photos added successfully',
      };

      res.status(200).json(response);
    } catch (error: any) {
      logger.error('Confirm photo upload error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const statusCode = error.statusCode || 400;
      const message = error instanceof Error ? error.message : 'Failed to confirm photo uploads';

      const response: ApiResponse = {
        success: false,
        error: message,
      };

      res.status(statusCode).json(response);
    }
  };

  /**
   * Update ratings for a check-in
   * PATCH /api/checkins/:id/ratings
   * Body: { bandRatings?: [{ bandId, rating }], venueRating?: number }
   *
   * Ratings must be 0.5-5.0 in 0.5 increments.
   * At least one of bandRatings or venueRating must be provided.
   */
  updateRatings = async (req: Request, res: Response): Promise<void> => {
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
      const { bandRatings, venueRating } = req.body;

      // Validate: at least one rating type must be present
      if (!bandRatings && venueRating === undefined) {
        const response: ApiResponse = {
          success: false,
          error: 'At least one of bandRatings or venueRating is required',
        };
        res.status(400).json(response);
        return;
      }

      // Validate bandRatings format
      if (bandRatings) {
        if (!Array.isArray(bandRatings)) {
          const response: ApiResponse = {
            success: false,
            error: 'bandRatings must be an array of { bandId, rating }',
          };
          res.status(400).json(response);
          return;
        }

        for (const br of bandRatings) {
          if (!br.bandId || typeof br.rating !== 'number') {
            const response: ApiResponse = {
              success: false,
              error: 'Each band rating must have bandId (string) and rating (number)',
            };
            res.status(400).json(response);
            return;
          }
          if (br.rating < 0.5 || br.rating > 5.0 || br.rating % 0.5 !== 0) {
            const response: ApiResponse = {
              success: false,
              error: 'Band ratings must be 0.5-5.0 in 0.5 increments',
            };
            res.status(400).json(response);
            return;
          }
        }
      }

      // Validate venueRating format
      if (venueRating !== undefined) {
        if (
          typeof venueRating !== 'number' ||
          venueRating < 0.5 ||
          venueRating > 5.0 ||
          venueRating % 0.5 !== 0
        ) {
          const response: ApiResponse = {
            success: false,
            error: 'Venue rating must be 0.5-5.0 in 0.5 increments',
          };
          res.status(400).json(response);
          return;
        }
      }

      const checkin = await this.checkinService.addRatings(id, userId, {
        bandRatings,
        venueRating,
      });

      const response: ApiResponse = {
        success: true,
        data: checkin,
        message: 'Ratings updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Update ratings error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update ratings',
      };

      res.status(400).json(response);
    }
  };
}
