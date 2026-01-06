import { Router } from 'express';
import { FollowController } from '../controllers/FollowController';
import { authenticateToken, rateLimit } from '../middleware/auth';

const router = Router();
const followController = new FollowController();

// Rate limiting to prevent follow/unfollow spam
const followRateLimit = rateLimit(15 * 60 * 1000, 30); // 30 follow/unfollow actions per 15 minutes

// All follow routes require authentication
router.use(authenticateToken);

// Follow a user
// POST /api/follow/:userId
router.post('/:userId', followRateLimit, followController.followUser);

// Unfollow a user
// DELETE /api/follow/:userId
router.delete('/:userId', followRateLimit, followController.unfollowUser);

// Check if current user is following a specific user
// GET /api/follow/:userId/status
router.get('/:userId/status', followController.getFollowStatus);

export default router;
