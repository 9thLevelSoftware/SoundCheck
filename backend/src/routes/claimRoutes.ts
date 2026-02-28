/**
 * Claim Routes -- Verification claim submission, admin review, and claimed owner features.
 *
 * Public routes (authenticated users):
 *   POST /api/claims                              -- Submit a claim
 *   GET  /api/claims/me                           -- List user's own claims
 *   GET  /api/claims/stats/:entityType/:entityId  -- Get claimed entity stats
 *   POST /api/claims/reviews/:reviewId/respond     -- Respond to a review as owner
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
import { ClaimController } from '../controllers/ClaimController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const claimController = new ClaimController();

// ============================================
// Public Router (authenticated users)
// ============================================

const publicRouter = Router();

publicRouter.post('/', authenticateToken, claimController.submitClaim);
publicRouter.get('/me', authenticateToken, claimController.getMyClaims);

// Claimed owner features
publicRouter.get('/stats/:entityType/:entityId', authenticateToken, claimController.getEntityStats);
publicRouter.post('/reviews/:reviewId/respond', authenticateToken, claimController.respondToReview);

// Generic :id route must be last
publicRouter.get('/:id', authenticateToken, claimController.getClaimById);

// ============================================
// Admin Router (admin only)
// ============================================

const adminRouter = Router();

adminRouter.get('/', authenticateToken, requireAdmin(), claimController.getAllClaims);
adminRouter.get('/pending', authenticateToken, requireAdmin(), claimController.getPendingClaims);
adminRouter.put('/:id/review', authenticateToken, requireAdmin(), claimController.reviewClaim);

// ============================================
// Export both routers
// ============================================

export default { public: publicRouter, admin: adminRouter };
