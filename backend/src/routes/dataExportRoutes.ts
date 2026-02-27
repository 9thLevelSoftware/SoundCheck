import { Router, Request, Response } from 'express';
import { DataExportService } from '../services/DataExportService';
import { AuditService } from '../services/AuditService';
import { authenticateToken, rateLimit } from '../middleware/auth';
import { ApiResponse } from '../types';

const router = Router();
const dataExportService = new DataExportService();
const auditService = new AuditService();

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
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const exportData = await dataExportService.exportUserData(userId);

      // Audit log: data export
      auditService.logDataExport(userId, req);

      // Set headers for file download
      const filename = `soundcheck-data-export-${new Date().toISOString().split('T')[0]}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      res.status(200).json(exportData);
    } catch (error: any) {
      // Sanitize error messages - only expose safe messages to client
      const isUserNotFound = error.message === 'User not found';
      const response: ApiResponse = {
        success: false,
        error: isUserNotFound ? 'User not found' : 'Failed to export user data',
      };
      res.status(isUserNotFound ? 404 : 500).json(response);
    }
  }
);

export default router;
