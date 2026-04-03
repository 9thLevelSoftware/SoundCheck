"use strict";
/**
 * VenueController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VenueController = void 0;
const VenueService_1 = require("../services/VenueService");
const SetlistFmService_1 = require("../services/SetlistFmService");
const DiscoveryService_1 = require("../services/DiscoveryService");
const EventService_1 = require("../services/EventService");
const asyncHandler_1 = require("../utils/asyncHandler");
const errors_1 = require("../utils/errors");
class VenueController {
    constructor() {
        this.venueService = new VenueService_1.VenueService();
        this.setlistFmService = new SetlistFmService_1.SetlistFmService();
        this.discoveryService = new DiscoveryService_1.DiscoveryService();
        this.eventService = new EventService_1.EventService();
        /**
         * Create a new venue
         * POST /api/venues
         */
        this.createVenue = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const venueData = req.body;
            // Validate required fields
            if (!venueData.name) {
                throw new errors_1.BadRequestError('Venue name is required');
            }
            const venue = await this.venueService.createVenue(venueData);
            const response = {
                success: true,
                data: venue,
                message: 'Venue created successfully',
            };
            res.status(201).json(response);
        });
        /**
         * Get all venues with search and filters
         * GET /api/venues
         */
        this.getVenues = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const searchQuery = {
                q: req.query.q,
                city: req.query.city,
                venueType: req.query.venueType,
                rating: req.query.rating ? parseFloat(req.query.rating) : undefined,
                page: req.query.page ? parseInt(req.query.page) : 1,
                limit: req.query.limit ? parseInt(req.query.limit) : 20,
                sort: req.query.sort,
                order: req.query.order,
            };
            const result = await this.venueService.searchVenues(searchQuery);
            const response = {
                success: true,
                data: result,
            };
            res.status(200).json(response);
        });
        /**
         * Get venue by ID
         * GET /api/venues/:id
         */
        this.getVenueById = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const { id } = req.params;
            const venue = await this.venueService.getVenueById(id);
            if (!venue) {
                throw new errors_1.NotFoundError('Venue not found');
            }
            // Fetch aggregate rating and upcoming events in parallel
            const [aggregate, upcomingEvents] = await Promise.all([
                this.discoveryService.getVenueAggregateRating(id),
                this.eventService.getEventsByVenue(id, { upcoming: true, limit: 5 }),
            ]);
            const response = {
                success: true,
                data: { ...venue, aggregate, upcomingEvents },
            };
            res.status(200).json(response);
        });
        /**
         * Update venue
         * PUT /api/venues/:id
         * Authorized for admins and claimed owners (claimed_by_user_id match)
         */
        this.updateVenue = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            if (!req.user) {
                throw new errors_1.UnauthorizedError('Authentication required');
            }
            const { id } = req.params;
            // Authorization: admin or claimed owner
            const isAdmin = !!req.user.isAdmin;
            const isOwner = await this.venueService.isClaimedOwner(id, req.user.id);
            if (!isAdmin && !isOwner) {
                throw new errors_1.ForbiddenError('Only admins or claimed owners can update this venue');
            }
            const updateData = req.body;
            const venue = await this.venueService.updateVenue(id, updateData);
            const response = {
                success: true,
                data: venue,
                message: 'Venue updated successfully',
            };
            res.status(200).json(response);
        });
        /**
         * Delete venue
         * DELETE /api/venues/:id
         * Authorized for admins and claimed owners (claimed_by_user_id match)
         */
        this.deleteVenue = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            if (!req.user) {
                throw new errors_1.UnauthorizedError('Authentication required');
            }
            const { id } = req.params;
            // Authorization: admin or claimed owner
            const isAdmin = !!req.user.isAdmin;
            const isOwner = await this.venueService.isClaimedOwner(id, req.user.id);
            if (!isAdmin && !isOwner) {
                throw new errors_1.ForbiddenError('Only admins or claimed owners can delete this venue');
            }
            await this.venueService.deleteVenue(id);
            const response = {
                success: true,
                message: 'Venue deleted successfully',
            };
            res.status(200).json(response);
        });
        /**
         * Get popular venues
         * GET /api/venues/popular
         */
        this.getPopularVenues = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const limit = req.query.limit ? parseInt(req.query.limit) : 10;
            const venues = await this.venueService.getPopularVenues(limit);
            const response = {
                success: true,
                data: venues,
            };
            res.status(200).json(response);
        });
        /**
         * Get venues near location
         * GET /api/venues/near
         */
        this.getVenuesNear = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const latitude = parseFloat(req.query.lat);
            const longitude = parseFloat(req.query.lng);
            const radius = req.query.radius ? parseFloat(req.query.radius) : 50;
            const limit = req.query.limit ? parseInt(req.query.limit) : 20;
            if (isNaN(latitude) || isNaN(longitude)) {
                throw new errors_1.BadRequestError('Valid latitude and longitude are required');
            }
            if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                throw new errors_1.BadRequestError('Invalid coordinates provided');
            }
            const venues = await this.venueService.getVenuesNear(latitude, longitude, radius, limit);
            const response = {
                success: true,
                data: venues,
            };
            res.status(200).json(response);
        });
        /**
         * Import venue from setlist.fm
         * POST /api/venues/import
         * Body: { setlistfm_venue_id: string }
         */
        this.importVenue = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const { setlistfm_venue_id } = req.body;
            if (!setlistfm_venue_id) {
                throw new errors_1.BadRequestError('setlist.fm venue ID is required');
            }
            const venue = await this.setlistFmService.importVenue(setlistfm_venue_id);
            const response = {
                success: true,
                data: venue,
                message: venue.alreadyExists
                    ? 'Venue already exists in database'
                    : 'Venue imported successfully',
            };
            res.status(venue.alreadyExists ? 200 : 201).json(response);
        });
    }
}
exports.VenueController = VenueController;
//# sourceMappingURL=VenueController.js.map