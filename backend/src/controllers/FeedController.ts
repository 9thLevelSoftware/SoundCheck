/**
 * FeedController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { FeedService, decodeCursor } from '../services/FeedService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, BadRequestError } from '../utils/errors';

const VALID_FEED_TYPES = ['friends', 'event', 'happening_now', 'global'] as const;

export class FeedController {
  private feedService = new FeedService();

  /**
   * Get friends feed with cursor pagination
   * GET /api/feed/friends?cursor=X&limit=N
   */
  getFriendsFeed = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const cursor = req.query.cursor as string | undefined;
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 20 : rawLimit));

    // API-015: Validate cursor format -- return 400 for malformed cursors
    if (cursor && !decodeCursor(cursor)) {
      throw new BadRequestError('Invalid cursor format');
    }

    const result = await this.feedService.getFriendsFeed(userId, cursor, limit);

    const response: ApiResponse = { success: true, data: result };
    res.status(200).json(response);
  });

  /**
   * Get global feed with cursor pagination
   * GET /api/feed/global?cursor=X&limit=N
   */
  getGlobalFeed = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const cursor = req.query.cursor as string | undefined;
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 20 : rawLimit));

    // API-015: Validate cursor format -- return 400 for malformed cursors
    if (cursor && !decodeCursor(cursor)) {
      throw new BadRequestError('Invalid cursor format');
    }

    const result = await this.feedService.getGlobalFeed(userId, cursor, limit);

    const response: ApiResponse = { success: true, data: result };
    res.status(200).json(response);
  });

  /**
   * Get event feed with cursor pagination
   * GET /api/feed/events/:eventId?cursor=X&limit=N
   */
  getEventFeed = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { eventId } = req.params;

    if (!eventId) {
      throw new BadRequestError('Event ID is required');
    }

    const cursor = req.query.cursor as string | undefined;
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 20 : rawLimit));

    // API-015: Validate cursor format
    if (cursor && !decodeCursor(cursor)) {
      throw new BadRequestError('Invalid cursor format');
    }

    const userId = req.user?.id;
    const result = await this.feedService.getEventFeed(eventId, userId, cursor, limit);

    const response: ApiResponse = { success: true, data: result };
    res.status(200).json(response);
  });

  /**
   * Get happening now feed (friends at shows today)
   * GET /api/feed/happening-now
   */
  getHappeningNow = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const result = await this.feedService.getHappeningNow(userId);

    const response: ApiResponse = { success: true, data: result };
    res.status(200).json(response);
  });

  /**
   * Get unseen counts per feed tab
   * GET /api/feed/unseen
   */
  getUnseenCounts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const result = await this.feedService.getUnseenCounts(userId);

    const response: ApiResponse = { success: true, data: result };
    res.status(200).json(response);
  });

  /**
   * Mark a feed tab as read
   * POST /api/feed/mark-read
   * Body: { feedType, lastSeenAt, lastSeenCheckinId? }
   */
  markRead = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { feedType, lastSeenAt, lastSeenCheckinId } = req.body;

    // Validate feedType
    if (!feedType || !VALID_FEED_TYPES.includes(feedType)) {
      throw new BadRequestError(`feedType must be one of: ${VALID_FEED_TYPES.join(', ')}`);
    }

    // Validate lastSeenAt is a valid ISO date string
    if (!lastSeenAt || isNaN(Date.parse(lastSeenAt))) {
      throw new BadRequestError('lastSeenAt must be a valid ISO 8601 date string');
    }

    await this.feedService.markFeedRead(userId, feedType, lastSeenAt, lastSeenCheckinId);

    const response: ApiResponse = { success: true };
    res.status(200).json(response);
  });
}
