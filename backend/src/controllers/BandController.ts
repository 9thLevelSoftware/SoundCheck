/**
 * BandController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { BandService } from '../services/BandService';
import { MusicBrainzService } from '../services/MusicBrainzService';
import { DiscoveryService } from '../services/DiscoveryService';
import { EventService } from '../services/EventService';
import { CreateBandRequest, SearchQuery, ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors';

export class BandController {
  private bandService = new BandService();
  private musicBrainzService = new MusicBrainzService();
  private discoveryService = new DiscoveryService();
  private eventService = new EventService();

  /**
   * Create a new band
   * POST /api/bands
   */
  createBand = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const bandData: CreateBandRequest = req.body;

    // Validate required fields
    if (!bandData.name) {
      throw new BadRequestError('Band name is required');
    }

    const band = await this.bandService.createBand(bandData);

    const response: ApiResponse = {
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
  getBands = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const searchQuery: SearchQuery = {
      q: req.query.q as string,
      genre: req.query.genre as string,
      rating: req.query.rating ? parseFloat(req.query.rating as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      sort: req.query.sort as string,
      order: req.query.order as 'asc' | 'desc',
    };

    const result = await this.bandService.searchBands(searchQuery);

    const response: ApiResponse = {
      success: true,
      data: result,
    };

    res.status(200).json(response);
  });

  /**
   * Get band by ID
   * GET /api/bands/:id
   */
  getBandById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const band = await this.bandService.getBandById(id);

    if (!band) {
      throw new NotFoundError('Band not found');
    }

    // Fetch aggregate rating and upcoming shows in parallel
    const [aggregate, upcomingShows] = await Promise.all([
      this.discoveryService.getBandAggregateRating(id),
      this.eventService.getEventsByBand(id, { upcoming: true, limit: 5 }),
    ]);

    const response: ApiResponse = {
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
  updateBand = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;

    // Authorization: admin or claimed owner
    const isAdmin = !!req.user.isAdmin;
    const isOwner = await this.bandService.isClaimedOwner(id, req.user.id);

    if (!isAdmin && !isOwner) {
      throw new ForbiddenError('Only admins or claimed owners can update this band');
    }

    const updateData = req.body;
    const band = await this.bandService.updateBand(id, updateData);

    const response: ApiResponse = {
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
  deleteBand = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;

    // Authorization: admin or claimed owner
    const isAdmin = !!req.user.isAdmin;
    const isOwner = await this.bandService.isClaimedOwner(id, req.user.id);

    if (!isAdmin && !isOwner) {
      throw new ForbiddenError('Only admins or claimed owners can delete this band');
    }

    await this.bandService.deleteBand(id);

    const response: ApiResponse = {
      success: true,
      message: 'Band deleted successfully',
    };

    res.status(200).json(response);
  });

  /**
   * Get popular bands
   * GET /api/bands/popular
   */
  getPopularBands = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const bands = await this.bandService.getPopularBands(limit);

    const response: ApiResponse = {
      success: true,
      data: bands,
    };

    res.status(200).json(response);
  });

  /**
   * Get trending bands
   * GET /api/bands/trending
   */
  getTrendingBands = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const bands = await this.bandService.getTrendingBands(limit);

    const response: ApiResponse = {
      success: true,
      data: bands,
    };

    res.status(200).json(response);
  });

  /**
   * Get bands by genre
   * GET /api/bands/genre/:genre
   */
  getBandsByGenre = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { genre } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const bands = await this.bandService.getBandsByGenre(genre, limit);

    const response: ApiResponse = {
      success: true,
      data: bands,
    };

    res.status(200).json(response);
  });

  /**
   * Get all genres
   * GET /api/bands/genres
   */
  getGenres = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const genres = await this.bandService.getGenres();

    const response: ApiResponse = {
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
  importBand = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { musicbrainz_id } = req.body;

    if (!musicbrainz_id) {
      throw new BadRequestError('MusicBrainz ID is required');
    }

    const band = await this.musicBrainzService.importBand(musicbrainz_id);

    const response: ApiResponse = {
      success: true,
      data: band,
      message: band.alreadyExists
        ? 'Band already exists in database'
        : 'Band imported successfully',
    };

    res.status(band.alreadyExists ? 200 : 201).json(response);
  });
}
