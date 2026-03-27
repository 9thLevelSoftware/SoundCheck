/**
 * Report Routes - Content Reporting Endpoints
 *
 * POST /api/reports - Submit a content report (authenticated, validated)
 *
 * Phase 9: Trust & Safety Foundation
 */

import { Router } from 'express';
import { z } from 'zod';
import { ReportController } from '../controllers/ReportController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
const reportController = new ReportController();

// Zod validation schema for report creation
const createReportSchema = z.object({
  body: z.object({
    contentType: z.enum(['checkin', 'comment', 'photo', 'user'], {
      required_error: 'Content type is required',
      invalid_type_error: 'Invalid content type',
    }),
    contentId: z.string().uuid('Content ID must be a valid UUID'),
    reason: z.enum(['spam', 'harassment', 'inappropriate', 'copyright', 'other'], {
      required_error: 'Report reason is required',
      invalid_type_error: 'Invalid report reason',
    }),
    description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  }),
});

// All report routes require authentication
router.use(authenticateToken);

// POST /api/reports - Submit a content report
router.post('/', validate(createReportSchema), reportController.createReport);

export default router;
