/**
 * Moderation Routes - Admin Moderation Queue Endpoints
 *
 * GET  /api/admin/moderation       - Get pending moderation items (admin only)
 * PATCH /api/admin/moderation/:itemId - Review a moderation item (admin only)
 *
 * Phase 9: Trust & Safety Foundation
 */

import { Router } from 'express';
import { z } from 'zod';
import { ReportController } from '../controllers/ReportController';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
const reportController = new ReportController();

// Zod validation schema for reviewing a moderation item
const reviewItemSchema = z.object({
  body: z.object({
    action: z.enum(['approved', 'removed', 'user_warned'], {
      required_error: 'Action is required',
      invalid_type_error: 'Invalid action. Must be: approved, removed, or user_warned',
    }),
    notes: z
      .string()
      .max(1000, 'Notes must be 1000 characters or less')
      .optional(),
  }),
  params: z.object({
    itemId: z.string().uuid('Item ID must be a valid UUID'),
  }),
});

// All moderation routes require authentication + admin privileges
router.use(authenticateToken);
router.use(requireAdmin());

// GET /api/admin/moderation - Get pending moderation items
router.get('/', reportController.getModerationQueue);

// PATCH /api/admin/moderation/:itemId - Review a moderation item
router.patch('/:itemId', validate(reviewItemSchema), reportController.reviewModerationItem);

export default router;
