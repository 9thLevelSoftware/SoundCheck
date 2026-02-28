import { Router } from 'express';
import { TrendingController } from '../controllers/TrendingController';
import { authenticateToken, rateLimit } from '../middleware/auth';

const router = Router();
const trendingController = new TrendingController();
const trendingRateLimit = rateLimit(15 * 60 * 1000, 60);

// GET /api/trending?lat=X&lon=Y&radius=80&days=30&limit=20
router.get('/', authenticateToken, trendingRateLimit, trendingController.getTrending);

export default router;
