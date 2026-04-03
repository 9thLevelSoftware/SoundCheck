"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const BandController_1 = require("../controllers/BandController");
const EventController_1 = require("../controllers/EventController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const router = (0, express_1.Router)();
const bandController = new BandController_1.BandController();
const eventController = new EventController_1.EventController();
// Rate limiting
const generalRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 100); // 100 requests per 15 minutes
const createRateLimit = (0, auth_1.rateLimit)(15 * 60 * 1000, 10); // 10 create requests per 15 minutes
// --- Zod validation schemas ---
const createBandSchema = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z
            .string()
            .min(1, 'Band name is required')
            .max(500, 'Band name must be 500 characters or less'),
        description: zod_1.z.string().max(5000).optional(),
        genre: zod_1.z.string().max(100).optional(),
        formedYear: zod_1.z
            .number()
            .int()
            .min(1900)
            .max(new Date().getFullYear() + 1)
            .optional(),
        websiteUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        spotifyUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        instagramUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        facebookUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        imageUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        hometown: zod_1.z.string().max(200).optional(),
    }),
});
const updateBandSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Band ID must be a valid UUID'),
    }),
    body: zod_1.z.object({
        name: zod_1.z.string().min(1).max(500).optional(),
        description: zod_1.z.string().max(5000).optional(),
        genre: zod_1.z.string().max(100).optional(),
        formedYear: zod_1.z
            .number()
            .int()
            .min(1900)
            .max(new Date().getFullYear() + 1)
            .optional(),
        websiteUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        spotifyUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        instagramUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        facebookUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        imageUrl: zod_1.z.string().url().max(2000).optional().or(zod_1.z.literal('')),
        hometown: zod_1.z.string().max(200).optional(),
    }),
});
const bandIdParamSchema = zod_1.z.object({
    params: zod_1.z.object({
        id: zod_1.z.string().uuid('Band ID must be a valid UUID'),
    }),
});
// Public routes (no authentication required)
router.get('/popular', generalRateLimit, bandController.getPopularBands);
router.get('/trending', generalRateLimit, bandController.getTrendingBands);
router.get('/genres', generalRateLimit, bandController.getGenres);
router.get('/genre/:genre', generalRateLimit, bandController.getBandsByGenre);
router.get('/', generalRateLimit, auth_1.optionalAuth, bandController.getBands);
router.get('/:id', generalRateLimit, auth_1.optionalAuth, (0, validate_1.validate)(bandIdParamSchema), bandController.getBandById);
// Protected routes (authentication required)
router.post('/', auth_1.authenticateToken, createRateLimit, (0, validate_1.validate)(createBandSchema), bandController.createBand);
router.post('/import', auth_1.authenticateToken, createRateLimit, bandController.importBand);
router.put('/:id', auth_1.authenticateToken, generalRateLimit, (0, validate_1.validate)(updateBandSchema), bandController.updateBand);
router.delete('/:id', auth_1.authenticateToken, generalRateLimit, (0, validate_1.validate)(bandIdParamSchema), bandController.deleteBand);
// Band events
router.get('/:id/events', generalRateLimit, (0, validate_1.validate)(bandIdParamSchema), eventController.getEventsByBand);
exports.default = router;
//# sourceMappingURL=bandRoutes.js.map