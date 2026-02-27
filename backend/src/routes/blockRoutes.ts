import { Router } from 'express';
import { BlockController } from '../controllers/BlockController';
import { authenticateToken, rateLimit } from '../middleware/auth';

const router = Router();
const blockController = new BlockController();

// Rate limiting
const blockRateLimit = rateLimit(15 * 60 * 1000, 30); // 30 block/unblock actions per 15 minutes
const generalRateLimit = rateLimit(15 * 60 * 1000, 100); // 100 reads per 15 minutes

// All block routes require authentication

// List blocked users
router.get('/', authenticateToken, generalRateLimit, blockController.getBlockedUsers);

// Check block status with a specific user
router.get('/:userId/status', authenticateToken, generalRateLimit, blockController.checkBlocked);

// Block a user
router.post('/:userId/block', authenticateToken, blockRateLimit, blockController.blockUser);

// Unblock a user
router.delete('/:userId/block', authenticateToken, blockRateLimit, blockController.unblockUser);

export default router;
