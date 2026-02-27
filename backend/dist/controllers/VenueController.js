"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VenueController = void 0;
const VenueService_1 = require("../services/VenueService");
const SetlistFmService_1 = require("../services/SetlistFmService");
const DiscoveryService_1 = require("../services/DiscoveryService");
const EventService_1 = require("../services/EventService");
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
        this.createVenue = async (req, res) => {
            try {
                const venueData = req.body;
                // Validate required fields
                if (!venueData.name) {
                    const response = {
                        success: false,
                        error: 'Venue name is required',
                    };
                    res.status(400).json(response);
                    return;
                }
                const venue = await this.venueService.createVenue(venueData);
                const response = {
                    success: true,
                    data: venue,
                    message: 'Venue created successfully',
                };
                res.status(201).json(response);
            }
            catch (error) {
                console.error('Create venue error:', error);
                const response = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to create venue',
                };
                res.status(400).json(response);
            }
        };
        /**
         * Get all venues with search and filters
         * GET /api/venues
         */
        this.getVenues = async (req, res) => {
            try {
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
            }
            catch (error) {
                console.error('Get venues error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch venues',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get venue by ID
         * GET /api/venues/:id
         */
        this.getVenueById = async (req, res) => {
            try {
                const { id } = req.params;
                const venue = await this.venueService.getVenueById(id);
                if (!venue) {
                    const response = {
                        success: false,
                        error: 'Venue not found',
                    };
                    res.status(404).json(response);
                    return;
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
            }
            catch (error) {
                console.error('Get venue by ID error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch venue',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Update venue
         * PUT /api/venues/:id
         */
        this.updateVenue = async (req, res) => {
            try {
                const { id } = req.params;
                const updateData = req.body;
                const venue = await this.venueService.updateVenue(id, updateData);
                const response = {
                    success: true,
                    data: venue,
                    message: 'Venue updated successfully',
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Update venue error:', error);
                const response = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to update venue',
                };
                res.status(400).json(response);
            }
        };
        /**
         * Delete venue
         * DELETE /api/venues/:id
         */
        this.deleteVenue = async (req, res) => {
            try {
                const { id } = req.params;
                await this.venueService.deleteVenue(id);
                const response = {
                    success: true,
                    message: 'Venue deleted successfully',
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Delete venue error:', error);
                const response = {
                    success: false,
                    error: 'Failed to delete venue',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get popular venues
         * GET /api/venues/popular
         */
        this.getPopularVenues = async (req, res) => {
            try {
                const limit = req.query.limit ? parseInt(req.query.limit) : 10;
                const venues = await this.venueService.getPopularVenues(limit);
                const response = {
                    success: true,
                    data: venues,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get popular venues error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch popular venues',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get venues near location
         * GET /api/venues/near
         */
        this.getVenuesNear = async (req, res) => {
            try {
                const latitude = parseFloat(req.query.lat);
                const longitude = parseFloat(req.query.lng);
                const radius = req.query.radius ? parseFloat(req.query.radius) : 50;
                const limit = req.query.limit ? parseInt(req.query.limit) : 20;
                if (isNaN(latitude) || isNaN(longitude)) {
                    const response = {
                        success: false,
                        error: 'Valid latitude and longitude are required',
                    };
                    res.status(400).json(response);
                    return;
                }
                if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                    const response = {
                        success: false,
                        error: 'Invalid coordinates provided',
                    };
                    res.status(400).json(response);
                    return;
                }
                const venues = await this.venueService.getVenuesNear(latitude, longitude, radius, limit);
                const response = {
                    success: true,
                    data: venues,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get venues near error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch nearby venues',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Import venue from setlist.fm
         * POST /api/venues/import
         * Body: { setlistfm_venue_id: string }
         */
        this.importVenue = async (req, res) => {
            try {
                const { setlistfm_venue_id } = req.body;
                if (!setlistfm_venue_id) {
                    const response = {
                        success: false,
                        error: 'setlist.fm venue ID is required',
                    };
                    res.status(400).json(response);
                    return;
                }
                const venue = await this.setlistFmService.importVenue(setlistfm_venue_id);
                const response = {
                    success: true,
                    data: venue,
                    message: venue.alreadyExists ? 'Venue already exists in database' : 'Venue imported successfully',
                };
                res.status(venue.alreadyExists ? 200 : 201).json(response);
            }
            catch (error) {
                console.error('Import venue error:', error);
                const response = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to import venue',
                };
                res.status(500).json(response);
            }
        };
    }
}
exports.VenueController = VenueController;
//# sourceMappingURL=VenueController.js.map