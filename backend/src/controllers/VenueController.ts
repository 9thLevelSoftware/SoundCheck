import { Request, Response } from 'express';
import { VenueService } from '../services/VenueService';
import { SetlistFmService } from '../services/SetlistFmService';
import { DiscoveryService } from '../services/DiscoveryService';
import { EventService } from '../services/EventService';
import { CreateVenueRequest, SearchQuery, ApiResponse } from '../types';

export class VenueController {
  private venueService = new VenueService();
  private setlistFmService = new SetlistFmService();
  private discoveryService = new DiscoveryService();
  private eventService = new EventService();

  /**
   * Create a new venue
   * POST /api/venues
   */
  createVenue = async (req: Request, res: Response): Promise<void> => {
    try {
      const venueData: CreateVenueRequest = req.body;

      // Validate required fields
      if (!venueData.name) {
        const response: ApiResponse = {
          success: false,
          error: 'Venue name is required',
        };
        res.status(400).json(response);
        return;
      }

      const venue = await this.venueService.createVenue(venueData);

      const response: ApiResponse = {
        success: true,
        data: venue,
        message: 'Venue created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Create venue error:', error);
      
      const response: ApiResponse = {
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
  getVenues = async (req: Request, res: Response): Promise<void> => {
    try {
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
    } catch (error) {
      console.error('Get venues error:', error);
      
      const response: ApiResponse = {
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
  getVenueById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const venue = await this.venueService.getVenueById(id);

      if (!venue) {
        const response: ApiResponse = {
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

      const response: ApiResponse = {
        success: true,
        data: { ...venue, aggregate, upcomingEvents },
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get venue by ID error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch venue',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Update venue
   * PUT /api/venues/:id
   * Authorized for admins and claimed owners (claimed_by_user_id match)
   */
  updateVenue = async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' } as ApiResponse);
        return;
      }

      const { id } = req.params;

      // Authorization: admin or claimed owner
      const isAdmin = !!req.user.isAdmin;
      const isOwner = await this.venueService.isClaimedOwner(id, req.user.id);

      if (!isAdmin && !isOwner) {
        res.status(403).json({ success: false, error: 'Only admins or claimed owners can update this venue' } as ApiResponse);
        return;
      }

      const updateData = req.body;
      const venue = await this.venueService.updateVenue(id, updateData);

      const response: ApiResponse = {
        success: true,
        data: venue,
        message: 'Venue updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Update venue error:', error);

      const response: ApiResponse = {
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
  deleteVenue = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      await this.venueService.deleteVenue(id);

      const response: ApiResponse = {
        success: true,
        message: 'Venue deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Delete venue error:', error);
      
      const response: ApiResponse = {
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
  getPopularVenues = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const venues = await this.venueService.getPopularVenues(limit);

      const response: ApiResponse = {
        success: true,
        data: venues,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get popular venues error:', error);
      
      const response: ApiResponse = {
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
  getVenuesNear = async (req: Request, res: Response): Promise<void> => {
    try {
      const latitude = parseFloat(req.query.lat as string);
      const longitude = parseFloat(req.query.lng as string);
      const radius = req.query.radius ? parseFloat(req.query.radius as string) : 50;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      if (isNaN(latitude) || isNaN(longitude)) {
        const response: ApiResponse = {
          success: false,
          error: 'Valid latitude and longitude are required',
        };
        res.status(400).json(response);
        return;
      }

      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid coordinates provided',
        };
        res.status(400).json(response);
        return;
      }

      const venues = await this.venueService.getVenuesNear(latitude, longitude, radius, limit);

      const response: ApiResponse = {
        success: true,
        data: venues,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get venues near error:', error);
      
      const response: ApiResponse = {
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
  importVenue = async (req: Request, res: Response): Promise<void> => {
    try {
      const { setlistfm_venue_id } = req.body;

      if (!setlistfm_venue_id) {
        const response: ApiResponse = {
          success: false,
          error: 'setlist.fm venue ID is required',
        };
        res.status(400).json(response);
        return;
      }

      const venue = await this.setlistFmService.importVenue(setlistfm_venue_id);

      const response: ApiResponse = {
        success: true,
        data: venue,
        message: venue.alreadyExists ? 'Venue already exists in database' : 'Venue imported successfully',
      };

      res.status(venue.alreadyExists ? 200 : 201).json(response);
    } catch (error) {
      console.error('Import venue error:', error);

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import venue',
      };

      res.status(500).json(response);
    }
  };
}