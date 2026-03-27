/**
 * Claim Routes -- Verification claim submission, admin review, and claimed owner features.
 *
 * Public routes (authenticated users):
 *   POST /api/claims                              -- Submit a claim
 *   GET  /api/claims/me                           -- List user's own claims
 *   GET  /api/claims/stats/:entityType/:entityId  -- Get claimed entity stats
 *   GET  /api/claims/:id                          -- Get claim by ID
 *
 * Admin routes:
 *   GET  /api/admin/claims                        -- List all claims (optional ?status filter)
 *   GET  /api/admin/claims/pending                -- List pending claims (FIFO)
 *   PUT  /api/admin/claims/:id/review             -- Approve or deny a claim
 *
 * Phase 11: Platform Trust & Between-Show Retention
 */

import { Router } from 'express';
import { z } from 'zod';
import { ClaimController } from '../controllers/ClaimController';
import { authenticateToken, requireAdmin, rateLimit } from '../middleware/auth';
import { validate } from '../middleware/validate';

const claimController = new ClaimController();

// --- Zod validation schemas ---

const submitClaimSchema = z.object({
  body: z.object({
    entityType: z.enum(['venue', 'band'], {
      required_error: 'entityType is required',
      invalid_type_error: 'entityType must be "venue" or "band"',
    }),
    entityId: z.string().uuid('entityId must be a valid UUID'),
    evidenceText: z
      .string()
      .min(10, 'Evidence must be at least 10 characters')
      .max(5000, 'Evidence must be 5000 characters or less')
      .optional(),
    evidenceUrl: z.string().url('Evidence URL must be a valid URL').max(2000).optional(),
  }),
});

const claimIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Claim ID must be a valid UUID'),
  }),
});

const entityStatsParamSchema = z.object({
  params: z.object({
    entityType: z.enum(['venue', 'band'], {
      invalid_type_error: 'entityType must be "venue" or "band"',
    }),
    entityId: z.string().uuid('entityId must be a valid UUID'),
  }),
});

const reviewClaimSchema = z.object({
  params: z.object({
    id: z.string().uuid('Claim ID must be a valid UUID'),
  }),
  body: z.object({
    status: z.enum(['approved', 'denied'], {
      required_error: 'Status is required',
      invalid_type_error: 'Status must be "approved" or "denied"',
    }),
    reviewNotes: z.string().max(1000, 'Notes must be 1000 characters or less').optional(),
  }),
});

// ============================================
// Public Router (authenticated users)
// ============================================

const publicRouter = Router();

// Rate limit claim submissions: 5 per 15 minutes per user
publicRouter.post(
  '/',
  authenticateToken,
  rateLimit(15 * 60 * 1000, 5),
  validate(submitClaimSchema),
  claimController.submitClaim
);
publicRouter.get('/me', authenticateToken, claimController.getMyClaims);

// Claimed owner features
publicRouter.get(
  '/stats/:entityType/:entityId',
  authenticateToken,
  validate(entityStatsParamSchema),
  claimController.getEntityStats
);

// Generic :id route must be last
publicRouter.get(
  '/:id',
  authenticateToken,
  validate(claimIdParamSchema),
  claimController.getClaimById
);

// ============================================
// Admin Router (admin only)
// ============================================

const adminRouter = Router();

adminRouter.get('/', authenticateToken, requireAdmin(), claimController.getAllClaims);
adminRouter.get('/pending', authenticateToken, requireAdmin(), claimController.getPendingClaims);
adminRouter.put(
  '/:id/review',
  authenticateToken,
  requireAdmin(),
  validate(reviewClaimSchema),
  claimController.reviewClaim
);

// ============================================
// Export both routers
// ============================================

export default { public: publicRouter, admin: adminRouter };
