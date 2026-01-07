import { Router } from 'express';
import { ConsentController } from '../controllers/ConsentController';
import { authenticateToken, rateLimit } from '../middleware/auth';

const router = Router();
const consentController = new ConsentController();

// Rate limiting for consent operations
const consentRateLimit = rateLimit(15 * 60 * 1000, 30); // 30 consent operations per 15 minutes

// All consent routes require authentication
router.use(authenticateToken);

// Get current user's consents
// GET /api/users/consents
router.get('/', consentController.getUserConsents);

// Update consent for a specific purpose
// POST /api/users/consents
// Body: { purpose: string, granted: boolean }
router.post('/', consentRateLimit, consentController.updateConsent);

// Get consent history for a specific purpose (audit trail)
// GET /api/users/consents/:purpose/history
router.get('/:purpose/history', consentController.getConsentHistory);

export default router;
