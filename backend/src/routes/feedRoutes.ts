import { Router } from 'express';
import { FeedController } from '../controllers/FeedController';
import { authenticateToken } from '../middleware/auth';
import { createPerUserRateLimit, RateLimitPresets } from '../middleware/perUserRateLimit';

const router = Router();
const feedController = new FeedController();

// All feed routes require authentication
router.use(authenticateToken);

// SEC-014/CFR-014: Rate limit feed endpoints
router.use(createPerUserRateLimit(RateLimitPresets.read));

// New feed endpoints (Phase 5)
router.get('/friends', feedController.getFriendsFeed);
router.get('/global', feedController.getGlobalFeed);
router.get('/events/:eventId', feedController.getEventFeed);
router.get('/happening-now', feedController.getHappeningNow);
router.get('/unseen', feedController.getUnseenCounts);
router.post('/mark-read', feedController.markRead);

// Backward-compat: GET /api/feed/ forwards to friends feed
// so existing mobile app works until updated
router.get('/', feedController.getFriendsFeed);

export default router;
