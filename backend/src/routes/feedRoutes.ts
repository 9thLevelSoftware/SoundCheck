import { Router } from 'express';
import { CheckinController } from '../controllers/CheckinController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const checkinController = new CheckinController();

// Alias /feed to /checkins/feed for backwards compatibility
router.use(authenticateToken);
router.get('/', checkinController.getActivityFeed);

export default router;
