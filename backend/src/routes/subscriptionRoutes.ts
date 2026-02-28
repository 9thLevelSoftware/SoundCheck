import { Router } from 'express';
import { SubscriptionController } from '../controllers/SubscriptionController';
import { authenticateToken } from '../middleware/auth';

const subscriptionController = new SubscriptionController();
const router = Router();

// POST /api/subscription/webhook — RevenueCat webhook (no auth middleware — validates header internally)
router.post('/webhook', subscriptionController.handleWebhook);

// GET /api/subscription/status — Current user's subscription status
router.get('/status', authenticateToken, subscriptionController.getStatus);

export default router;
