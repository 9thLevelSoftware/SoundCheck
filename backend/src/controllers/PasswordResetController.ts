import { Request, Response } from 'express';
import { ApiResponse } from '../types';
import { PasswordResetService } from '../services/PasswordResetService';
import logger, { logError } from '../utils/logger';

/**
 * PasswordResetController - HTTP handlers for forgot-password and reset-password.
 *
 * Both endpoints return 200 for valid requests to prevent email enumeration.
 */
export class PasswordResetController {
  private passwordResetService: PasswordResetService;

  constructor(passwordResetService?: PasswordResetService) {
    this.passwordResetService = passwordResetService || new PasswordResetService();
  }

  /**
   * POST /api/auth/forgot-password
   *
   * Request body: { email: string }
   * Always returns 200 with a generic message (no email enumeration).
   */
  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    // API-019: Enforce a minimum response time to prevent timing-based email enumeration.
    // The response is sent after at least MIN_RESPONSE_MS regardless of internal path taken.
    const MIN_RESPONSE_MS = 500;
    const start = Date.now();

    try {
      const { email } = req.body;

      const result = await this.passwordResetService.requestReset(email);

      const response: ApiResponse = {
        success: true,
        data: { message: result.message },
      };

      const elapsed = Date.now() - start;
      const delay = Math.max(0, MIN_RESPONSE_MS - elapsed);
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      res.status(200).json(response);
    } catch (error) {
      logError('Error in forgotPassword handler', { error });

      const elapsed = Date.now() - start;
      const delay = Math.max(0, MIN_RESPONSE_MS - elapsed);
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response: ApiResponse = {
        success: false,
        error: 'An error occurred processing your request. Please try again later.',
      };

      res.status(500).json(response);
    }
  };

  /**
   * POST /api/auth/reset-password
   *
   * Request body: { token: string, newPassword: string }
   * Returns 200 on success, 400 for invalid/expired token or weak password.
   */
  resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, newPassword } = req.body;

      await this.passwordResetService.resetPassword(token, newPassword);

      const response: ApiResponse = {
        success: true,
        data: { message: 'Password reset successful. Please log in with your new password.' },
      };

      res.status(200).json(response);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      const message =
        statusCode === 400
          ? error.message
          : 'An error occurred processing your request. Please try again later.';

      logError('Error in resetPassword handler', { error: error.message || error });

      const response: ApiResponse = {
        success: false,
        error: message,
      };

      res.status(statusCode).json(response);
    }
  };
}

export default new PasswordResetController();
