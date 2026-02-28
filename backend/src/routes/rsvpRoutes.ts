import { Router } from 'express';
import { z } from 'zod';
import { RsvpController } from '../controllers/RsvpController';
import { authenticateToken, rateLimit } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
const rsvpController = new RsvpController();

// Validation schemas
const eventIdParamSchema = z.object({
  params: z.object({
    eventId: z.string().uuid('Event ID must be a valid UUID'),
  }),
});

// Rate limiting to prevent RSVP toggle spam
const rsvpRateLimit = rateLimit(15 * 60 * 1000, 60); // 60 RSVP actions per 15 minutes
const generalRateLimit = rateLimit(15 * 60 * 1000, 100); // 100 reads per 15 minutes

// All RSVP routes require authentication
router.use(authenticateToken);

// Get current user's RSVP'd event IDs (must be before /:eventId to avoid matching "me" as eventId)
// GET /api/rsvp/me
router.get('/me', generalRateLimit, rsvpController.getUserRsvps);

// Toggle RSVP for an event
// POST /api/rsvp/:eventId
router.post('/:eventId', rsvpRateLimit, validate(eventIdParamSchema), rsvpController.toggle);

// Get friends going to an event
// GET /api/rsvp/:eventId/friends
router.get('/:eventId/friends', generalRateLimit, validate(eventIdParamSchema), rsvpController.getFriendsGoing);

export default router;
