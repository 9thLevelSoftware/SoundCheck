import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { EventController } from '../controllers/EventController';
import { SearchController } from '../controllers/SearchController';
import { authenticateToken, rateLimit } from '../middleware/auth';

const router = Router();
const userController = new UserController();
const eventController = new EventController();
const searchController = new SearchController();

// Rate limiting for search endpoints
const searchRateLimit = rateLimit(15 * 60 * 1000, 60); // 60 requests per 15 minutes

// Unified search across bands, venues, events
// GET /api/search?q=query&types=band,venue,event&limit=10
router.get('/', authenticateToken, searchRateLimit, searchController.search);

// Search users - requires authentication
// GET /api/search/users?q=query&limit=20&offset=0
router.get('/users', authenticateToken, searchRateLimit, userController.searchUsers);

// Search events - public with rate limiting
// GET /api/search/events?q=query&limit=20
router.get('/events', searchRateLimit, eventController.searchEvents);

export default router;
