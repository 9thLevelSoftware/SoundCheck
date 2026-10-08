import { Router } from 'express';
import { EventController } from '../controllers/EventController';
import { authenticateToken, scopedRateLimit } from '../middleware/auth';
import { createPerUserRateLimit, RateLimitPresets } from '../middleware/perUserRateLimit';

// Public catalog reads. Isolated from the login limiter (RA-017).
const eventsPublicRateLimit = scopedRateLimit('events-public', 15 * 60 * 1000, 120);

const router = Router();
const eventController = new EventController();

// Get upcoming events (public)
router.get('/upcoming', eventsPublicRateLimit, eventController.getUpcomingEvents);

// Get trending events (public, enhanced with optional lat/lon)
router.get('/trending', eventsPublicRateLimit, eventController.getTrendingEvents);

// Discovery: nearby upcoming events (requires auth for GPS-based queries)
router.get('/discover', authenticateToken, eventController.getNearbyUpcoming);

// Discovery: events by genre (public)
router.get('/genre/:genre', eventsPublicRateLimit, eventController.getByGenre);

// Discovery: event search (public)
router.get('/search', eventsPublicRateLimit, eventController.searchEvents);

// Personalized recommendations (requires auth for user-based scoring)
router.get('/recommended', authenticateToken, eventController.getRecommendedEvents);

// Get nearby events (requires auth) - check-in auto-suggest (today only)
// MUST be before /:id to avoid param conflict
router.get('/nearby', authenticateToken, eventController.getNearbyEvents);

// On-demand Ticketmaster event lookup (requires auth)
// MUST be before /:id to avoid param conflict
router.get(
  '/lookup/:ticketmasterId',
  authenticateToken,
  createPerUserRateLimit(RateLimitPresets.expensive),
  eventController.lookupEvent
);

// Create a new event (requires auth)
// SEC-013/CFR-014: Rate limit event creation
router.post(
  '/',
  authenticateToken,
  createPerUserRateLimit(RateLimitPresets.write),
  eventController.createEvent
);

// Get event by ID (public)
router.get('/:id', eventsPublicRateLimit, eventController.getEventById);

// Delete event (requires auth)
// SEC-013/CFR-014: Rate limit event deletion
router.delete(
  '/:id',
  authenticateToken,
  createPerUserRateLimit(RateLimitPresets.write),
  eventController.deleteEvent
);

export default router;
