import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { authenticateToken, rateLimit } from '../middleware/auth';

const router = Router();
const userController = new UserController();

// Rate limiting for search endpoints
const searchRateLimit = rateLimit(15 * 60 * 1000, 60); // 60 requests per 15 minutes

// Search users - requires authentication
// GET /api/search/users?q=query&limit=20&offset=0
router.get('/users', authenticateToken, searchRateLimit, userController.searchUsers);

export default router;
