/**
 * Daily check-in rate limit middleware
 *
 * Anti-farming protection: limits each user to 10 check-ins per rolling 24-hour
 * window. Works alongside the 30-second BullMQ badge evaluation delay and
 * location verification to prevent badge gaming.
 *
 * Must be applied AFTER authenticateToken (requires req.user.id).
 */

import { Request, Response, NextFunction } from 'express';
import Database from '../config/database';
import logger from '../utils/logger';

const DAILY_CHECKIN_LIMIT = 10;

export const dailyCheckinRateLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      // Should not happen if placed after authenticateToken, but guard anyway
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const db = Database.getInstance();
    const result = await db.query(
      `SELECT COUNT(*)::int as cnt FROM checkins
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 day'`,
      [userId]
    );

    const count = result.rows[0]?.cnt || 0;

    if (count >= DAILY_CHECKIN_LIMIT) {
      res.status(429).json({
        success: false,
        error: 'Daily check-in limit reached (10 per day)',
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Daily check-in rate limit error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Fail-closed: deny check-in when rate limit check fails
    res.status(429).json({
      success: false,
      error: 'Unable to verify rate limit, please try again',
    });
  }
};
