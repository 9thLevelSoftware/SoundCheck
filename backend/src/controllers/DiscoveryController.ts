/**
 * DiscoveryController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { SetlistFmService } from '../services/SetlistFmService';
import { MusicBrainzService } from '../services/MusicBrainzService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { BadRequestError } from '../utils/errors';

export class DiscoveryController {
  private setlistFmService = new SetlistFmService();
  private musicBrainzService = new MusicBrainzService();

  /**
   * Search for venues using setlist.fm API
   * GET /api/discover/venues?name=venue&city=CityName&country=US
   */
  searchVenues = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const venueName = req.query.name as string;
    const cityName = req.query.city as string;
    const countryCode = req.query.country as string;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;

    if (!venueName && !cityName) {
      throw new BadRequestError('At least venue name or city name is required');
    }

    const venues = await this.setlistFmService.searchVenues(venueName, cityName, countryCode, page);

    const response: ApiResponse = {
      success: true,
      data: venues,
    };

    res.status(200).json(response);
  });

  /**
   * Search for setlists (concerts/events) using setlist.fm API
   * GET /api/discover/setlists?artist=ArtistName&venue=venueId&city=CityName&date=DD-MM-YYYY
   */
  searchSetlists = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const artistName = req.query.artist as string;
    const artistMbid = req.query.mbid as string;
    const venueId = req.query.venue as string;
    const cityName = req.query.city as string;
    const date = req.query.date as string;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;

    // API-024: Require at least one search parameter to prevent unbounded queries
    if (!artistName && !artistMbid && !venueId && !cityName && !date && !year) {
      throw new BadRequestError(
        'At least one search parameter is required (artist, mbid, venue, city, date, or year)'
      );
    }

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
  });

  /**
   * Search for bands using MusicBrainz API
   * GET /api/discover/bands?q=search&limit=20
   */
  searchBands = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = req.query.q as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    if (!query) {
      throw new BadRequestError('Search query is required');
    }

    const bands = await this.musicBrainzService.searchArtists(query, limit);

    const response: ApiResponse = {
      success: true,
      data: bands,
    };

    res.status(200).json(response);
  });

  /**
   * Search for bands by genre using MusicBrainz API
   * GET /api/discover/bands/genre?genre=rock&limit=20
   */
  searchBandsByGenre = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const genre = req.query.genre as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    if (!genre) {
      throw new BadRequestError('Genre is required');
    }

    const bands = await this.musicBrainzService.searchByGenre(genre, limit);

    const response: ApiResponse = {
      success: true,
      data: bands,
    };

    res.status(200).json(response);
  });
}
