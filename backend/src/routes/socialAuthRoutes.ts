import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SocialAuthService } from '../services/SocialAuthService';
import { ApiResponse } from '../types';
import { logError, logInfo } from '../utils/logger';

const router = Router();
const socialAuthService = new SocialAuthService();

// Validation schemas
const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'ID token is required'),
});

const appleAuthSchema = z.object({
  identityToken: z.string().min(1, 'Identity token is required'),
  fullName: z
    .object({
      givenName: z.string().optional(),
      familyName: z.string().optional(),
    })
    .optional(),
});

/**
 * POST /api/auth/social/google
 * Authenticate with Google ID token
 *
 * Request body:
 * - idToken: string - The Google ID token from mobile client
 *
 * Response:
 * - user: User object
 * - token: JWT access token
 * - refreshToken: Refresh token for token renewal
 * - isNewUser: boolean - Whether this is a newly created account
 */
router.post(
  '/google',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate request body
      const validation = googleAuthSchema.safeParse(req.body);
      if (!validation.success) {
        const response: ApiResponse = {
          success: false,
          error: validation.error.errors[0]?.message || 'Invalid request',
        };
        res.status(400).json(response);
        return;
      }

      const { idToken } = validation.data;

      // Verify the Google token
      const profile = await socialAuthService.verifyGoogleToken(idToken);
      if (!profile) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid or expired Google token',
        };
        res.status(401).json(response);
        return;
      }

      // Authenticate or create user
      const result = await socialAuthService.authenticateOrCreate(profile);

      logInfo('Google social auth successful', {
        userId: result.user.id,
        email: result.user.email,
        isNewUser: result.isNewUser,
      });

      const response: ApiResponse = {
        success: true,
        data: {
          user: result.user,
          token: result.token,
          refreshToken: result.refreshToken,
          isNewUser: result.isNewUser,
        },
      };

      res.status(result.isNewUser ? 201 : 200).json(response);
    } catch (error: any) {
      logError('Google social auth failed', { error: error.message });

      // Handle known error messages
      if (error.message === 'Account is deactivated') {
        const response: ApiResponse = {
          success: false,
          error: 'Account is deactivated',
        };
        res.status(403).json(response);
        return;
      }

      if (error.message === 'Email is required for new social sign-in') {
        const response: ApiResponse = {
          success: false,
          error: 'Email is required for new social sign-in',
        };
        res.status(400).json(response);
        return;
      }

      next(error);
    }
  }
);

/**
 * POST /api/auth/social/apple
 * Authenticate with Apple identity token
 *
 * Request body:
 * - identityToken: string - The Apple identity token from mobile client
 * - fullName: { givenName?: string, familyName?: string } - Optional, only on first sign-in
 *
 * Response:
 * - user: User object
 * - token: JWT access token
 * - refreshToken: Refresh token for token renewal
 * - isNewUser: boolean - Whether this is a newly created account
 */
router.post(
  '/apple',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate request body
      const validation = appleAuthSchema.safeParse(req.body);
      if (!validation.success) {
        const response: ApiResponse = {
          success: false,
          error: validation.error.errors[0]?.message || 'Invalid request',
        };
        res.status(400).json(response);
        return;
      }

      const { identityToken, fullName } = validation.data;

      // Verify the Apple token
      const profile = await socialAuthService.verifyAppleToken(identityToken, fullName);
      if (!profile) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid or expired Apple token',
        };
        res.status(401).json(response);
        return;
      }

      // Authenticate or create user
      const result = await socialAuthService.authenticateOrCreate(profile);

      logInfo('Apple social auth successful', {
        userId: result.user.id,
        email: result.user.email,
        isNewUser: result.isNewUser,
      });

      const response: ApiResponse = {
        success: true,
        data: {
          user: result.user,
          token: result.token,
          refreshToken: result.refreshToken,
          isNewUser: result.isNewUser,
        },
      };

      res.status(result.isNewUser ? 201 : 200).json(response);
    } catch (error: any) {
      logError('Apple social auth failed', { error: error.message });

      // Handle known error messages
      if (error.message === 'Account is deactivated') {
        const response: ApiResponse = {
          success: false,
          error: 'Account is deactivated',
        };
        res.status(403).json(response);
        return;
      }

      if (error.message === 'Email is required for new social sign-in') {
        const response: ApiResponse = {
          success: false,
          error: 'Email is required for new social sign-in',
        };
        res.status(400).json(response);
        return;
      }

      next(error);
    }
  }
);

export default router;
