import { Router } from 'express';
import { z } from 'zod';
import { BandController } from '../controllers/BandController';
import { EventController } from '../controllers/EventController';
import { authenticateToken, optionalAuth, rateLimit } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
const bandController = new BandController();
const eventController = new EventController();

// Rate limiting
const generalRateLimit = rateLimit(15 * 60 * 1000, 100); // 100 requests per 15 minutes
const createRateLimit = rateLimit(15 * 60 * 1000, 10); // 10 create requests per 15 minutes

// --- Zod validation schemas ---

const createBandSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(1, 'Band name is required')
      .max(500, 'Band name must be 500 characters or less'),
    description: z.string().max(5000).optional(),
    genre: z.string().max(100).optional(),
    formedYear: z
      .number()
      .int()
      .min(1900)
      .max(new Date().getFullYear() + 1)
      .optional(),
    websiteUrl: z.string().url().max(2000).optional().or(z.literal('')),
    spotifyUrl: z.string().url().max(2000).optional().or(z.literal('')),
    instagramUrl: z.string().url().max(2000).optional().or(z.literal('')),
    facebookUrl: z.string().url().max(2000).optional().or(z.literal('')),
    imageUrl: z.string().url().max(2000).optional().or(z.literal('')),
    hometown: z.string().max(200).optional(),
  }),
});

const updateBandSchema = z.object({
  params: z.object({
    id: z.string().uuid('Band ID must be a valid UUID'),
  }),
  body: z.object({
    name: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    genre: z.string().max(100).optional(),
    formedYear: z
      .number()
      .int()
      .min(1900)
      .max(new Date().getFullYear() + 1)
      .optional(),
    websiteUrl: z.string().url().max(2000).optional().or(z.literal('')),
    spotifyUrl: z.string().url().max(2000).optional().or(z.literal('')),
    instagramUrl: z.string().url().max(2000).optional().or(z.literal('')),
    facebookUrl: z.string().url().max(2000).optional().or(z.literal('')),
    imageUrl: z.string().url().max(2000).optional().or(z.literal('')),
    hometown: z.string().max(200).optional(),
  }),
});

const bandIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Band ID must be a valid UUID'),
  }),
});

// Public routes (no authentication required)
router.get('/popular', generalRateLimit, bandController.getPopularBands);
router.get('/trending', generalRateLimit, bandController.getTrendingBands);
router.get('/genres', generalRateLimit, bandController.getGenres);
router.get('/genre/:genre', generalRateLimit, bandController.getBandsByGenre);
router.get('/', generalRateLimit, optionalAuth, bandController.getBands);
router.get(
  '/:id',
  generalRateLimit,
  optionalAuth,
  validate(bandIdParamSchema),
  bandController.getBandById
);

// Protected routes (authentication required)
router.post(
  '/',
  authenticateToken,
  createRateLimit,
  validate(createBandSchema),
  bandController.createBand
);
router.post('/import', authenticateToken, createRateLimit, bandController.importBand);
router.put(
  '/:id',
  authenticateToken,
  generalRateLimit,
  validate(updateBandSchema),
  bandController.updateBand
);
router.delete(
  '/:id',
  authenticateToken,
  generalRateLimit,
  validate(bandIdParamSchema),
  bandController.deleteBand
);

// Band events
router.get(
  '/:id/events',
  generalRateLimit,
  validate(bandIdParamSchema),
  eventController.getEventsByBand
);

export default router;
