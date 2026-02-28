import { Router } from 'express';
import { z } from 'zod';
import { OnboardingController } from '../controllers/OnboardingController';
import { authenticateToken, rateLimit } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
const onboardingController = new OnboardingController();

// Validation schemas
const saveGenrePreferencesSchema = z.object({
  body: z.object({
    genres: z.array(z.string().min(1).max(100)).min(3, 'Must select at least 3 genres').max(8, 'Cannot select more than 8 genres'),
  }),
});

// Rate limiting
const writeRateLimit = rateLimit(15 * 60 * 1000, 30); // 30 writes per 15 minutes
const generalRateLimit = rateLimit(15 * 60 * 1000, 100); // 100 reads per 15 minutes

// All onboarding routes require authentication
router.use(authenticateToken);

// Save genre preferences
// POST /api/onboarding/genres
router.post('/genres', writeRateLimit, validate(saveGenrePreferencesSchema), onboardingController.saveGenres);

// Get genre preferences
// GET /api/onboarding/genres
router.get('/genres', generalRateLimit, onboardingController.getGenres);

// Mark onboarding as complete
// POST /api/onboarding/complete
router.post('/complete', writeRateLimit, onboardingController.complete);

// Get onboarding status
// GET /api/onboarding/status
router.get('/status', generalRateLimit, onboardingController.getStatus);

export default router;
