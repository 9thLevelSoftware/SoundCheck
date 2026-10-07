import { EventService } from '../../services/EventService';
import Database from '../../config/database';
import { cache } from '../../utils/cache';
import logger from '../../utils/logger';

// Mock dependencies
jest.mock('../../config/database');
jest.mock('../../utils/cache');
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockDb = {
  query: jest.fn(),
  getClient: jest.fn(),
};

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockNotificationService = {
  createNotification: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('EventService', () => {
  let eventService: EventService;

  beforeEach(() => {
    eventService = new EventService(mockNotificationService as any);
    jest.clearAllMocks();
    mockDb.query.mockReset();
    mockClient.query.mockReset();
    mockNotificationService.createNotification.mockReset();
    (cache.getOrSet as jest.Mock).mockImplementation(async (_key, fn) => fn());
  });

  describe('getEventById', () => {
    it('should return event with lineup and venue details', async () => {
      const mockEvent = {
        id: 'event-123',
        venue_id: 'venue-456',
        event_date: '2024-06-15',
        event_name: 'Summer Rock Festival',
        description: 'An amazing rock festival',
        doors_time: '18:00',
        start_time: '19:00',
        end_time: '23:00',
        ticket_url: 'https://tickets.example.com',
        ticket_price_min: '25.00',
        ticket_price_max: '100.00',
        is_sold_out: false,
        is_cancelled: false,
        event_type: 'concert',
        source: 'user_created',
        status: 'active',
        external_id: null,
        created_by_user_id: 'user-789',
        is_verified: false,
        total_checkins: '50',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
        v_id: 'venue-456',
        venue_name: 'Madison Square Garden',
        venue_city: 'New York',
        venue_state: 'NY',
        venue_image: 'https://example.com/venue.jpg',
      };

      const mockLineup = [
        {
          id: 'lineup-1',
          band_id: 'band-1',
          set_order: 0,
          set_time: '19:00',
          is_headliner: true,
          b_id: 'band-1',
          band_name: 'Rock Band',
          band_genre: 'Rock',
          band_image: 'https://example.com/band1.jpg',
        },
        {
          id: 'lineup-2',
          band_id: 'band-2',
          set_order: 1,
          set_time: '21:00',
          is_headliner: false,
          b_id: 'band-2',
          band_name: 'Jazz Band',
          band_genre: 'Jazz',
          band_image: null,
        },
      ];

      const mockCheckinCount = { checkin_count: '25' };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockEvent] }) // event query
        .mockResolvedValueOnce({ rows: mockLineup }) // lineup query
        .mockResolvedValueOnce({ rows: [mockCheckinCount] }); // checkin count

      const result = await eventService.getEventById('event-123');

      expect(result.id).toBe('event-123');
      expect(result.eventName).toBe('Summer Rock Festival');
      expect(result.venue?.name).toBe('Madison Square Garden');
      expect(result.lineup).toHaveLength(2);
      expect(result.lineup?.[0].band?.name).toBe('Rock Band');
      expect(result.lineup?.[0].isHeadliner).toBe(true);
      expect(result.checkinCount).toBe(25);
      // Backward-compat fields
      expect(result.bandId).toBe('band-1');
      expect(result.band?.name).toBe('Rock Band');
      expect(result.showDate).toEqual('2024-06-15');
    });

    it('should throw error when event not found', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // event query returns nothing
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ checkin_count: '0' }] });

      await expect(eventService.getEventById('non-existent')).rejects.toMatchObject({
        message: 'Event not found',
        statusCode: 404,
      });
    });

    it('should handle event with empty lineup', async () => {
      const mockEvent = {
        id: 'event-123',
        venue_id: 'venue-456',
        event_date: '2024-06-15',
        event_name: 'Solo Show',
        v_id: 'venue-456',
        venue_name: 'Small Club',
        venue_city: 'Boston',
        venue_state: 'MA',
        venue_image: null,
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [mockEvent] })
        .mockResolvedValueOnce({ rows: [] }) // empty lineup
        .mockResolvedValueOnce({ rows: [{ checkin_count: '5' }] });

      const result = await eventService.getEventById('event-123');

      expect(result.lineup).toEqual([]);
      expect(result.bandId).toBeUndefined();
      expect(result.band).toBeUndefined();
    });
  });

  describe('getEventsByVenue', () => {
    it('should return upcoming events for a venue', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          venue_id: 'venue-123',
          event_date: '2024-07-01',
          event_name: 'July Concert',
          v_id: 'venue-123',
          venue_name: 'Test Venue',
          venue_city: 'New York',
          venue_state: 'NY',
          venue_image: null,
          checkin_count: '10',
        },
        {
          id: 'event-2',
          venue_id: 'venue-123',
          event_date: '2024-08-15',
          event_name: 'August Show',
          v_id: 'venue-123',
          venue_name: 'Test Venue',
          venue_city: 'New York',
          venue_state: 'NY',
          venue_image: null,
          checkin_count: '5',
        },
      ];

      mockDb.query
        .mockResolvedValueOnce({ rows: mockEvents }) // events query
        .mockResolvedValueOnce({ rows: [] }); // lineup query for mapDbEventsWithHeadliner

      const result = await eventService.getEventsByVenue('venue-123', {
        upcoming: true,
        limit: 50,
      });

      expect(result).toHaveLength(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('event_date >= CURRENT_DATE'),
        ['venue-123', 50]
      );
      expect(mockDb.query.mock.calls[0][0]).toContain('is_cancelled = FALSE');
    });

    it('should include past events when upcoming is false', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await eventService.getEventsByVenue('venue-123', { upcoming: false });

      const [query] = mockDb.query.mock.calls[0];
      expect(query).not.toContain('event_date >= CURRENT_DATE');
      expect(query).toContain('is_cancelled = FALSE');
    });

    it('should use default options', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await eventService.getEventsByVenue('venue-123');

      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $2'), [
        'venue-123',
        50,
      ]);
    });
  });

  describe('getEventsByBand', () => {
    it('should return upcoming shows for a band', async () => {
      const mockEvents = [
        {
          id: 'event-1',
          venue_id: 'venue-1',
          event_date: '2024-09-01',
          event_name: 'Band Tour Stop 1',
          v_id: 'venue-1',
          venue_name: 'Venue One',
          venue_city: 'Chicago',
          venue_state: 'IL',
          venue_image: null,
          checkin_count: '20',
        },
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockEvents }).mockResolvedValueOnce({ rows: [] });

      const result = await eventService.getEventsByBand('band-123', { upcoming: true, limit: 30 });

      expect(result).toHaveLength(1);
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('JOIN event_lineup el'), [
        'band-123',
        30,
      ]);
    });

    it('should join through event_lineup table', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await eventService.getEventsByBand('band-123');

      const [query] = mockDb.query.mock.calls[0];
      expect(query).toContain('el.band_id = $1');
      expect(query).toContain('JOIN event_lineup el');
      expect(query).toContain('is_cancelled = FALSE');
    });
  });

  describe('createEvent', () => {
    it('should create event with lineup', async () => {
      const eventData = {
        venueId: 'venue-123',
        eventDate: new Date('2024-08-01'),
        eventName: 'New Event',
        description: 'Event description',
        doorsTime: '19:00',
        startTime: '20:00',
        endTime: '23:00',
        ticketUrl: 'https://tickets.com',
        ticketPriceMin: 20,
        ticketPriceMax: 50,
        createdByUserId: 'user-456',
        lineup: [
          { bandId: 'band-1', setOrder: 0, isHeadliner: true, setTime: '20:00' },
          { bandId: 'band-2', setOrder: 1, isHeadliner: false, setTime: '21:30' },
        ],
      };

      const mockCreatedEvent = {
        id: 'event-new',
        venue_id: 'venue-123',
        event_date: '2024-08-01',
        event_name: 'New Event',
      };

      mockDb.getClient.mockResolvedValueOnce(mockClient);
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [mockCreatedEvent] }) // INSERT event
        .mockResolvedValueOnce({}) // lineup insert 1
        .mockResolvedValueOnce({}) // lineup insert 2
        .mockResolvedValueOnce({}); // COMMIT

      // Mock getEventById for the return
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockCreatedEvent] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ checkin_count: '0' }] });

      const result = await eventService.createEvent(eventData);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return existing live event if venue+band+date combination exists', async () => {
      const eventData = {
        venueId: 'venue-123',
        bandId: 'band-1',
        eventDate: new Date('2024-08-01'),
      };

      const existingEvent = { id: 'event-existing' };

      mockDb.query.mockResolvedValueOnce({ rows: [existingEvent] });
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ ...existingEvent, venue_id: 'venue-123', event_date: '2024-08-01' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ checkin_count: '10' }] });

      const result = await eventService.createEvent(eventData);

      expect(result.id).toBe('event-existing');
      expect(mockDb.getClient).not.toHaveBeenCalled(); // No transaction needed
      expect(mockDb.query.mock.calls[0][0]).toContain("status IS DISTINCT FROM 'cancelled'");
    });

    it('does not treat a cancelled event as an existing venue+band+date match', async () => {
      const eventData = {
        venueId: 'venue-123',
        bandId: 'band-1',
        eventDate: new Date('2024-08-01'),
      };

      const mockCreatedEvent = {
        id: 'event-new',
        venue_id: 'venue-123',
        event_date: '2024-08-01',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockCreatedEvent] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ checkin_count: '0' }] });

      mockDb.getClient.mockResolvedValueOnce(mockClient);
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [mockCreatedEvent] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await eventService.createEvent(eventData);

      expect(result.id).toBe('event-new');
      expect(mockDb.getClient).toHaveBeenCalled();
      expect(mockDb.query.mock.calls[0][0]).toContain("status IS DISTINCT FROM 'cancelled'");
    });

    it('should handle transaction rollback on error', async () => {
      const eventData = {
        venueId: 'venue-123',
        eventDate: new Date('2024-08-01'),
        lineup: [{ bandId: 'band-1' }],
      };

      mockDb.getClient.mockResolvedValueOnce(mockClient);
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Insert failed')); // INSERT fails

      await expect(eventService.createEvent(eventData)).rejects.toThrow('Insert failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should set source to user_created when createdByUserId is provided', async () => {
      const eventData = {
        venueId: 'venue-123',
        eventDate: new Date('2024-08-01'),
        createdByUserId: 'user-456',
      };

      mockDb.getClient.mockResolvedValueOnce(mockClient);
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'event-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ checkin_count: '0' }] });

      await eventService.createEvent(eventData);

      const [, params] = mockClient.query.mock.calls[1];
      expect(params).toContain('user_created');
    });
  });

  describe('findOrCreateEvent', () => {
    it('should return existing event id when found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'event-existing' }] });

      const result = await eventService.findOrCreateEvent(
        'venue-123',
        'band-1',
        new Date('2024-08-01')
      );

      expect(result).toBe('event-existing');
      expect(mockDb.query.mock.calls[0][0]).toContain("status IS DISTINCT FROM 'cancelled'");
    });

    it('should add band to existing event at venue+date', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // No existing event with this band
        .mockResolvedValueOnce({ rows: [{ id: 'event-at-venue' }] }); // Event exists at venue+date

      mockDb.getClient.mockResolvedValueOnce(mockClient);
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // INSERT lineup
        .mockResolvedValueOnce({}); // COMMIT

      const result = await eventService.findOrCreateEvent(
        'venue-123',
        'band-new',
        new Date('2024-08-01')
      );

      expect(result).toBe('event-at-venue');
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO events')
      );
    });

    it('should create new event when nothing exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      mockDb.getClient.mockResolvedValueOnce(mockClient);
      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: 'event-new' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const result = await eventService.findOrCreateEvent(
        'venue-123',
        'band-1',
        new Date('2024-08-01')
      );

      expect(result).toBe('event-new');
    });
  });

  describe('getUpcomingEvents', () => {
    it('should return all upcoming events', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const result = await eventService.getUpcomingEvents(30);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('event_date >= CURRENT_DATE'),
        [30]
      );
    });

    it('should filter cancelled events', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await eventService.getUpcomingEvents();

      const [query] = mockDb.query.mock.calls[0];
      expect(query).toContain('is_cancelled = FALSE');
    });
  });

  describe('getTrendingEvents', () => {
    it('should return events with most check-ins in last 30 days', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      const result = await eventService.getTrendingEvents(20);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('checkin_count DESC'),
        [20]
      );
    });

    it('should filter hidden checkins', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await eventService.getTrendingEvents();

      const [query] = mockDb.query.mock.calls[0];
      expect(query).toContain('is_hidden IS NOT TRUE');
      expect(query).toContain('is_cancelled = FALSE');
    });
  });

  describe('deleteEvent', () => {
    const actor = { id: 'user-a', isAdmin: false };

    const setupClient = (impl: (sql: string, params?: unknown[]) => Promise<unknown> | unknown) => {
      mockDb.getClient.mockResolvedValue(mockClient);
      mockClient.query.mockImplementation(async (sql: string, params?: unknown[]) =>
        impl(sql, params)
      );
    };

    it('hard-deletes an unattended event for the creator', async () => {
      setupClient(async (sql: string) => {
        if (
          sql === 'BEGIN' ||
          sql === 'COMMIT' ||
          sql === 'ROLLBACK' ||
          sql.includes('SAVEPOINT')
        ) {
          return {};
        }
        if (sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 'event-123', created_by_user_id: 'user-a', status: 'active' }] };
        }
        if (sql.includes('FROM checkins')) {
          return { rows: [] };
        }
        if (sql.includes('DELETE FROM events')) {
          return { rowCount: 1 };
        }
        throw new Error(`Unexpected query: ${sql}`);
      });

      const result = await eventService.deleteEvent('event-123', actor);

      expect(result).toEqual({ deleted: true, cancelled: false });
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM events'), [
        'event-123',
      ]);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [
        'event-123',
      ]);
    });

    it('cancels when user B has checked in and does not delete the event', async () => {
      const sqls: string[] = [];
      mockDb.query.mockResolvedValue({ rows: [{ user_id: 'user-b' }] });
      mockNotificationService.createNotification.mockResolvedValue({ id: 'notification-1' });
      setupClient(async (sql: string) => {
        sqls.push(sql);
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return {};
        }
        if (sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 'event-123', created_by_user_id: 'user-a', status: 'active' }] };
        }
        if (sql.includes('FROM checkins')) {
          return { rows: [{ '?column?': 1 }] };
        }
        if (sql.includes("status = 'cancelled'")) {
          return { rowCount: 1 };
        }
        throw new Error(`Unexpected query: ${sql}`);
      });

      const result = await eventService.deleteEvent('event-123', actor);

      expect(result).toEqual({ deleted: false, cancelled: true });
      expect(sqls.some((sql) => sql.includes('DELETE FROM events'))).toBe(false);
      expect(sqls.some((sql) => sql.includes("status = 'cancelled'"))).toBe(true);
      expect(sqls.some((sql) => sql.includes('external_id'))).toBe(false);
      expect(mockNotificationService.createNotification).toHaveBeenCalledWith({
        userId: 'user-b',
        type: 'event_cancelled',
        title: 'Event cancelled',
        message: 'An event you checked in to has been cancelled.',
        eventId: 'event-123',
      });
    });

    it('does not send duplicate notifications when retrying an already-cancelled delete', async () => {
      const sqls: string[] = [];
      setupClient(async (sql: string) => {
        sqls.push(sql);
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return {};
        }
        if (sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 'event-123', created_by_user_id: 'user-a', status: 'cancelled' }] };
        }
        if (sql.includes('FROM checkins')) {
          return { rows: [{ '?column?': 1 }] };
        }
        if (sql.includes("status = 'cancelled'")) {
          return { rowCount: 0 };
        }
        throw new Error(`Unexpected query: ${sql}`);
      });

      const result = await eventService.deleteEvent('event-123', actor);

      expect(result).toEqual({ deleted: false, cancelled: true });
      expect(sqls.some((sql) => sql.includes('DELETE FROM events'))).toBe(false);
      expect(sqls.some((sql) => sql.includes("status IS DISTINCT FROM 'cancelled'"))).toBe(true);
      expect(mockDb.query).not.toHaveBeenCalled();
      expect(mockNotificationService.createNotification).not.toHaveBeenCalled();
    });

    it('cancels in the same request when RESTRICT races a check-in insert', async () => {
      setupClient(async (sql: string) => {
        if (
          sql === 'BEGIN' ||
          sql === 'COMMIT' ||
          sql === 'ROLLBACK' ||
          sql.includes('SAVEPOINT')
        ) {
          return {};
        }
        if (sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 'event-123', created_by_user_id: 'user-a', status: 'active' }] };
        }
        if (sql.includes('FROM checkins')) {
          return { rows: [] };
        }
        if (sql.includes('DELETE FROM events')) {
          const err = Object.assign(new Error('fk restrict'), { code: '23503' });
          throw err;
        }
        if (sql.includes("status = 'cancelled'")) {
          return { rowCount: 1 };
        }
        throw new Error(`Unexpected query: ${sql}`);
      });

      const result = await eventService.deleteEvent('event-123', actor);

      expect(result).toEqual({ deleted: false, cancelled: true });
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT event_delete');
    });

    it('returns 409 when RESTRICT fires and cancel also fails', async () => {
      setupClient(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK' || sql.includes('SAVEPOINT')) {
          return {};
        }
        if (sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 'event-123', created_by_user_id: 'user-a', status: 'active' }] };
        }
        if (sql.includes('FROM checkins')) {
          return { rows: [] };
        }
        if (sql.includes('DELETE FROM events')) {
          throw Object.assign(new Error('fk restrict'), { code: '23503' });
        }
        if (sql.includes("status = 'cancelled'")) {
          throw new Error('cancel failed');
        }
        throw new Error(`Unexpected query: ${sql}`);
      });

      await expect(eventService.deleteEvent('event-123', actor)).rejects.toMatchObject({
        message: 'Event could not be deleted or cancelled',
        statusCode: 409,
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to cancel event after delete conflict',
        expect.objectContaining({ eventId: 'event-123', error: 'cancel failed' })
      );
    });

    it('forbids delete by a non-creator non-admin', async () => {
      setupClient(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') {
          return {};
        }
        if (sql.includes('FOR UPDATE')) {
          return { rows: [{ id: 'event-123', created_by_user_id: 'user-b', status: 'active' }] };
        }
        throw new Error(`Unexpected query: ${sql}`);
      });

      await expect(eventService.deleteEvent('event-123', actor)).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(mockClient.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM events'))).toBe(
        false
      );
    });

    it('should handle database errors', async () => {
      mockDb.getClient.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(eventService.deleteEvent('event-123', actor)).rejects.toThrow('Delete failed');
    });
  });

  describe('findUserCreatedEventAtVenueDate', () => {
    it('should return user-created event id when found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'event-user' }] });

      const result = await eventService.findUserCreatedEventAtVenueDate('venue-123', '2024-08-01');

      expect(result).toBe('event-user');
      expect(mockDb.query.mock.calls[0][0]).toContain("status IS DISTINCT FROM 'cancelled'");
      expect(mockDb.query.mock.calls[0][0]).toContain('ORDER BY created_at DESC');
    });

    it('should return null when no user-created event exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await eventService.findUserCreatedEventAtVenueDate('venue-123', '2024-08-01');

      expect(result).toBeNull();
    });
  });

  describe('promoteIfVerified', () => {
    it('should promote event when 2+ unique users have checked in', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'event-123' }] });

      const result = await eventService.promoteIfVerified('event-123');

      expect(result).toBe('event-123');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE events SET is_verified = true'),
        ['event-123']
      );
    });

    it('should return null when not yet eligible', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await eventService.promoteIfVerified('event-123');

      expect(result).toBeNull();
    });
  });

  describe('mergeTicketmasterIntoUserEvent', () => {
    it('should merge Ticketmaster data into user event', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      const merged = await eventService.mergeTicketmasterIntoUserEvent('event-123', {
        externalId: 'tm-456',
        eventName: 'TM Event Name',
        ticketUrl: 'https://ticketmaster.com',
        priceMin: 30,
        priceMax: 80,
        status: 'on_sale',
      });

      expect(merged).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE events'), [
        'event-123',
        'tm-456',
        'TM Event Name',
        'https://ticketmaster.com',
        30,
        80,
        'on_sale',
      ]);
      expect(mockDb.query.mock.calls[0][0]).toContain("status IS DISTINCT FROM 'cancelled'");
    });

    it('does not merge into a cancelled event', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });

      const merged = await eventService.mergeTicketmasterIntoUserEvent('event-cancelled', {
        externalId: 'tm-456',
      });

      expect(merged).toBe(false);
    });
  });

  describe('getNearbyEvents', () => {
    it('should return events happening today near coordinates', async () => {
      const mockEvent = {
        id: 'event-nearby',
        venue_id: 'venue-1',
        event_date: '2024-08-01',
        v_id: 'venue-1',
        venue_name: 'Nearby Venue',
        venue_city: 'New York',
        venue_state: 'NY',
        venue_image: null,
        checkin_count: '15',
        distance_km: '2.5',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockEvent] }).mockResolvedValueOnce({ rows: [] });

      const result = await eventService.getNearbyEvents(40.7128, -74.006, 10, 20);

      expect(result).toHaveLength(1);
      expect(result[0].distanceKm).toBe(2.5);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('event_date = CURRENT_DATE'),
        [40.7128, -74.006, 10, 20]
      );
    });

    it('should return empty array when no nearby events', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await eventService.getNearbyEvents(40.7128, -74.006);

      expect(result).toEqual([]);
    });
  });

  describe('getNearbyUpcoming', () => {
    it('should use cache for nearby upcoming events', async () => {
      const cachedEvents = [{ id: 'event-cached', distanceKm: 5 }];
      (cache.getOrSet as jest.Mock).mockResolvedValueOnce(cachedEvents);

      const result = await eventService.getNearbyUpcoming(40.7128, -74.006);

      expect(result).toEqual(cachedEvents);
      expect(cache.getOrSet).toHaveBeenCalled();
    });

    it('should query with date range when cache misses', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await eventService.getNearbyUpcoming(40.7128, -74.006, 25, 14);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('BETWEEN CURRENT_DATE AND CURRENT_DATE + make_interval'),
        expect.arrayContaining([40.7128, -74.006, 14])
      );
    });
  });

  describe('getTrendingNearby', () => {
    it('should return trending events near user sorted by recent checkins', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await eventService.getTrendingNearby(40.7128, -74.006, 25, 7, 15);

      expect(cache.getOrSet).toHaveBeenCalled();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('recent_checkins DESC'),
        expect.any(Array)
      );
    });
  });

  describe('getByGenre', () => {
    it('should return events filtered by genre', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await eventService.getByGenre('Rock', 20, 0);

      expect(cache.getOrSet).toHaveBeenCalled();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('$1 = ANY(b.genres)'),
        expect.any(Array)
      );
    });
  });

  describe('searchEvents', () => {
    it('should search events by name, venue, or band', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await eventService.searchEvents('rock concert', 15);

      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), [
        'rock concert',
        15,
      ]);
    });

    it('should use similarity for relevance ranking', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

      await eventService.searchEvents('jazz');

      const [query] = mockDb.query.mock.calls[0];
      expect(query).toContain('similarity');
    });
  });
});
