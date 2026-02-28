/**
 * Claim Routes -- Verification claim submission and admin review.
 *
 * Public routes (authenticated users):
 *   POST /api/claims        -- Submit a claim
 *   GET  /api/claims/me     -- List user's own claims
 *   GET  /api/claims/:id    -- Get claim by ID
 *
 * Admin routes:
 *   GET  /api/admin/claims           -- List all claims (optional ?status filter)
 *   GET  /api/admin/claims/pending   -- List pending claims (FIFO)
 *   PUT  /api/admin/claims/:id/review -- Approve or deny a claim
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
