/**
 * VenueController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { VenueService } from '../services/VenueService';
import { SetlistFmService } from '../services/SetlistFmService';
import { DiscoveryService } from '../services/DiscoveryService';
import { EventService } from '../services/EventService';
import { CreateVenueRequest, SearchQuery, ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors';

export class VenueController {
  private venueService = new VenueService();
  private setlistFmService = new SetlistFmService();
  private discoveryService = new DiscoveryService();
  private eventService = new EventService();

  /**
   * Create a new venue
   * POST /api/venues
   */
  createVenue = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const venueData: CreateVenueRequest = req.body;

    // Validate required fields
    if (!venueData.name) {
      throw new BadRequestError('Venue name is required');
    }

    const venue = await this.venueService.createVenue(venueData);

    const response: ApiResponse = {
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
  getVenues = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const searchQuery: SearchQuery = {
      q: req.query.q as string,
      city: req.query.city as string,
      venueType: req.query.venueType as any,
      rating: req.query.rating ? parseFloat(req.query.rating as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      sort: req.query.sort as string,
      order: req.query.order as 'asc' | 'desc',
    };

    const result = await this.venueService.searchVenues(searchQuery);

    const response: ApiResponse = {
      success: true,
      data: result,
    };

    res.status(200).json(response);
  });

  /**
   * Get venue by ID
   * GET /api/venues/:id
   */
  getVenueById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    const venue = await this.venueService.getVenueById(id);

    if (!venue) {
      throw new NotFoundError('Venue not found');
    }

    // Fetch aggregate rating and upcoming events in parallel
    const [aggregate, upcomingEvents] = await Promise.all([
      this.discoveryService.getVenueAggregateRating(id),
      this.eventService.getEventsByVenue(id, { upcoming: true, limit: 5 }),
    ]);

    const response: ApiResponse = {
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
  updateVenue = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;

    // Authorization: admin or claimed owner
    const isAdmin = !!req.user.isAdmin;
    const isOwner = await this.venueService.isClaimedOwner(id, req.user.id);

    if (!isAdmin && !isOwner) {
      throw new ForbiddenError('Only admins or claimed owners can update this venue');
    }

    const updateData = req.body;
    const venue = await this.venueService.updateVenue(id, updateData);

    const response: ApiResponse = {
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
  deleteVenue = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const { id } = req.params;

    // Authorization: admin or claimed owner
    const isAdmin = !!req.user.isAdmin;
    const isOwner = await this.venueService.isClaimedOwner(id, req.user.id);

    if (!isAdmin && !isOwner) {
      throw new ForbiddenError('Only admins or claimed owners can delete this venue');
    }

    await this.venueService.deleteVenue(id);

    const response: ApiResponse = {
      success: true,
      message: 'Venue deleted successfully',
    };

    res.status(200).json(response);
  });

  /**
   * Get popular venues
   * GET /api/venues/popular
   */
  getPopularVenues = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const venues = await this.venueService.getPopularVenues(limit);

    const response: ApiResponse = {
      success: true,
      data: venues,
    };

    res.status(200).json(response);
  });

  /**
   * Get venues near location
   * GET /api/venues/near
   */
  getVenuesNear = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const latitude = parseFloat(req.query.lat as string);
    const longitude = parseFloat(req.query.lng as string);
    const radius = req.query.radius ? parseFloat(req.query.radius as string) : 50;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    if (isNaN(latitude) || isNaN(longitude)) {
      throw new BadRequestError('Valid latitude and longitude are required');
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new BadRequestError('Invalid coordinates provided');
    }

    const venues = await this.venueService.getVenuesNear(latitude, longitude, radius, limit);

    const response: ApiResponse = {
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
  importVenue = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { setlistfm_venue_id } = req.body;

    if (!setlistfm_venue_id) {
      throw new BadRequestError('setlist.fm venue ID is required');
    }

    const venue = await this.setlistFmService.importVenue(setlistfm_venue_id);

    const response: ApiResponse = {
      success: true,
      data: venue,
      message: venue.alreadyExists
        ? 'Venue already exists in database'
        : 'Venue imported successfully',
    };

    res.status(venue.alreadyExists ? 200 : 201).json(response);
  });
}
