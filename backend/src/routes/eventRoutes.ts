import { Router } from 'express';
import { EventController } from '../controllers/EventController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const eventController = new EventController();

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

// Get nearby events (requires auth) - check-in auto-suggest (today only)
// MUST be before /:id to avoid param conflict
router.get('/nearby', authenticateToken, eventController.getNearbyEvents);

// On-demand Ticketmaster event lookup (requires auth)
// MUST be before /:id to avoid param conflict
router.get('/lookup/:ticketmasterId', authenticateToken, eventController.lookupEvent);

// Create a new event (requires auth)
router.post('/', authenticateToken, eventController.createEvent);

// Get event by ID (public)
router.get('/:id', eventController.getEventById);

// Delete event (requires auth)
router.delete('/:id', authenticateToken, eventController.deleteEvent);

export default router;
