"use strict";
/**
 * BandController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BandController = void 0;
const BandService_1 = require("../services/BandService");
const MusicBrainzService_1 = require("../services/MusicBrainzService");
const DiscoveryService_1 = require("../services/DiscoveryService");
const EventService_1 = require("../services/EventService");
const asyncHandler_1 = require("../utils/asyncHandler");
const errors_1 = require("../utils/errors");
class BandController {
    constructor() {
        this.bandService = new BandService_1.BandService();
        this.musicBrainzService = new MusicBrainzService_1.MusicBrainzService();
        this.discoveryService = new DiscoveryService_1.DiscoveryService();
        this.eventService = new EventService_1.EventService();
        /**
         * Create a new band
         * POST /api/bands
         */
        this.createBand = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const bandData = req.body;
            // Validate required fields
            if (!bandData.name) {
                throw new errors_1.BadRequestError('Band name is required');
            }
            const band = await this.bandService.createBand(bandData);
            const response = {
                success: true,
                data: band,
                message: 'Band created successfully',
            };
            res.status(201).json(response);
        });
        /**
         * Get all bands with search and filters
         * GET /api/bands
         */
        this.getBands = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const searchQuery = {
                q: req.query.q,
                genre: req.query.genre,
                rating: req.query.rating ? parseFloat(req.query.rating) : undefined,
                page: req.query.page ? parseInt(req.query.page) : 1,
                limit: req.query.limit ? parseInt(req.query.limit) : 20,
                sort: req.query.sort,
                order: req.query.order,
            };
            const result = await this.bandService.searchBands(searchQuery);
            const response = {
                success: true,
                data: result,
            };
            res.status(200).json(response);
        });
        /**
         * Get band by ID
         * GET /api/bands/:id
         */
        this.getBandById = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const { id } = req.params;
            const band = await this.bandService.getBandById(id);
            if (!band) {
                throw new errors_1.NotFoundError('Band not found');
            }
            // Fetch aggregate rating and upcoming shows in parallel
            const [aggregate, upcomingShows] = await Promise.all([
                this.discoveryService.getBandAggregateRating(id),
                this.eventService.getEventsByBand(id, { upcoming: true, limit: 5 }),
            ]);
            const response = {
                success: true,
                data: { ...band, aggregate, upcomingShows },
            };
            res.status(200).json(response);
        });
        /**
         * Update band
         * PUT /api/bands/:id
         * Authorized for admins and claimed owners (claimed_by_user_id match)
         */
        this.updateBand = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            if (!req.user) {
                throw new errors_1.UnauthorizedError('Authentication required');
            }
            const { id } = req.params;
            // Authorization: admin or claimed owner
            const isAdmin = !!req.user.isAdmin;
            const isOwner = await this.bandService.isClaimedOwner(id, req.user.id);
            if (!isAdmin && !isOwner) {
                throw new errors_1.ForbiddenError('Only admins or claimed owners can update this band');
            }
            const updateData = req.body;
            const band = await this.bandService.updateBand(id, updateData);
            const response = {
                success: true,
                data: band,
                message: 'Band updated successfully',
            };
            res.status(200).json(response);
        });
        /**
         * Delete band
         * DELETE /api/bands/:id
         * Authorized for admins and claimed owners (claimed_by_user_id match)
         */
        this.deleteBand = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            if (!req.user) {
                throw new errors_1.UnauthorizedError('Authentication required');
            }
            const { id } = req.params;
            // Authorization: admin or claimed owner
            const isAdmin = !!req.user.isAdmin;
            const isOwner = await this.bandService.isClaimedOwner(id, req.user.id);
            if (!isAdmin && !isOwner) {
                throw new errors_1.ForbiddenError('Only admins or claimed owners can delete this band');
            }
            await this.bandService.deleteBand(id);
            const response = {
                success: true,
                message: 'Band deleted successfully',
            };
            res.status(200).json(response);
        });
        /**
         * Get popular bands
         * GET /api/bands/popular
         */
        this.getPopularBands = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const limit = req.query.limit ? parseInt(req.query.limit) : 10;
            const bands = await this.bandService.getPopularBands(limit);
            const response = {
                success: true,
                data: bands,
            };
            res.status(200).json(response);
        });
        /**
         * Get trending bands
         * GET /api/bands/trending
         */
        this.getTrendingBands = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const limit = req.query.limit ? parseInt(req.query.limit) : 10;
            const bands = await this.bandService.getTrendingBands(limit);
            const response = {
                success: true,
                data: bands,
            };
            res.status(200).json(response);
        });
        /**
         * Get bands by genre
         * GET /api/bands/genre/:genre
         */
        this.getBandsByGenre = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const { genre } = req.params;
            const limit = req.query.limit ? parseInt(req.query.limit) : 20;
            const bands = await this.bandService.getBandsByGenre(genre, limit);
            const response = {
                success: true,
                data: bands,
            };
            res.status(200).json(response);
        });
        /**
         * Get all genres
         * GET /api/bands/genres
         */
        this.getGenres = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const genres = await this.bandService.getGenres();
            const response = {
                success: true,
                data: genres,
            };
            res.status(200).json(response);
        });
        /**
         * Import band from MusicBrainz
         * POST /api/bands/import
         * Body: { musicbrainz_id: string }
         */
        this.importBand = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
            const { musicbrainz_id } = req.body;
            if (!musicbrainz_id) {
                throw new errors_1.BadRequestError('MusicBrainz ID is required');
            }
            const band = await this.musicBrainzService.importBand(musicbrainz_id);
            const response = {
                success: true,
                data: band,
                message: band.alreadyExists
                    ? 'Band already exists in database'
                    : 'Band imported successfully',
            };
            res.status(band.alreadyExists ? 200 : 201).json(response);
        });
    }
}
exports.BandController = BandController;
//# sourceMappingURL=BandController.js.map