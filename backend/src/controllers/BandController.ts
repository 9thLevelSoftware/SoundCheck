import { Request, Response } from 'express';
import { BandService } from '../services/BandService';
import { MusicBrainzService } from '../services/MusicBrainzService';
import { DiscoveryService } from '../services/DiscoveryService';
import { EventService } from '../services/EventService';
import { CreateBandRequest, SearchQuery, ApiResponse } from '../types';
import logger from '../utils/logger';

export class BandController {
  private bandService = new BandService();
  private musicBrainzService = new MusicBrainzService();
  private discoveryService = new DiscoveryService();
  private eventService = new EventService();

  /**
   * Create a new band
   * POST /api/bands
   */
  createBand = async (req: Request, res: Response): Promise<void> => {
    try {
      const bandData: CreateBandRequest = req.body;

      // Validate required fields
      if (!bandData.name) {
        const response: ApiResponse = {
          success: false,
          error: 'Band name is required',
        };
        res.status(400).json(response);
        return;
      }

      const band = await this.bandService.createBand(bandData);

      const response: ApiResponse = {
        success: true,
        data: band,
        message: 'Band created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Create band error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
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
  getBands = async (req: Request, res: Response): Promise<void> => {
    try {
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
    } catch (error) {
      logger.error('Get bands error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
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
  getBandById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const band = await this.bandService.getBandById(id);

      if (!band) {
        const response: ApiResponse = {
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

      const response: ApiResponse = {
        success: true,
        data: { ...band, aggregate, upcomingShows },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get band by ID error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch band',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Update band
   * PUT /api/bands/:id
   * Authorized for admins and claimed owners (claimed_by_user_id match)
   */
  updateBand = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const { id } = req.params;

      // Authorization: admin or claimed owner
      const isAdmin = !!req.user.isAdmin;
      const isOwner = await this.bandService.isClaimedOwner(id, req.user.id);

      if (!isAdmin && !isOwner) {
        res
          .status(403)
          .json({
            success: false,
            error: 'Only admins or claimed owners can update this band',
          } as ApiResponse);
        return;
      }

      const updateData = req.body;
      const band = await this.bandService.updateBand(id, updateData);

      const response: ApiResponse = {
        success: true,
        data: band,
        message: 'Band updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Update band error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update band',
      };

      res.status(400).json(response);
    }
  };

  /**
   * Delete band
   * DELETE /api/bands/:id
   * Authorized for admins and claimed owners (claimed_by_user_id match)
   */
  deleteBand = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const { id } = req.params;

      // Authorization: admin or claimed owner
      const isAdmin = !!req.user.isAdmin;
      const isOwner = await this.bandService.isClaimedOwner(id, req.user.id);

      if (!isAdmin && !isOwner) {
        res
          .status(403)
          .json({
            success: false,
            error: 'Only admins or claimed owners can delete this band',
          } as ApiResponse);
        return;
      }

      await this.bandService.deleteBand(id);

      const response: ApiResponse = {
        success: true,
        message: 'Band deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Delete band error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
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
  getPopularBands = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const bands = await this.bandService.getPopularBands(limit);

      const response: ApiResponse = {
        success: true,
        data: bands,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get popular bands error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
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
  getTrendingBands = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const bands = await this.bandService.getTrendingBands(limit);

      const response: ApiResponse = {
        success: true,
        data: bands,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get trending bands error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
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
  getBandsByGenre = async (req: Request, res: Response): Promise<void> => {
    try {
      const { genre } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      const bands = await this.bandService.getBandsByGenre(genre, limit);

      const response: ApiResponse = {
        success: true,
        data: bands,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get bands by genre error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
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
  getGenres = async (req: Request, res: Response): Promise<void> => {
    try {
      const genres = await this.bandService.getGenres();

      const response: ApiResponse = {
        success: true,
        data: genres,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Get genres error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
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
  importBand = async (req: Request, res: Response): Promise<void> => {
    try {
      const { musicbrainz_id } = req.body;

      if (!musicbrainz_id) {
        const response: ApiResponse = {
          success: false,
          error: 'MusicBrainz ID is required',
        };
        res.status(400).json(response);
        return;
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
    } catch (error) {
      logger.error('Import band error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import band',
      };

      res.status(500).json(response);
    }
  };
}
