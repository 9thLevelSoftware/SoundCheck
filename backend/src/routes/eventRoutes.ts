import { Router } from 'express';
import { z } from 'zod';
import { EventController } from '../controllers/EventController';
import { authenticateToken } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
const eventController = new EventController();

// --- Zod validation schemas ---

const createEventSchema = z.object({
  body: z.object({
    venueId: z.string().uuid('venueId must be a valid UUID'),
    bandId: z.string().uuid('bandId must be a valid UUID').optional(),
    eventDate: z.string().refine(
      (val) => !isNaN(new Date(val).getTime()),
      { message: 'A valid eventDate is required' }
    ),
    eventName: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    doorsTime: z.string().optional(),
    startTime: z.string().optional(),
    ticketUrl: z.string().url().max(2000).optional().or(z.literal('')),
    lineup: z.array(z.object({
      bandId: z.string().uuid().optional(),
      bandName: z.string().min(1).max(500).optional(),
      setOrder: z.number().int().min(0).optional(),
      isHeadliner: z.boolean().optional(),
    })).optional(),
  }),
});

const eventIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Event ID must be a valid UUID'),
  }),
});

// Get upcoming events (public)
router.get('/upcoming', eventController.getUpcomingEvents);

// Get trending events (public, enhanced with optional lat/lon)
router.get('/trending', eventController.getTrendingEvents);

// Discovery: nearby upcoming events (requires auth for GPS-based queries)
router.get('/discover', authenticateToken, eventController.getNearbyUpcoming);

// Discovery: events by genre (public)
router.get('/genre/:genre', eventController.getByGenre);

// Discovery: event search (public)
router.get('/search', eventController.searchEvents);

// Personalized recommendations (requires auth for user-based scoring)
router.get('/recommended', authenticateToken, eventController.getRecommendedEvents);

// Get nearby events (requires auth) - check-in auto-suggest (today only)
// MUST be before /:id to avoid param conflict
router.get('/nearby', authenticateToken, eventController.getNearbyEvents);

// On-demand Ticketmaster event lookup (requires auth)
// MUST be before /:id to avoid param conflict
router.get('/lookup/:ticketmasterId', authenticateToken, eventController.lookupEvent);

// Create a new event (requires auth)
router.post('/', authenticateToken, validate(createEventSchema), eventController.createEvent);

// Get event by ID (public)
router.get('/:id', validate(eventIdParamSchema), eventController.getEventById);

// Delete event (requires auth)
router.delete('/:id', authenticateToken, validate(eventIdParamSchema), eventController.deleteEvent);

export default router;
