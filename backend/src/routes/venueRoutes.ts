import { Router } from 'express';
import { z } from 'zod';
import { VenueController } from '../controllers/VenueController';
import { EventController } from '../controllers/EventController';
import { authenticateToken, optionalAuth, rateLimit } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
const venueController = new VenueController();
const eventController = new EventController();

// Rate limiting
const generalRateLimit = rateLimit(15 * 60 * 1000, 100); // 100 requests per 15 minutes
const createRateLimit = rateLimit(15 * 60 * 1000, 10); // 10 create requests per 15 minutes

// --- Zod validation schemas ---

const venueTypeEnum = z.enum([
  'concert_hall', 'club', 'arena', 'outdoor', 'bar', 'theater', 'stadium', 'other',
]);

const createVenueSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Venue name is required').max(500, 'Venue name must be 500 characters or less'),
    description: z.string().max(5000).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(200).optional(),
    state: z.string().max(200).optional(),
    country: z.string().max(200).optional(),
    postalCode: z.string().max(20).optional(),
    latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90').optional(),
    longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180').optional(),
    websiteUrl: z.string().url().max(2000).optional().or(z.literal('')),
    phone: z.string().max(30).optional(),
    email: z.string().email().max(320).optional().or(z.literal('')),
    capacity: z.number().int().min(1, 'Capacity must be a positive integer').optional(),
    venueType: venueTypeEnum.optional(),
    imageUrl: z.string().url().max(2000).optional().or(z.literal('')),
  }),
});

const updateVenueSchema = z.object({
  params: z.object({
    id: z.string().uuid('Venue ID must be a valid UUID'),
  }),
  body: z.object({
    name: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    address: z.string().max(500).optional(),
    city: z.string().max(200).optional(),
    state: z.string().max(200).optional(),
    country: z.string().max(200).optional(),
    postalCode: z.string().max(20).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    websiteUrl: z.string().url().max(2000).optional().or(z.literal('')),
    phone: z.string().max(30).optional(),
    email: z.string().email().max(320).optional().or(z.literal('')),
    capacity: z.number().int().min(1).optional(),
    venueType: venueTypeEnum.optional(),
    imageUrl: z.string().url().max(2000).optional().or(z.literal('')),
  }),
});

const venueIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Venue ID must be a valid UUID'),
  }),
});

// Public routes (no authentication required)
router.get('/popular', generalRateLimit, venueController.getPopularVenues);
router.get('/near', generalRateLimit, venueController.getVenuesNear);
router.get('/', generalRateLimit, optionalAuth, venueController.getVenues);
router.get('/:id', generalRateLimit, optionalAuth, validate(venueIdParamSchema), venueController.getVenueById);

// Protected routes (authentication required)
router.post('/', authenticateToken, createRateLimit, validate(createVenueSchema), venueController.createVenue);
router.post('/import', authenticateToken, createRateLimit, venueController.importVenue);
router.put('/:id', authenticateToken, generalRateLimit, validate(updateVenueSchema), venueController.updateVenue);
router.delete('/:id', authenticateToken, generalRateLimit, validate(venueIdParamSchema), venueController.deleteVenue);

// Venue events
router.get('/:id/events', generalRateLimit, validate(venueIdParamSchema), eventController.getEventsByVenue);

export default router;
