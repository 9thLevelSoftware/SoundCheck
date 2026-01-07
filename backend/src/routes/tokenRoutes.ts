import { Router, Request, Response } from 'express';
import {
  AuthUtils,
  generateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
} from '../utils/auth';
import { rateLimit } from '../middleware/auth';
import { UserService } from '../services/UserService';
import { ApiResponse } from '../types';
import Database from '../config/database';

const router = Router();
const userService = new UserService();

// Rate limiting for token endpoints (security critical)
// 10 requests per 15 minutes to prevent brute force attacks
const tokenRateLimit = rateLimit(15 * 60 * 1000, 10);

/**
 * POST /api/tokens/refresh
 *
 * Exchange a valid refresh token for a new access token and refresh token.
 * Implements token rotation: the old refresh token is revoked when a new one is issued.
 *
 * Request body:
 *   - refreshToken: string (required)
 *
 * Response:
 *   - accessToken: string (new JWT access token)
 *   - refreshToken: string (new refresh token)
 */
router.post('/refresh', tokenRateLimit, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      const response: ApiResponse = {
        success: false,
        error: 'Refresh token required',
      };
      return res.status(400).json(response);
    }

    if (typeof refreshToken !== 'string') {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid refresh token format',
      };
      return res.status(400).json(response);
    }

    const result = await verifyRefreshToken(refreshToken);

    if (!result.valid || !result.userId) {
      const response: ApiResponse = {
        success: false,
        error: 'Invalid or expired refresh token',
      };
      return res.status(401).json(response);
    }

    // Fetch user to get email and username for the new access token
    const user = await userService.findById(result.userId);
    if (!user || !user.isActive) {
      const response: ApiResponse = {
        success: false,
        error: 'User not found or inactive',
      };
      return res.status(401).json(response);
    }

    // Token rotation in a transaction to prevent race conditions
    // If server crashes between revoking and generating, user keeps refresh capability
    const db = Database.getInstance();
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Revoke old refresh token (token rotation for security)
      await revokeRefreshToken(refreshToken, client);

      // Generate new tokens
      const newAccessToken = AuthUtils.generateToken({
        userId: user.id,
        email: user.email,
        username: user.username,
      });
      const newRefreshToken = await generateRefreshToken(user.id, client);

      await client.query('COMMIT');

      const response: ApiResponse = {
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
      };

      res.json(response);
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    // Structured error logging - don't expose stack traces
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Token refresh failed:', { error: errorMessage, timestamp: new Date().toISOString() });
    const response: ApiResponse = {
      success: false,
      error: 'Token refresh failed',
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/tokens/revoke
 *
 * Revoke a refresh token (logout).
 * Can be called with an invalid/expired token without error (idempotent).
 *
 * Request body:
 *   - refreshToken: string (optional - if not provided, just returns success)
 */
router.post('/revoke', tokenRateLimit, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken && typeof refreshToken === 'string') {
      await revokeRefreshToken(refreshToken);
    }

    const response: ApiResponse = {
      success: true,
      data: { message: 'Token revoked' },
    };

    res.json(response);
  } catch (error) {
    // Structured error logging - don't expose stack traces
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Token revocation failed:', { error: errorMessage, timestamp: new Date().toISOString() });
    const response: ApiResponse = {
      success: false,
      error: 'Token revocation failed',
    };
    res.status(500).json(response);
  }
});

export default router;
