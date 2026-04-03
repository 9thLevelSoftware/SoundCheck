/**
 * ClaimController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { ClaimService } from '../services/ClaimService';
import { BandService } from '../services/BandService';
import { VenueService } from '../services/VenueService';
import { ApiResponse, ClaimStatus } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, BadRequestError, ForbiddenError } from '../utils/errors';

export class ClaimController {
  private claimService = new ClaimService();
  private bandService = new BandService();
  private venueService = new VenueService();

  /**
   * Submit a verification claim
   * POST /api/claims
   */
  submitClaim = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const claim = await this.claimService.submitClaim(req.user.id, req.body);

    const response: ApiResponse = {
      success: true,
      data: claim,
      message: 'Claim submitted successfully',
    };
    res.status(201).json(response);
  });

  /**
   * Get current user's claims
   * GET /api/claims/me
   */
  getMyClaims = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const claims = await this.claimService.getMyClaims(req.user.id);

    res.status(200).json({ success: true, data: claims } as ApiResponse);
  });

  /**
   * Get claim by ID
   * GET /api/claims/:id
   */
  getClaimById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const claim = await this.claimService.getClaimById(req.params.id);

    res.status(200).json({ success: true, data: claim } as ApiResponse);
  });

  /**
   * Get all pending claims (admin)
   * GET /api/admin/claims/pending
   */
  getPendingClaims = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const claims = await this.claimService.getPendingClaims();

    res.status(200).json({ success: true, data: claims } as ApiResponse);
  });

  /**
   * Get all claims with optional status filter (admin)
   * GET /api/admin/claims
   */
  getAllClaims = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const status = req.query.status as ClaimStatus | undefined;
    const claims = await this.claimService.getAllClaims(status);

    res.status(200).json({ success: true, data: claims } as ApiResponse);
  });

  /**
   * Review (approve/deny) a claim (admin)
   * PUT /api/admin/claims/:id/review
   */
  reviewClaim = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { status, reviewNotes } = req.body;

    if (status !== 'approved' && status !== 'denied') {
      throw new BadRequestError('Status must be "approved" or "denied"');
    }

    const claim = await this.claimService.reviewClaim(req.params.id, req.user.id, {
      status,
      reviewNotes,
    });

    res.status(200).json({
      success: true,
      data: claim,
      message: `Claim ${status} successfully`,
    } as ApiResponse);
  });

  /**
   * Get aggregate stats for a claimed entity
   * GET /api/claims/stats/:entityType/:entityId
   */
  getEntityStats = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { entityType, entityId } = req.params;

    if (entityType !== 'venue' && entityType !== 'band') {
      throw new BadRequestError('entityType must be "venue" or "band"');
    }

    // Verify user is the claimed owner
    let isOwner: boolean;
    if (entityType === 'band') {
      isOwner = await this.bandService.isClaimedOwner(entityId, req.user.id);
    } else {
      isOwner = await this.venueService.isClaimedOwner(entityId, req.user.id);
    }

    if (!isOwner) {
      throw new ForbiddenError('Only the claimed owner can view entity stats');
    }

    let stats: any;
    if (entityType === 'band') {
      stats = await this.bandService.getBandStats(entityId);
    } else {
      stats = await this.venueService.getVenueStats(entityId);
    }

    res.status(200).json({ success: true, data: stats } as ApiResponse);
  });
}
