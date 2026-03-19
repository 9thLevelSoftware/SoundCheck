import { Router } from 'express';
import { SubscriptionController } from '../controllers/SubscriptionController';
import { authenticateToken } from '../middleware/auth';
import { createPerUserRateLimit } from '../middleware/perUserRateLimit';

const subscriptionController = new SubscriptionController();
const router = Router();

// POST /api/subscription/webhook — RevenueCat webhook (no auth middleware — validates header internally)
// API-057: Rate limit webhook to 30 requests per minute (IP-based since no auth)
router.post('/webhook', createPerUserRateLimit({
  maxRequests: 30,
  windowMs: 60 * 1000,
  message: 'Webhook rate limit exceeded',
}), subscriptionController.handleWebhook);

// GET /api/subscription/status — Current user's subscription status
router.get('/status', authenticateToken, subscriptionController.getStatus);

export default router;
