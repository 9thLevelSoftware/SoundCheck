/**
 * RsvpController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { RsvpService } from '../services/RsvpService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError } from '../utils/errors';

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
  toggle = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { eventId } = req.params;

    const result = await this.rsvpService.toggleRsvp(userId, eventId);

    const response: ApiResponse = {
      success: true,
      data: result,
    };
    res.status(200).json(response);
  });

  /**
   * Get friends going to an event.
   * GET /api/rsvp/:eventId/friends
   */
  getFriendsGoing = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { eventId } = req.params;

    const result = await this.rsvpService.getFriendsGoing(userId, eventId);

    const response: ApiResponse = {
      success: true,
      data: result,
    };
    res.status(200).json(response);
  });

  /**
   * Get current user's RSVP'd event IDs.
   * GET /api/rsvp/me
   */
  getUserRsvps = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const eventIds = await this.rsvpService.getUserRsvps(userId);

    const response: ApiResponse = {
      success: true,
      data: { eventIds },
    };
    res.status(200).json(response);
  });
}
