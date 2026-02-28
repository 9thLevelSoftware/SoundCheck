import { Request, Response } from 'express';
import { RsvpService } from '../services/RsvpService';
import { ApiResponse } from '../types';
import { logError } from '../utils/logger';

/**
 * RsvpController: HTTP handlers for event RSVP ("I'm Going") operations.
 *
 * Phase 10: Viral Growth Engine (Plan 01)
 */
export class RsvpController {
  private rsvpService: RsvpService;

  constructor(rsvpService?: RsvpService) {
    this.rsvpService = rsvpService ?? new RsvpService();
  }

  /**
   * Toggle RSVP for an event.
   * POST /api/rsvp/:eventId
   */
  toggle = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const { eventId } = req.params;

      const result = await this.rsvpService.toggleRsvp(userId, eventId);

      const response: ApiResponse = {
        success: true,
        data: result,
      };
      res.status(200).json(response);
    } catch (error) {
      logError('RSVP toggle error:', { error });

      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle RSVP';

      if (errorMessage === 'Event not found or cancelled') {
        const response: ApiResponse = { success: false, error: errorMessage };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = { success: false, error: errorMessage };
      res.status(500).json(response);
    }
  };

  /**
   * Get friends going to an event.
   * GET /api/rsvp/:eventId/friends
   */
  getFriendsGoing = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const { eventId } = req.params;

      const result = await this.rsvpService.getFriendsGoing(userId, eventId);

      const response: ApiResponse = {
        success: true,
        data: result,
      };
      res.status(200).json(response);
    } catch (error) {
      logError('Get friends going error:', { error });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to get friends going',
      };
      res.status(500).json(response);
    }
  };

  /**
   * Get current user's RSVP'd event IDs.
   * GET /api/rsvp/me
   */
  getUserRsvps = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const eventIds = await this.rsvpService.getUserRsvps(userId);

      const response: ApiResponse = {
        success: true,
        data: { eventIds },
      };
      res.status(200).json(response);
    } catch (error) {
      logError('Get user RSVPs error:', { error });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to get user RSVPs',
      };
      res.status(500).json(response);
    }
  };
}
