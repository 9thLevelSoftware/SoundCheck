import { Request, Response } from 'express';
import { ApiResponse } from '../types';
import Database from '../config/database';
import { cache } from '../utils/cache';
import { getWebSocketStats } from '../utils/websocket';
import { asyncHandler } from '../utils/asyncHandler';
import { logInfo, logWarn } from '../utils/logger';

/**
 * Admin Controller - Dashboard and management utilities
 *
 * SECURITY: All routes should be protected with admin middleware
 * Example: router.get('/admin/stats', requireAdmin, AdminController.getStats);
 */
export class AdminController {
  /**
   * Get system statistics
   * GET /api/admin/stats
   */
  getStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = Database.getInstance();

    // Get database stats
    const userCountResult = await db.query('SELECT COUNT(*) as count FROM users');
    const venueCountResult = await db.query('SELECT COUNT(*) as count FROM venues');
    const bandCountResult = await db.query('SELECT COUNT(*) as count FROM bands');
    const checkinCountResult = await db.query('SELECT COUNT(*) as count FROM checkins');

    // Get recent activity (last 24 hours)
    const recentUsersResult = await db.query(
      "SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL '24 hours'"
    );
    const recentCheckinsResult = await db.query(
      "SELECT COUNT(*) as count FROM checkins WHERE created_at > NOW() - INTERVAL '24 hours'"
    );

    // Get cache stats
    const cacheStats = cache.getStats();

    // Get WebSocket stats
    const wsStats = getWebSocketStats();

    const response: ApiResponse = {
      success: true,
      data: {
        counts: {
          users: userCountResult.rows[0].count,
          venues: venueCountResult.rows[0].count,
          bands: bandCountResult.rows[0].count,
          checkins: checkinCountResult.rows[0].count,
        },
        recent24h: {
          newUsers: recentUsersResult.rows[0].count,
          newCheckins: recentCheckinsResult.rows[0].count,
        },
        cache: cacheStats,
        websocket: wsStats,
        timestamp: new Date().toISOString(),
      },
    };

    logInfo('Admin stats accessed');
    res.status(200).json(response);
  });

  /**
   * Get top venues by rating
   * GET /api/admin/top-venues?limit=10
   */
  getTopVenues = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = parseInt(req.query.limit as string) || 10;
    const db = Database.getInstance();

    const venuesResult = await db.query(
      `
      SELECT
        v.id,
        v.name,
        v.city,
        v.state,
        v.average_rating,
        v.total_checkins as checkin_count
      FROM venues v
      WHERE v.is_active = true AND v.total_checkins > 0
      ORDER BY v.average_rating DESC, v.total_checkins DESC
      LIMIT $1
      `,
      [limit]
    );

    const response: ApiResponse = {
      success: true,
      data: venuesResult.rows,
    };

    res.status(200).json(response);
  });

  /**
   * Get user activity report
   * GET /api/admin/user-activity?userId=123
   */
  getUserActivity = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.query.userId as string;

    if (!userId) {
      const response: ApiResponse = {
        success: false,
        error: 'userId is required',
      };
      res.status(400).json(response);
      return;
    }

    const db = Database.getInstance();

    // Get user info -- SEC-012: Exclude email to prevent PII exposure
    const usersResult = await db.query('SELECT id, username, created_at FROM users WHERE id = $1', [
      userId,
    ]);

    if (!usersResult.rows || usersResult.rows.length === 0) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found',
      };
      res.status(404).json(response);
      return;
    }

    // Get user's activity counts
    const checkinCountResult = await db.query(
      'SELECT COUNT(*) as count FROM checkins WHERE user_id = $1',
      [userId]
    );
    const followerCountResult = await db.query(
      'SELECT COUNT(*) as count FROM user_followers WHERE following_id = $1',
      [userId]
    );
    const followingCountResult = await db.query(
      'SELECT COUNT(*) as count FROM user_followers WHERE follower_id = $1',
      [userId]
    );

    // Get recent checkins
    const recentCheckinsResult = await db.query(
      `
      SELECT c.id, c.rating, c.comment, c.created_at,
             v.name as venue_name, b.name as band_name
      FROM checkins c
      LEFT JOIN venues v ON c.venue_id = v.id
      LEFT JOIN bands b ON c.band_id = b.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
      LIMIT 10
      `,
      [userId]
    );

    const response: ApiResponse = {
      success: true,
      data: {
        user: usersResult.rows[0],
        activity: {
          checkinCount: checkinCountResult.rows[0].count,
          followerCount: followerCountResult.rows[0].count,
          followingCount: followingCountResult.rows[0].count,
        },
        recentCheckins: recentCheckinsResult.rows,
      },
    };

    res.status(200).json(response);
  });

  /**
   * Clear cache
   * POST /api/admin/cache/clear
   */
  clearCache = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const pattern = req.body.pattern as string | undefined;

    if (pattern) {
      await cache.delPattern(pattern);
      logInfo(`Admin cleared cache pattern: ${pattern}`);
    } else {
      await cache.clear();
      logInfo('Admin cleared all cache');
    }

    const response: ApiResponse = {
      success: true,
      data: {
        message: pattern ? `Cache cleared for pattern: ${pattern}` : 'All cache cleared',
      },
    };

    res.status(200).json(response);
  });

  /**
   * Get database health check
   * GET /api/admin/health/database
   */
  getDatabaseHealth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const db = Database.getInstance();
    const isHealthy = await db.healthCheck();

    const response: ApiResponse = {
      success: true,
      data: {
        healthy: isHealthy,
        timestamp: new Date().toISOString(),
      },
    };

    res.status(isHealthy ? 200 : 503).json(response);
  });

  /**
   * Moderate content (ban user, delete venue, etc.)
   * POST /api/admin/moderate
   */
  moderateContent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { action, targetType, targetId, reason } = req.body;

    if (!action || !targetType || !targetId) {
      const response: ApiResponse = {
        success: false,
        error: 'action, targetType, and targetId are required',
      };
      res.status(400).json(response);
      return;
    }

    const db = Database.getInstance();

    switch (action) {
      case 'ban_user':
        await db.query('UPDATE users SET is_active = false WHERE id = $1', [targetId]);
        logWarn(`Admin banned user: ${targetId}. Reason: ${reason || 'Not specified'}`);
        break;

      case 'delete_venue':
        await db.query('UPDATE venues SET is_active = false WHERE id = $1', [targetId]);
        logWarn(`Admin deleted venue: ${targetId}. Reason: ${reason || 'Not specified'}`);
        break;

      default: {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid action',
        };
        res.status(400).json(response);
        return;
      }
    }

    const response: ApiResponse = {
      success: true,
      data: {
        message: `${action} completed successfully`,
        action,
        targetType,
        targetId,
      },
    };

    res.status(200).json(response);
  });
}

export default new AdminController();
