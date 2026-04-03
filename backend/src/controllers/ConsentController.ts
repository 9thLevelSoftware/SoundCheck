/**
 * ConsentController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { ConsentService, VALID_PURPOSES } from '../services/ConsentService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, BadRequestError } from '../utils/errors';

export class ConsentController {
  private consentService: ConsentService;

  constructor(consentService?: ConsentService) {
    this.consentService = consentService ?? new ConsentService();
  }

  /**
   * Get current user's consents
   * GET /api/users/consents
   */
  getUserConsents = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    const consents = await this.consentService.getUserConsents(currentUserId);

    const response: ApiResponse = {
      success: true,
      data: {
        consents,
        validPurposes: VALID_PURPOSES,
      },
    };

    res.status(200).json(response);
  });

  /**
   * Update consent for a specific purpose
   * POST /api/users/consents
   * Body: { purpose: string, granted: boolean }
   */
  updateConsent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { purpose, granted } = req.body;

    // Validate purpose is provided
    if (!purpose) {
      throw new BadRequestError('purpose is required');
    }

    // Validate purpose is a string
    if (typeof purpose !== 'string') {
      throw new BadRequestError('purpose must be a string');
    }

    // Validate granted is provided and is boolean
    if (typeof granted !== 'boolean') {
      throw new BadRequestError('granted must be a boolean');
    }

    // Extract metadata for audit trail
    const metadata = {
      ipAddress: this.getClientIP(req),
      userAgent: req.headers['user-agent'] || undefined,
    };

    const consentRecord = await this.consentService.recordConsent(
      currentUserId,
      purpose,
      granted,
      metadata
    );

    const response: ApiResponse = {
      success: true,
      data: consentRecord,
      message: granted ? 'Consent granted' : 'Consent revoked',
    };

    res.status(200).json(response);
  });

  /**
   * Get consent history for a specific purpose
   * GET /api/users/consents/:purpose/history
   */
  getConsentHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.id;

    if (!currentUserId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { purpose } = req.params;

    if (!purpose) {
      throw new BadRequestError('purpose parameter is required');
    }

    const history = await this.consentService.getConsentHistory(currentUserId, purpose);

    const response: ApiResponse = {
      success: true,
      data: {
        purpose,
        history,
      },
    };

    res.status(200).json(response);
  });

  /**
   * Extract client IP address from request
   * Handles proxied requests (X-Forwarded-For header)
   */
  private getClientIP(req: Request): string | undefined {
    // Check for forwarded IP (behind proxy/load balancer)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
      // Take the first IP (original client)
      return ips.split(',')[0].trim();
    }

    // Fall back to direct connection IP
    return req.ip || req.socket?.remoteAddress || undefined;
  }
}
