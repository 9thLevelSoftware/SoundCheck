import { Request, Response } from 'express';
import { ConsentService, VALID_PURPOSES } from '../services/ConsentService';
import { ApiResponse } from '../types';
import { logError } from '../utils/logger';

export class ConsentController {
  private consentService: ConsentService;

  constructor(consentService?: ConsentService) {
    this.consentService = consentService ?? new ConsentService();
  }

  /**
   * Get current user's consents
   * GET /api/users/consents
   */
  getUserConsents = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user?.id;

      if (!currentUserId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
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
    } catch (error) {
      logError('Get user consents error:', { error });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to get user consents',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Update consent for a specific purpose
   * POST /api/users/consents
   * Body: { purpose: string, granted: boolean }
   */
  updateConsent = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user?.id;

      if (!currentUserId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { purpose, granted } = req.body;

      // Validate purpose is provided
      if (!purpose) {
        const response: ApiResponse = {
          success: false,
          error: 'purpose is required',
        };
        res.status(400).json(response);
        return;
      }

      // Validate purpose is a string
      if (typeof purpose !== 'string') {
        const response: ApiResponse = {
          success: false,
          error: 'purpose must be a string',
        };
        res.status(400).json(response);
        return;
      }

      // Validate granted is provided and is boolean
      if (typeof granted !== 'boolean') {
        const response: ApiResponse = {
          success: false,
          error: 'granted must be a boolean',
        };
        res.status(400).json(response);
        return;
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
    } catch (error) {
      logError('Update consent error:', { error });

      const errorMessage = error instanceof Error ? error.message : 'Failed to update consent';

      // Check if it's a validation error (invalid purpose)
      if (errorMessage.includes('Invalid consent purpose')) {
        const response: ApiResponse = {
          success: false,
          error: errorMessage,
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: false,
        error: errorMessage,
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get consent history for a specific purpose
   * GET /api/users/consents/:purpose/history
   */
  getConsentHistory = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUserId = req.user?.id;

      if (!currentUserId) {
        const response: ApiResponse = {
          success: false,
          error: 'Authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const { purpose } = req.params;

      if (!purpose) {
        const response: ApiResponse = {
          success: false,
          error: 'purpose parameter is required',
        };
        res.status(400).json(response);
        return;
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
    } catch (error) {
      logError('Get consent history error:', { error });

      const errorMessage = error instanceof Error ? error.message : 'Failed to get consent history';

      // Check if it's a validation error (invalid purpose)
      if (errorMessage.includes('Invalid consent purpose')) {
        const response: ApiResponse = {
          success: false,
          error: errorMessage,
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: false,
        error: errorMessage,
      };

      res.status(500).json(response);
    }
  };

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
