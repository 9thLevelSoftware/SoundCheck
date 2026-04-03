import { Request, Response } from 'express';
import { CheckinService } from '../services/CheckinService';
import { AuditService } from '../services/AuditService';
import { ApiResponse } from '../types';
import { UnauthorizedError, BadRequestError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { broadcastToRoom, sendToUser, WebSocketEvents } from '../utils/websocket';

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
  createCheckin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id; // From auth middleware

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
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
      throw new BadRequestError('Either eventId OR both bandId and venueId are required');
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
  });

  /**
   * Get check-in by ID
   * GET /api/checkins/:id
   */
  getCheckinById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const userId = req.user?.id;

    const checkin = await this.checkinService.getCheckinById(id, userId);

    const response: ApiResponse = {
      success: true,
      data: checkin,
    };

    res.status(200).json(response);
  });

  /**
   * Get activity feed
   * GET /api/checkins/feed?filter=friends|nearby|global&limit=50&offset=0&lat=&lng=
   */
  getActivityFeed = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
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
  });

  /**
   * Toast a check-in
   * POST /api/checkins/:id/toast
   */
  toastCheckin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    const username = req.user?.username;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
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
  });

  /**
   * Untoast a check-in
   * DELETE /api/checkins/:id/toast
   */
  untoastCheckin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;

    await this.checkinService.untoastCheckin(userId, id);

    const response: ApiResponse = {
      success: true,
      message: 'Toast removed successfully',
    };

    res.status(200).json(response);
  });

  /**
   * Add a comment to a check-in
   * POST /api/checkins/:id/comments
   * Body: { commentText }
   */
  addComment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    const username = req.user?.username;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;
    const { commentText } = req.body;

    if (!commentText || commentText.trim() === '') {
      throw new BadRequestError('Comment text is required');
    }

    // SEC-009/CFR-010: Enforce max comment length to prevent abuse
    if (commentText.length > 2000) {
      throw new BadRequestError('Comment text must be 2000 characters or fewer');
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
  });

  /**
   * Get comments for a check-in
   * GET /api/checkins/:id/comments
   */
  getComments = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const comments = await this.checkinService.getComments(id);

    const response: ApiResponse = {
      success: true,
      data: comments,
    };

    res.status(200).json(response);
  });

  /**
   * Delete a check-in
   * DELETE /api/checkins/:id
   */
  deleteCheckin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;

    await this.checkinService.deleteCheckin(userId, id);

    const response: ApiResponse = {
      success: true,
      message: 'Check-in deleted successfully',
    };

    res.status(200).json(response);
  });

  /**
   * Get check-ins with filters
   * GET /api/checkins?venueId=&bandId=&userId=&page=1&limit=20
   */
  getCheckins = asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
  });

  /**
   * Get vibe tags
   * GET /api/checkins/vibe-tags
   */
  getVibeTags = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const vibeTags = await this.checkinService.getVibeTags();

    const response: ApiResponse = {
      success: true,
      data: vibeTags,
    };

    res.status(200).json(response);
  });

  /**
   * Get toasts for a check-in
   * GET /api/checkins/:id/toasts
   */
  getToasts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const toasts = await this.checkinService.getToasts(id);

    const response: ApiResponse = {
      success: true,
      data: toasts,
    };

    res.status(200).json(response);
  });

  /**
   * Delete a comment
   * DELETE /api/checkins/:id/comments/:commentId
   */
  deleteComment = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id, commentId } = req.params;

    await this.checkinService.deleteComment(userId, id, commentId);

    const response: ApiResponse = {
      success: true,
      message: 'Comment deleted successfully',
    };

    res.status(200).json(response);
  });

  /**
   * Request presigned upload URLs for photos
   * POST /api/checkins/:id/photos
   * Body: { contentTypes: ['image/jpeg', 'image/png', ...] }
   *
   * Returns presigned URLs for client to PUT directly to R2.
   * Photos never touch the Railway server filesystem.
   */
  requestPhotoUpload = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;
    const { contentTypes } = req.body;

    // Validate contentTypes
    if (!contentTypes || !Array.isArray(contentTypes) || contentTypes.length === 0) {
      throw new BadRequestError('contentTypes must be a non-empty array of MIME types');
    }

    if (contentTypes.length > 4) {
      throw new BadRequestError('Maximum 4 photos per request');
    }

    // Validate each content type is an image type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    for (const ct of contentTypes) {
      if (!validTypes.includes(ct)) {
        throw new BadRequestError(`Invalid content type: ${ct}. Allowed: ${validTypes.join(', ')}`);
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
  });

  /**
   * Confirm photo uploads and store URLs in check-in
   * PATCH /api/checkins/:id/photos
   * Body: { photoKeys: ['checkins/abc123/random.jpg', ...] }
   *
   * Called after client has successfully uploaded to R2 via presigned URLs.
   */
  confirmPhotoUpload = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;
    const { photoKeys } = req.body;

    // Validate photoKeys
    if (!photoKeys || !Array.isArray(photoKeys) || photoKeys.length === 0) {
      throw new BadRequestError('photoKeys must be a non-empty array of object keys');
    }

    if (photoKeys.length > 4) {
      throw new BadRequestError('Maximum 4 photos per request');
    }

    const checkin = await this.checkinService.addPhotos(id, userId, photoKeys);

    const response: ApiResponse = {
      success: true,
      data: checkin,
      message: 'Photos added successfully',
    };

    res.status(200).json(response);
  });

  /**
   * Update ratings for a check-in
   * PATCH /api/checkins/:id/ratings
   * Body: { bandRatings?: [{ bandId, rating }], venueRating?: number }
   *
   * Ratings must be 0.5-5.0 in 0.5 increments.
   * At least one of bandRatings or venueRating must be provided.
   */
  updateRatings = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;
    const { bandRatings, venueRating } = req.body;

    // Validate: at least one rating type must be present
    if (!bandRatings && venueRating === undefined) {
      throw new BadRequestError('At least one of bandRatings or venueRating is required');
    }

    // Validate bandRatings format
    if (bandRatings) {
      if (!Array.isArray(bandRatings)) {
        throw new BadRequestError('bandRatings must be an array of { bandId, rating }');
      }

      for (const br of bandRatings) {
        if (!br.bandId || typeof br.rating !== 'number') {
          throw new BadRequestError(
            'Each band rating must have bandId (string) and rating (number)'
          );
        }
        if (br.rating < 0.5 || br.rating > 5.0 || br.rating % 0.5 !== 0) {
          throw new BadRequestError('Band ratings must be 0.5-5.0 in 0.5 increments');
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
        throw new BadRequestError('Venue rating must be 0.5-5.0 in 0.5 increments');
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
  });
}
