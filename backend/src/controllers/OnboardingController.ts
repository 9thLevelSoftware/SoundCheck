import { Request, Response } from 'express';
import { OnboardingService } from '../services/OnboardingService';
import { ApiResponse } from '../types';
import { logError } from '../utils/logger';

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
  saveGenres = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const { genres } = req.body;

      await this.onboardingService.saveGenrePreferences(userId, genres);

      const response: ApiResponse = {
        success: true,
        message: 'Genre preferences saved',
      };
      res.status(200).json(response);
    } catch (error) {
      logError('Save genre preferences error:', { error });

      const errorMessage = error instanceof Error ? error.message : 'Failed to save genre preferences';

      if (errorMessage === 'Must select between 3 and 8 genres') {
        const response: ApiResponse = { success: false, error: errorMessage };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = { success: false, error: errorMessage };
      res.status(500).json(response);
    }
  };

  /**
   * Get genre preferences.
   * GET /api/onboarding/genres
   */
  getGenres = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const genres = await this.onboardingService.getGenrePreferences(userId);

      const response: ApiResponse = {
        success: true,
        data: { genres },
      };
      res.status(200).json(response);
    } catch (error) {
      logError('Get genre preferences error:', { error });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to get genre preferences',
      };
      res.status(500).json(response);
    }
  };

  /**
   * Mark onboarding as complete.
   * POST /api/onboarding/complete
   */
  complete = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      await this.onboardingService.completeOnboarding(userId);

      const response: ApiResponse = {
        success: true,
        message: 'Onboarding completed',
      };
      res.status(200).json(response);
    } catch (error) {
      logError('Complete onboarding error:', { error });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to complete onboarding',
      };
      res.status(500).json(response);
    }
  };

  /**
   * Get onboarding status.
   * GET /api/onboarding/status
   */
  getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
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
    } catch (error) {
      logError('Get onboarding status error:', { error });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to get onboarding status',
      };
      res.status(500).json(response);
    }
  };
}
