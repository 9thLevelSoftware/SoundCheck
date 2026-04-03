"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const VenueController_1 = require("../controllers/VenueController");
const EventController_1 = require("../controllers/EventController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
const venueController = new VenueController_1.VenueController();
const eventController = new EventController_1.EventController();
// Rate limiting
const generalRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 100); // 100 requests per 15 minutes
const createRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 10); // 10 create requests per 15 minutes
// --- Zod validation schemas ---
const venueTypeEnum = zod_1.z.enum([
    'concert_hall',
    'club',
    'arena',
    'outdoor',
    'bar',
    'theater',
    'stadium',
    'other',
]);
const createVenueSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z
            .string()
            .min(1, 'Venue name is required')
            .max(500, 'Venue name must be 500 characters or less'),
        description: zod_1.z.string().max(5000).optional(),
        address: zod_1.z.string().max(500).optional(),
        city: zod_1.z.string().max(200).optional(),
        state: zod_1.z.string().max(200).optional(),
        country: zod_1.z.string().max(200).optional(),
        postalCode: zod_1.z.string().max(20).optional(),
        latitude: zod_1.z
            .number()
            .min(-90, 'Latitude must be between -90 and 90')
            .max(90, 'Latitude must be between -90 and 90')
            .optional(),
        longitude: zod_1.z
            .number()
            .min(-180, 'Longitude must be between -180 and 180')
            .max(180, 'Longitude must be between -180 and 180')
            .optional(),
        websiteUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        phone: zod_1.z.string().max(30).optional(),
        email: zod_1.z.string().email().max(320).optional().or(zod_1.z.literal('')),
        capacity: zod_1.z.number().int().min(1, 'Capacity must be a positive integer').optional(),
        venueType: venueTypeEnum.optional(),
        imageUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
    }),
});
const updateVenueSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Venue ID must be a valid UUID'),
    }),
    body: zod_1.z.object({
        name: zod_1.z.string().min(1).max(500).optional(),
        description: zod_1.z.string().max(5000).optional(),
        address: zod_1.z.string().max(500).optional(),
        city: zod_1.z.string().max(200).optional(),
        state: zod_1.z.string().max(200).optional(),
        country: zod_1.z.string().max(200).optional(),
        postalCode: zod_1.z.string().max(20).optional(),
        latitude: zod_1.z.number().min(-90).max(90).optional(),
        longitude: zod_1.z.number().min(-180).max(180).optional(),
        websiteUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        phone: zod_1.z.string().max(30).optional(),
        email: zod_1.z.string().email().max(320).optional().or(zod_1.z.literal('')),
        capacity: zod_1.z.number().int().min(1).optional(),
        venueType: venueTypeEnum.optional(),
        imageUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
    }),
});
const venueIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Venue ID must be a valid UUID'),
    }),
});
// Public routes (no authentication required)
router.get('/popular', generalRateLimit, venueController.getPopularVenues);
router.get('/near', generalRateLimit, venueController.getVenuesNear);
router.get('/', generalRateLimit, auth_1.optionalAuth, venueController.getVenues);
router.get('/:id', generalRateLimit, auth_1.optionalAuth, (0, validate_1.validate)(venueIdParamSchema), venueController.getVenueById);
// Protected routes (authentication required)
router.post('/', auth_1.authenticateToken, createRateLimit, (0, validate_1.validate)(createVenueSchema), venueController.createVenue);
router.post('/import', auth_1.authenticateToken, createRateLimit, venueController.importVenue);
router.put('/:id', auth_1.authenticateToken, generalRateLimit, (0, validate_1.validate)(updateVenueSchema), venueController.updateVenue);
router.delete('/:id', auth_1.authenticateToken, generalRateLimit, (0, validate_1.validate)(venueIdParamSchema), venueController.deleteVenue);
// Venue events
router.get('/:id/events', generalRateLimit, (0, validate_1.validate)(venueIdParamSchema), eventController.getEventsByVenue);
exports.default = router;
//# sourceMappingURL=venueRoutes.js.map