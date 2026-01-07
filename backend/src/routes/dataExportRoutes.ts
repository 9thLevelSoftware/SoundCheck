import { Router, Request, Response } from 'express';
import { DataExportService } from '../services/DataExportService';
import { authenticateToken, rateLimit } from '../middleware/auth';
import { ApiResponse } from '../types';

const router = Router();
const dataExportService = new DataExportService();

// Rate limit for export endpoint (1 request per 5 minutes)
const exportRateLimit = rateLimit(5 * 60 * 1000, 1);

/**
 * GET /api/users/export
 * Export all user data in GDPR-compliant format
 * Authenticated endpoint - returns JSON file download
 */
router.get(
  '/export',
  authenticateToken,
  exportRateLimit,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;

      const exportData = await dataExportService.exportUserData(userId);

      // Set headers for file download
      const filename = `pitpulse-data-export-${new Date().toISOString().split('T')[0]}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      res.status(200).json(exportData);
    } catch (error: any) {
      const response: ApiResponse = {
        success: false,
        error: error.message || 'Failed to export user data',
      };
      res.status(error.message === 'User not found' ? 404 : 500).json(response);
    }
  }
);

export default router;
