/**
 * OnboardingController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { OnboardingService } from '../services/OnboardingService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError } from '../utils/errors';

/**
 * OnboardingController: HTTP handlers for onboarding genre preferences
 * and completion tracking.
 *
 * Phase 10: Viral Growth Engine (Plan 01)
 */
export class OnboardingController {
  private onboardingService: OnboardingService;

  constructor(onboardingService?: OnboardingService) {
    this.onboardingService = onboardingService ?? new OnboardingService();
  }

  /**
   * Save genre preferences.
   * POST /api/onboarding/genres
   * Body: { genres: string[] } (3-8 items)
   */
  saveGenres = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { genres } = req.body;

    await this.onboardingService.saveGenrePreferences(userId, genres);

    const response: ApiResponse = {
      success: true,
      message: 'Genre preferences saved',
    };
    res.status(200).json(response);
  });

  /**
   * Get genre preferences.
   * GET /api/onboarding/genres
   */
  getGenres = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const genres = await this.onboardingService.getGenrePreferences(userId);

    const response: ApiResponse = {
      success: true,
      data: { genres },
    };
    res.status(200).json(response);
  });

  /**
   * Mark onboarding as complete.
   * POST /api/onboarding/complete
   */
  complete = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    await this.onboardingService.completeOnboarding(userId);

    const response: ApiResponse = {
      success: true,
      message: 'Onboarding completed',
    };
    res.status(200).json(response);
  });

  /**
   * Get onboarding status.
   * GET /api/onboarding/status
   */
  getStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const [completed, genres] = await Promise.all([
      this.onboardingService.isOnboardingComplete(userId),
      this.onboardingService.getGenrePreferences(userId),
    ]);

    const response: ApiResponse = {
      success: true,
      data: { completed, genres },
    };
    res.status(200).json(response);
  });
}
