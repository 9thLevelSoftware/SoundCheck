import { Request, Response } from 'express';
import { SetlistFmService } from '../services/SetlistFmService';
import { MusicBrainzService } from '../services/MusicBrainzService';
import { ApiResponse } from '../types';
import logger from '../utils/logger';

export class DiscoveryController {
  private setlistFmService = new SetlistFmService();
  private musicBrainzService = new MusicBrainzService();

  /**
   * Search for venues using setlist.fm API
   * GET /api/discover/venues?name=venue&city=CityName&country=US
   */
  searchVenues = async (req: Request, res: Response): Promise<void> => {
    try {
      const venueName = req.query.name as string;
      const cityName = req.query.city as string;
      const countryCode = req.query.country as string;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;

      if (!venueName && !cityName) {
        const response: ApiResponse = {
          success: false,
          error: 'At least venue name or city name is required',
        };
        res.status(400).json(response);
        return;
      }

      const venues = await this.setlistFmService.searchVenues(
        venueName,
        cityName,
        countryCode,
        page
      );

      const response: ApiResponse = {
        success: true,
        data: venues,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Search venues error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to search venues',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Search for setlists (concerts/events) using setlist.fm API
   * GET /api/discover/setlists?artist=ArtistName&venue=venueId&city=CityName&date=DD-MM-YYYY
   */
  searchSetlists = async (req: Request, res: Response): Promise<void> => {
    try {
      const artistName = req.query.artist as string;
      const artistMbid = req.query.mbid as string;
      const venueId = req.query.venue as string;
      const cityName = req.query.city as string;
      const date = req.query.date as string;
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;

      const setlists = await this.setlistFmService.searchSetlists({
        artistName,
        artistMbid,
        venueId,
        cityName,
        date,
        year,
        page,
      });

      const response: ApiResponse = {
        success: true,
        data: setlists,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Search setlists error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to search setlists',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Search for bands using MusicBrainz API
   * GET /api/discover/bands?q=search&limit=20
   */
  searchBands = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = req.query.q as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      if (!query) {
        const response: ApiResponse = {
          success: false,
          error: 'Search query is required',
        };
        res.status(400).json(response);
        return;
      }

      const bands = await this.musicBrainzService.searchArtists(query, limit);

      const response: ApiResponse = {
        success: true,
        data: bands,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Search bands error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to search bands',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Search for bands by genre using MusicBrainz API
   * GET /api/discover/bands/genre?genre=rock&limit=20
   */
  searchBandsByGenre = async (req: Request, res: Response): Promise<void> => {
    try {
      const genre = req.query.genre as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      if (!genre) {
        const response: ApiResponse = {
          success: false,
          error: 'Genre is required',
        };
        res.status(400).json(response);
        return;
      }

      const bands = await this.musicBrainzService.searchByGenre(genre, limit);

      const response: ApiResponse = {
        success: true,
        data: bands,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Search bands by genre error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });

      const response: ApiResponse = {
        success: false,
        error: 'Failed to search bands by genre',
      };

      res.status(500).json(response);
    }
  };
}
