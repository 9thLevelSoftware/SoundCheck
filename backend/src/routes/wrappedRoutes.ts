import { Router } from 'express';
import { WrappedController } from '../controllers/WrappedController';
import { authenticateToken, requirePremium } from '../middleware/auth';
import { createPerUserRateLimit, RateLimitPresets } from '../middleware/perUserRateLimit';

const wrappedController = new WrappedController();

// API Router (authenticated)
const apiRouter = Router();

// GET /api/wrapped/:year — Basic Wrapped stats (free)
apiRouter.get('/:year', authenticateToken, wrappedController.getWrapped);

// GET /api/wrapped/:year/detail — Premium detail stats
apiRouter.get(
  '/:year/detail',
  authenticateToken,
  requirePremium(),
  wrappedController.getWrappedDetail
);

// POST /api/wrapped/:year/card/summary — Generate summary card (free)
// API-058: Rate limit CPU-intensive card generation
apiRouter.post(
  '/:year/card/summary',
  authenticateToken,
  createPerUserRateLimit(RateLimitPresets.expensive),
  wrappedController.generateSummaryCard
);

// POST /api/wrapped/:year/card/:statType — Generate per-stat card (premium)
apiRouter.post(
  '/:year/card/:statType',
  authenticateToken,
  requirePremium(),
  createPerUserRateLimit(RateLimitPresets.expensive),
  wrappedController.generateStatCard
);

// Public Router (landing pages)
const publicRouter = Router();

// GET /wrapped/:userId/:year — Public Wrapped landing page
publicRouter.get('/:userId/:year', wrappedController.renderWrappedLanding);

export default { api: apiRouter, public: publicRouter };
