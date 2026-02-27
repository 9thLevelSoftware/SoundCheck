"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BandController = void 0;
const BandService_1 = require("../services/BandService");
const MusicBrainzService_1 = require("../services/MusicBrainzService");
const DiscoveryService_1 = require("../services/DiscoveryService");
const EventService_1 = require("../services/EventService");
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
        this.createBand = async (req, res) => {
            try {
                const bandData = req.body;
                // Validate required fields
                if (!bandData.name) {
                    const response = {
                        success: false,
                        error: 'Band name is required',
                    };
                    res.status(400).json(response);
                    return;
                }
                const band = await this.bandService.createBand(bandData);
                const response = {
                    success: true,
                    data: band,
                    message: 'Band created successfully',
                };
                res.status(201).json(response);
            }
            catch (error) {
                console.error('Create band error:', error);
                const response = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to create band',
                };
                res.status(400).json(response);
            }
        };
        /**
         * Get all bands with search and filters
         * GET /api/bands
         */
        this.getBands = async (req, res) => {
            try {
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
            }
            catch (error) {
                console.error('Get bands error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch bands',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get band by ID
         * GET /api/bands/:id
         */
        this.getBandById = async (req, res) => {
            try {
                const { id } = req.params;
                const band = await this.bandService.getBandById(id);
                if (!band) {
                    const response = {
                        success: false,
                        error: 'Band not found',
                    };
                    res.status(404).json(response);
                    return;
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
            }
            catch (error) {
                console.error('Get band by ID error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch band',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Update band
         * PUT /api/bands/:id
         */
        this.updateBand = async (req, res) => {
            try {
                const { id } = req.params;
                const updateData = req.body;
                const band = await this.bandService.updateBand(id, updateData);
                const response = {
                    success: true,
                    data: band,
                    message: 'Band updated successfully',
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Update band error:', error);
                const response = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to update band',
                };
                res.status(400).json(response);
            }
        };
        /**
         * Delete band
         * DELETE /api/bands/:id
         */
        this.deleteBand = async (req, res) => {
            try {
                const { id } = req.params;
                await this.bandService.deleteBand(id);
                const response = {
                    success: true,
                    message: 'Band deleted successfully',
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Delete band error:', error);
                const response = {
                    success: false,
                    error: 'Failed to delete band',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get popular bands
         * GET /api/bands/popular
         */
        this.getPopularBands = async (req, res) => {
            try {
                const limit = req.query.limit ? parseInt(req.query.limit) : 10;
                const bands = await this.bandService.getPopularBands(limit);
                const response = {
                    success: true,
                    data: bands,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get popular bands error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch popular bands',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get trending bands
         * GET /api/bands/trending
         */
        this.getTrendingBands = async (req, res) => {
            try {
                const limit = req.query.limit ? parseInt(req.query.limit) : 10;
                const bands = await this.bandService.getTrendingBands(limit);
                const response = {
                    success: true,
                    data: bands,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get trending bands error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch trending bands',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get bands by genre
         * GET /api/bands/genre/:genre
         */
        this.getBandsByGenre = async (req, res) => {
            try {
                const { genre } = req.params;
                const limit = req.query.limit ? parseInt(req.query.limit) : 20;
                const bands = await this.bandService.getBandsByGenre(genre, limit);
                const response = {
                    success: true,
                    data: bands,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get bands by genre error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch bands by genre',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Get all genres
         * GET /api/bands/genres
         */
        this.getGenres = async (req, res) => {
            try {
                const genres = await this.bandService.getGenres();
                const response = {
                    success: true,
                    data: genres,
                };
                res.status(200).json(response);
            }
            catch (error) {
                console.error('Get genres error:', error);
                const response = {
                    success: false,
                    error: 'Failed to fetch genres',
                };
                res.status(500).json(response);
            }
        };
        /**
         * Import band from MusicBrainz
         * POST /api/bands/import
         * Body: { musicbrainz_id: string }
         */
        this.importBand = async (req, res) => {
            try {
                const { musicbrainz_id } = req.body;
                if (!musicbrainz_id) {
                    const response = {
                        success: false,
                        error: 'MusicBrainz ID is required',
                    };
                    res.status(400).json(response);
                    return;
                }
                const band = await this.musicBrainzService.importBand(musicbrainz_id);
                const response = {
                    success: true,
                    data: band,
                    message: band.alreadyExists ? 'Band already exists in database' : 'Band imported successfully',
                };
                res.status(band.alreadyExists ? 200 : 201).json(response);
            }
            catch (error) {
                console.error('Import band error:', error);
                const response = {
                    success: false,
                    error: error instanceof Error ? error.message : 'Failed to import band',
                };
                res.status(500).json(response);
            }
        };
    }
}
exports.BandController = BandController;
//# sourceMappingURL=BandController.js.map