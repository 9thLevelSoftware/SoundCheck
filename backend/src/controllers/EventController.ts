import { Request, Response } from 'express';
import { EventService } from '../services/EventService';
import { EventSyncService } from '../services/EventSyncService';
import { TicketmasterAdapter } from '../services/TicketmasterAdapter';
import { BandMatcher } from '../services/BandMatcher';
import { ApiResponse } from '../types';

export class EventController {
  private eventService = new EventService();
  private eventSyncService = new EventSyncService();
  private bandMatcher = new BandMatcher();

  /**
   * Create a new event
   * POST /api/events
   * Body: { venueId, bandId, eventDate, eventName?, description?, doorsTime?, startTime?, ticketUrl?, lineup? }
   *
   * Lineup entries support either:
   *   - { bandId } -- existing band by UUID
   *   - { bandName } -- resolve or create band by name via BandMatcher
   *   - { bandId, bandName } -- bandId takes priority
   */
  createEvent = async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        venueId, bandId, eventDate, eventName, description,
        doorsTime, startTime, ticketUrl, lineup,
      } = req.body;
      const userId = (req as any).user?.id; // From auth middleware

      // Validate required fields
      if (!venueId) {
        res.status(400).json({ success: false, error: 'venueId is required' } as ApiResponse);
        return;
      }

      if (!eventDate || isNaN(new Date(eventDate).getTime())) {
        res.status(400).json({ success: false, error: 'A valid eventDate is required' } as ApiResponse);
        return;
      }

      // Require at least one band (via bandId or lineup)
      const hasLineup = lineup && Array.isArray(lineup) && lineup.length > 0;
      if (!bandId && !hasLineup) {
        res.status(400).json({
          success: false,
          error: 'At least one band is required (bandId or lineup with bandId/bandName)',
        } as ApiResponse);
        return;
      }

      // Resolve lineup: convert bandName entries to bandId via BandMatcher
      let resolvedLineup: { bandId: string; setOrder?: number; isHeadliner?: boolean }[] | undefined;

      if (hasLineup) {
        resolvedLineup = [];
        for (const entry of lineup) {
          let resolvedBandId = entry.bandId;

          // If no bandId but bandName provided, resolve via BandMatcher
          if (!resolvedBandId && entry.bandName) {
            const matchResult = await this.bandMatcher.matchOrCreateBand(entry.bandName);
            resolvedBandId = matchResult.bandId;
          }

          if (!resolvedBandId) {
            res.status(400).json({
              success: false,
              error: 'Each lineup entry must have either bandId or bandName',
            } as ApiResponse);
            return;
          }

          resolvedLineup.push({
            bandId: resolvedBandId,
            setOrder: entry.setOrder,
            isHeadliner: entry.isHeadliner,
          });
        }
      }

      const event = await this.eventService.createEvent({
        venueId,
        bandId,
        eventDate: new Date(eventDate),
        eventName,
        description,
        doorsTime,
        startTime,
        ticketUrl,
        createdByUserId: userId,
        lineup: resolvedLineup,
      });

      const response: ApiResponse = {
        success: true,
        data: event,
        message: 'Event created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      console.error('Create event error:', error);

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create event',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get event by ID
   * GET /api/events/:id
   */
  getEventById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const event = await this.eventService.getEventById(id);

      const response: ApiResponse = {
        success: true,
        data: event,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get event error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Event not found',
      };

      res.status(404).json(response);
    }
  };

  /**
   * Get events at a venue
   * GET /api/venues/:id/events?upcoming=true&limit=50
   */
  getEventsByVenue = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const upcoming = req.query.upcoming === 'true';
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const events = await this.eventService.getEventsByVenue(id, { upcoming, limit });

      const response: ApiResponse = {
        success: true,
        data: events,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get events by venue error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch venue events',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get events for a band
   * GET /api/bands/:id/events?upcoming=true&limit=50
   */
  getEventsByBand = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const upcoming = req.query.upcoming === 'true';
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const events = await this.eventService.getEventsByBand(id, { upcoming, limit });

      const response: ApiResponse = {
        success: true,
        data: events,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get events by band error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch band events',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get upcoming events
   * GET /api/events/upcoming?limit=50
   */
  getUpcomingEvents = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const events = await this.eventService.getUpcomingEvents(limit);

      const response: ApiResponse = {
        success: true,
        data: events,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get upcoming events error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch upcoming events',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get trending events
   * GET /api/events/trending?limit=20&lat=&lon=&radius=
   * Enhanced: if lat/lon provided, returns trending near user.
   * Without lat/lon, falls back to global trending (backward compat).
   */
  getTrendingEvents = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
      const lon = req.query.lon ? parseFloat(req.query.lon as string) : undefined;
      const radius = req.query.radius ? parseFloat(req.query.radius as string) : 50;

      // If lat/lon provided, use location-aware trending
      if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
        const events = await this.eventService.getTrendingNearby(lat, lon, radius, 7, limit);

        const response: ApiResponse = {
          success: true,
          data: events,
        };

        res.status(200).json(response);
        return;
      }

      // Fallback: global trending (backward compat)
      const events = await this.eventService.getTrendingEvents(limit);

      const response: ApiResponse = {
        success: true,
        data: events,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get trending events error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch trending events',
      };

      res.status(500).json(response);
    }
  };

  /**
   * On-demand Ticketmaster event lookup
   * GET /api/events/lookup/:ticketmasterId
   *
   * Fetches a specific event from the Ticketmaster API by its TM event ID,
   * normalizes it, matches/creates venue and bands, and stores it in the DB.
   * Returns the full event record.
   *
   * Use case: mobile app encounters a Ticketmaster event ID (e.g., from a
   * deep link or search) that is outside the synced coverage area. This
   * endpoint fetches and ingests it on demand.
   */
  lookupEvent = async (req: Request, res: Response): Promise<void> => {
    try {
      const { ticketmasterId } = req.params;

      // Guard: if TICKETMASTER_API_KEY not configured, lookup is unavailable
      if (!process.env.TICKETMASTER_API_KEY) {
        res.status(503).json({
          success: false,
          error: 'Event lookup not available: Ticketmaster API key not configured',
        } as ApiResponse);
        return;
      }

      // Fetch from Ticketmaster API
      let adapter: TicketmasterAdapter;
      try {
        adapter = new TicketmasterAdapter();
      } catch {
        res.status(503).json({
          success: false,
          error: 'Event lookup not available',
        } as ApiResponse);
        return;
      }

      const tmEvent = await adapter.getEventById(ticketmasterId);

      if (!tmEvent) {
        res.status(404).json({
          success: false,
          error: 'Ticketmaster event not found',
        } as ApiResponse);
        return;
      }

      // Ingest via EventSyncService (normalizes, matches entities, upserts)
      const eventId = await this.eventSyncService.ingestSingleEvent(tmEvent);

      if (!eventId) {
        res.status(422).json({
          success: false,
          error: 'Event could not be ingested (missing venue data)',
        } as ApiResponse);
        return;
      }

      // Return the full event record
      const event = await this.eventService.getEventById(eventId);

      res.status(200).json({
        success: true,
        data: event,
      } as ApiResponse);
    } catch (error) {
      console.error('Lookup event error:', error);

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to look up event',
      } as ApiResponse);
    }
  };

  /**
   * Get nearby events
   * GET /api/events/nearby?lat=X&lng=Y&radius=10&limit=20
   *
   * Returns today's events sorted by distance from the given GPS coordinates.
   * Requires lat and lng query parameters.
   */
  getNearbyEvents = async (req: Request, res: Response): Promise<void> => {
    try {
      const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
      const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;

      if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) {
        res.status(400).json({
          success: false,
          error: 'lat and lng query parameters are required and must be numeric',
        } as ApiResponse);
        return;
      }

      const radius = req.query.radius ? parseFloat(req.query.radius as string) : 10;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      const events = await this.eventService.getNearbyEvents(lat, lng, radius, limit);

      const response: ApiResponse = {
        success: true,
        data: events,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get nearby events error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch nearby events',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get nearby upcoming events
   * GET /api/events/discover?lat=&lon=&radius=50&days=30&limit=20
   */
  getNearbyUpcoming = async (req: Request, res: Response): Promise<void> => {
    try {
      const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
      const lon = req.query.lon ? parseFloat(req.query.lon as string) : undefined;

      if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
        res.status(400).json({
          success: false,
          error: 'lat and lon query parameters are required and must be numeric',
        } as ApiResponse);
        return;
      }

      const radius = req.query.radius ? parseFloat(req.query.radius as string) : 50;
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      const events = await this.eventService.getNearbyUpcoming(lat, lon, radius, days, limit);

      const response: ApiResponse = {
        success: true,
        data: events,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get nearby upcoming events error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch nearby upcoming events',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Get events by genre
   * GET /api/events/genre/:genre?limit=20&offset=0
   */
  getByGenre = async (req: Request, res: Response): Promise<void> => {
    try {
      const { genre } = req.params;

      if (!genre) {
        res.status(400).json({
          success: false,
          error: 'genre parameter is required',
        } as ApiResponse);
        return;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const events = await this.eventService.getByGenre(genre, limit, offset);

      const response: ApiResponse = {
        success: true,
        data: events,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Get events by genre error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch events by genre',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Search events
   * GET /api/events/search?q=&limit=20
   */
  searchEvents = async (req: Request, res: Response): Promise<void> => {
    try {
      const q = req.query.q as string;

      if (!q || q.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'q query parameter is required',
        } as ApiResponse);
        return;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

      const events = await this.eventService.searchEvents(q.trim(), limit);

      const response: ApiResponse = {
        success: true,
        data: events,
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Search events error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to search events',
      };

      res.status(500).json(response);
    }
  };

  /**
   * Delete an event
   * DELETE /api/events/:id
   */
  deleteEvent = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      await this.eventService.deleteEvent(id);

      const response: ApiResponse = {
        success: true,
        message: 'Event deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      console.error('Delete event error:', error);

      const response: ApiResponse = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete event',
      };

      res.status(500).json(response);
    }
  };
}
