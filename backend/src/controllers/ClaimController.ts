import { Request, Response } from 'express';
import { ClaimService } from '../services/ClaimService';
import { ReviewService } from '../services/ReviewService';
import { BandService } from '../services/BandService';
import { VenueService } from '../services/VenueService';
import { ApiResponse, ClaimStatus } from '../types';
import { AppError } from '../utils/errors';
import logger from '../utils/logger';

export class ClaimController {
  private claimService = new ClaimService();
  private reviewService = new ReviewService();
  private bandService = new BandService();
  private venueService = new VenueService();

  /**
   * Submit a verification claim
   * POST /api/claims
   */
  submitClaim = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const claim = await this.claimService.submitClaim(req.user.id, req.body);

      const response: ApiResponse = {
        success: true,
        data: claim,
        message: 'Claim submitted successfully',
      };
      res.status(201).json(response);
    } catch (error) {
      logger.error('Submit claim error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const statusCode = error instanceof AppError ? error.statusCode : 400;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit claim',
      } as ApiResponse);
    }
  };

  /**
   * Get current user's claims
   * GET /api/claims/me
   */
  getMyClaims = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const claims = await this.claimService.getMyClaims(req.user.id);

      res.status(200).json({ success: true, data: claims } as ApiResponse);
    } catch (error) {
      logger.error('Get my claims error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).json({ success: false, error: 'Failed to fetch claims' } as ApiResponse);
    }
  };

  /**
   * Get claim by ID
   * GET /api/claims/:id
   */
  getClaimById = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const claim = await this.claimService.getClaimById(req.params.id);

      res.status(200).json({ success: true, data: claim } as ApiResponse);
    } catch (error) {
      logger.error('Get claim by ID error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch claim',
      } as ApiResponse);
    }
  };

  /**
   * Get all pending claims (admin)
   * GET /api/admin/claims/pending
   */
  getPendingClaims = async (req: Request, res: Response): Promise<void> => {
    try {
      const claims = await this.claimService.getPendingClaims();

      res.status(200).json({ success: true, data: claims } as ApiResponse);
    } catch (error) {
      logger.error('Get pending claims error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).json({ success: false, error: 'Failed to fetch pending claims' } as ApiResponse);
    }
  };

  /**
   * Get all claims with optional status filter (admin)
   * GET /api/admin/claims
   */
  getAllClaims = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = req.query.status as ClaimStatus | undefined;
      const claims = await this.claimService.getAllClaims(status);

      res.status(200).json({ success: true, data: claims } as ApiResponse);
    } catch (error) {
      logger.error('Get all claims error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).json({ success: false, error: 'Failed to fetch claims' } as ApiResponse);
    }
  };

  /**
   * Review (approve/deny) a claim (admin)
   * PUT /api/admin/claims/:id/review
   */
  reviewClaim = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const { status, reviewNotes } = req.body;

      if (status !== 'approved' && status !== 'denied') {
        res.status(400).json({
          success: false,
          error: 'Status must be "approved" or "denied"',
        } as ApiResponse);
        return;
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
    } catch (error) {
      logger.error('Review claim error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const statusCode = error instanceof AppError ? error.statusCode : 400;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to review claim',
      } as ApiResponse);
    }
  };

  /**
   * Claimed owner responds to a review
   * POST /api/claims/reviews/:reviewId/respond
   */
  respondToReview = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const { reviewId } = req.params;
      const { ownerResponse } = req.body;

      if (!ownerResponse || typeof ownerResponse !== 'string' || ownerResponse.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'ownerResponse is required and must be a non-empty string',
        } as ApiResponse);
        return;
      }

      const review = await this.reviewService.respondToReview(reviewId, req.user.id, ownerResponse.trim());

      res.status(200).json({
        success: true,
        data: review,
        message: 'Response posted successfully',
      } as ApiResponse);
    } catch (error) {
      logger.error('Respond to review error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const statusCode = error instanceof AppError ? error.statusCode : 400;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to respond to review',
      } as ApiResponse);
    }
  };

  /**
   * Get aggregate stats for a claimed entity
   * GET /api/claims/stats/:entityType/:entityId
   */
  getEntityStats = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const { entityType, entityId } = req.params;

      if (entityType !== 'venue' && entityType !== 'band') {
        res.status(400).json({
          success: false,
          error: 'entityType must be "venue" or "band"',
        } as ApiResponse);
        return;
      }

      // Verify user is the claimed owner
      let isOwner = false;
      if (entityType === 'band') {
        isOwner = await this.bandService.isClaimedOwner(entityId, req.user.id);
      } else {
        isOwner = await this.venueService.isClaimedOwner(entityId, req.user.id);
      }

      if (!isOwner) {
        res.status(403).json({
          success: false,
          error: 'Only the claimed owner can view entity stats',
        } as ApiResponse);
        return;
      }

      let stats: any;
      if (entityType === 'band') {
        stats = await this.bandService.getBandStats(entityId);
      } else {
        stats = await this.venueService.getVenueStats(entityId);
      }

      res.status(200).json({ success: true, data: stats } as ApiResponse);
    } catch (error) {
      logger.error('Get entity stats error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      const statusCode = error instanceof AppError ? error.statusCode : 500;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch entity stats',
      } as ApiResponse);
    }
  };
}
