import { Request, Response } from 'express';
import { FeedService, decodeCursor } from '../services/FeedService';
import { ApiResponse } from '../types';
import logger from '../utils/logger';

const VALID_FEED_TYPES = ['friends', 'event', 'happening_now', 'global'] as const;

export class FeedController {
  private feedService = new FeedService();

  /**
   * Get friends feed with cursor pagination
   * GET /api/feed/friends?cursor=X&limit=N
   */
  getFriendsFeed = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const cursor = req.query.cursor as string | undefined;
      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 20 : rawLimit));

      // API-015: Validate cursor format -- return 400 for malformed cursors
      if (cursor && !decodeCursor(cursor)) {
        const response: ApiResponse = { success: false, error: 'Invalid cursor format' };
        res.status(400).json(response);
        return;
      }

      const result = await this.feedService.getFriendsFeed(userId, cursor, limit);

      const response: ApiResponse = { success: true, data: result };
      res.status(200).json(response);
    } catch (error) {
      logger.error('Get friends feed error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch friends feed',
      };
      res.status(500).json(response);
    }
  };

  /**
   * Get global feed with cursor pagination
   * GET /api/feed/global?cursor=X&limit=N
   */
  getGlobalFeed = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const cursor = req.query.cursor as string | undefined;
      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 20 : rawLimit));

      // API-015: Validate cursor format -- return 400 for malformed cursors
      if (cursor && !decodeCursor(cursor)) {
        const response: ApiResponse = { success: false, error: 'Invalid cursor format' };
        res.status(400).json(response);
        return;
      }

      const result = await this.feedService.getGlobalFeed(userId, cursor, limit);

      const response: ApiResponse = { success: true, data: result };
      res.status(200).json(response);
    } catch (error) {
      logger.error('Get global feed error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch global feed',
      };
      res.status(500).json(response);
    }
  };

  /**
   * Get event feed with cursor pagination
   * GET /api/feed/events/:eventId?cursor=X&limit=N
   */
  getEventFeed = async (req: Request, res: Response): Promise<void> => {
    try {
      const { eventId } = req.params;

      if (!eventId) {
        const response: ApiResponse = { success: false, error: 'Event ID is required' };
        res.status(400).json(response);
        return;
      }

      const cursor = req.query.cursor as string | undefined;
      const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 20 : rawLimit));

      // API-015: Validate cursor format
      if (cursor && !decodeCursor(cursor)) {
        const response: ApiResponse = { success: false, error: 'Invalid cursor format' };
        res.status(400).json(response);
        return;
      }

      const result = await this.feedService.getEventFeed(eventId, cursor, limit);

      const response: ApiResponse = { success: true, data: result };
      res.status(200).json(response);
    } catch (error) {
      logger.error('Get event feed error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch event feed',
      };
      res.status(500).json(response);
    }
  };

  /**
   * Get happening now feed (friends at shows today)
   * GET /api/feed/happening-now
   */
  getHappeningNow = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const result = await this.feedService.getHappeningNow(userId);

      const response: ApiResponse = { success: true, data: result };
      res.status(200).json(response);
    } catch (error) {
      logger.error('Get happening now error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch happening now',
      };
      res.status(500).json(response);
    }
  };

  /**
   * Get unseen counts per feed tab
   * GET /api/feed/unseen
   */
  getUnseenCounts = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const result = await this.feedService.getUnseenCounts(userId);

      const response: ApiResponse = { success: true, data: result };
      res.status(200).json(response);
    } catch (error) {
      logger.error('Get unseen counts error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch unseen counts',
      };
      res.status(500).json(response);
    }
  };

  /**
   * Mark a feed tab as read
   * POST /api/feed/mark-read
   * Body: { feedType, lastSeenAt, lastSeenCheckinId? }
   */
  markRead = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const { feedType, lastSeenAt, lastSeenCheckinId } = req.body;

      // Validate feedType
      if (!feedType || !VALID_FEED_TYPES.includes(feedType)) {
        const response: ApiResponse = {
          success: false,
          error: `feedType must be one of: ${VALID_FEED_TYPES.join(', ')}`,
        };
        res.status(400).json(response);
        return;
      }

      // Validate lastSeenAt is a valid ISO date string
      if (!lastSeenAt || isNaN(Date.parse(lastSeenAt))) {
        const response: ApiResponse = {
          success: false,
          error: 'lastSeenAt must be a valid ISO 8601 date string',
        };
        res.status(400).json(response);
        return;
      }

      await this.feedService.markFeedRead(userId, feedType, lastSeenAt, lastSeenCheckinId);

      const response: ApiResponse = { success: true };
      res.status(200).json(response);
    } catch (error) {
      logger.error('Mark feed read error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark feed as read',
      };
      res.status(500).json(response);
    }
  };
}
