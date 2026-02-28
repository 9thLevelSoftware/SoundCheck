import { Request, Response } from 'express';
import { ClaimService } from '../services/ClaimService';
import { ApiResponse, ClaimStatus } from '../types';
import { AppError } from '../utils/errors';

export class ClaimController {
  private claimService = new ClaimService();

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
      console.error('Submit claim error:', error);
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
      console.error('Get my claims error:', error);
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
      console.error('Get claim by ID error:', error);
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
      console.error('Get pending claims error:', error);
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
      console.error('Get all claims error:', error);
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
      console.error('Review claim error:', error);
      const statusCode = error instanceof AppError ? error.statusCode : 400;
      res.status(statusCode).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to review claim',
      } as ApiResponse);
    }
  };
}
