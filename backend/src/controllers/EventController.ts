import { Request, Response } from 'express';
import { EventService } from '../services/EventService';
import { ApiResponse } from '../types';

export class EventController {
  private eventService = new EventService();

  /**
   * Create a new event
   * POST /api/events
   * Body: { venueId, bandId, eventDate, eventName? }
   */
  createEvent = async (req: Request, res: Response): Promise<void> => {
    try {
      const { venueId, bandId, eventDate, eventName, description, lineup } = req.body;
      const userId = (req as any).user?.id; // From auth middleware

      // bandId is required for old format; lineup is required for new format
      if (!venueId || !eventDate || (!bandId && (!lineup || lineup.length === 0))) {
        const response: ApiResponse = {
          success: false,
          error: 'Venue ID, event date, and at least one band (bandId or lineup) are required',
        };
        res.status(400).json(response);
        return;
      }

      const event = await this.eventService.createEvent({
        venueId,
        bandId,
        eventDate: new Date(eventDate),
        eventName,
        description,
        createdByUserId: userId,
        lineup,
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
   * GET /api/events/trending?limit=20
   */
  getTrendingEvents = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

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
