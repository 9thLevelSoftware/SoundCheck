/**
 * Share Routes -- Card generation API and public landing pages.
 *
 * API routes (authenticated):
 *   POST /api/share/checkin/:checkinId   -- Generate share card images
 *   POST /api/share/badge/:badgeAwardId  -- Generate share card images
 *
 * Public routes (no auth):
 *   GET /share/c/:checkinId     -- Landing page for shared check-in links
 *   GET /share/b/:badgeAwardId  -- Landing page for shared badge links
 *
 * Phase 10: Viral Growth Engine
 */

import { Router } from 'express';
import { ShareController } from '../controllers/ShareController';
import { authenticateToken } from '../middleware/auth';

const shareController = new ShareController();

// ============================================
// API Router (authenticated card generation)
// ============================================

const apiRouter = Router();

// POST /api/share/checkin/:checkinId -- Generate check-in card images
apiRouter.post('/checkin/:checkinId', authenticateToken, shareController.generateCheckinCard);

// POST /api/share/badge/:badgeAwardId -- Generate badge card images
apiRouter.post('/badge/:badgeAwardId', authenticateToken, shareController.generateBadgeCard);

// ============================================
// Public Router (landing pages, no auth)
// ============================================

const publicRouter = Router();

// GET /share/c/:checkinId -- Public check-in landing page
publicRouter.get('/c/:checkinId', shareController.renderCheckinLanding);

// GET /share/b/:badgeAwardId -- Public badge landing page
publicRouter.get('/b/:badgeAwardId', shareController.renderBadgeLanding);

// ============================================
// Export both routers
// ============================================

export default { api: apiRouter, public: publicRouter };
