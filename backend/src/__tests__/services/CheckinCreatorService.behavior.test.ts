const mockDbQuery = jest.fn();
const mockGetClient = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockPromoteIfVerified = jest.fn();
const mockInvalidateUserFeedCache = jest.fn();
const mockInvalidateEventFeedCache = jest.fn();
const mockInvalidateGlobalFeedCache = jest.fn();
const mockBadgeQueueAdd = jest.fn();
const mockCacheDel = jest.fn();

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({
      query: mockDbQuery,
      getClient: mockGetClient,
    })),
  },
}));
jest.mock('../../services/EventService', () => ({
  EventService: jest.fn().mockImplementation(() => ({
    promoteIfVerified: mockPromoteIfVerified,
  })),
}));
jest.mock('../../services/FeedService', () => ({
  FeedService: jest.fn().mockImplementation(() => ({
    invalidateUserFeedCache: mockInvalidateUserFeedCache,
    invalidateEventFeedCache: mockInvalidateEventFeedCache,
    invalidateGlobalFeedCache: mockInvalidateGlobalFeedCache,
  })),
}));
jest.mock('../../jobs/badgeQueue', () => ({
  badgeEvalQueue: {
    add: mockBadgeQueueAdd,
  },
}));
jest.mock('../../services/NotificationBatchService', () => ({
  notificationBatchService: {
    appendForUser: jest.fn(),
  },
}));
jest.mock('../../utils/redisRateLimiter', () => ({
  getRedis: jest.fn(() => null),
}));
jest.mock('../../utils/cache', () => ({
  cache: {
    del: mockCacheDel,
  },
  CacheKeys: {
    recommendations: (userId: string) => `events:recs:${userId}`,
    bandAggregate: (bandId: string) => `bands:aggregate:${bandId}`,
    venueAggregate: (venueId: string) => `venues:aggregate:${venueId}`,
  },
}));
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

import { CheckinCreatorService } from '../../services/checkin/CheckinCreatorService';

describe('CheckinCreatorService critical behavior', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const eventId = '22222222-2222-4222-8222-222222222222';
  const checkinId = '33333333-3333-4333-8333-333333333333';
  const venueId = '44444444-4444-4444-8444-444444444444';
  const bandId = '55555555-5555-4555-8555-555555555555';
  const fullCheckin = {
    id: checkinId,
    userId,
    eventId,
    venueId,
    bandId,
    rating: 0,
    isVerified: true,
    createdAt: new Date('2026-07-26T12:00:00.000Z'),
    updatedAt: new Date('2026-07-26T12:00:00.000Z'),
    toastCount: 0,
    commentCount: 0,
    hasUserToasted: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClient.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
    mockPromoteIfVerified.mockResolvedValue(undefined);
    mockInvalidateUserFeedCache.mockResolvedValue(undefined);
    mockInvalidateEventFeedCache.mockResolvedValue(undefined);
    mockInvalidateGlobalFeedCache.mockResolvedValue(undefined);
    mockBadgeQueueAdd.mockResolvedValue(undefined);
    mockCacheDel.mockResolvedValue(undefined);
    mockDbQuery.mockResolvedValue({ rows: [] });
  });

  it('commits an event-first check-in, preserves vibe tags, and queues idempotent badge evaluation', async () => {
    const today = new Date().toISOString().substring(0, 10);
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
      if (sql.includes('FROM events e')) {
        return {
          rows: [
            {
              id: eventId,
              venue_id: venueId,
              event_name: 'The Tests Live',
              event_date: today,
              venue_lat: '42.3601',
              venue_lon: '-71.0589',
              venue_type: 'club',
            },
          ],
        };
      }
      if (sql.includes('FROM event_lineup')) return { rows: [{ band_id: bandId }] };
      if (sql.includes('INSERT INTO checkins')) {
        return {
          rows: [{ id: checkinId, created_at: '2026-07-26T12:00:00.000Z' }],
          rowCount: 1,
        };
      }
      if (sql.includes('INSERT INTO checkin_vibes')) return { rows: [], rowCount: 2 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    mockDbQuery.mockResolvedValue({
      rows: [{ follower_id: '66666666-6666-4666-8666-666666666666' }],
    });
    const getCheckinById = jest.fn().mockResolvedValue(fullCheckin);

    const result = await new CheckinCreatorService(getCheckinById).createEventCheckin({
      userId,
      eventId,
      locationLat: 42.3601,
      locationLon: -71.0589,
      comment: 'Great set',
      vibeTagIds: ['vibe-1', 'vibe-2'],
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(result).toBe(fullCheckin);
    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO checkins'), [
      userId,
      eventId,
      venueId,
      bandId,
      true,
      'Great set',
      42.3601,
      -71.0589,
      today,
      0,
      'Great set',
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('checkin_vibes'), [
      checkinId,
      'vibe-1',
      'vibe-2',
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
    expect(mockPromoteIfVerified).toHaveBeenCalledWith(eventId);
    expect(mockBadgeQueueAdd).toHaveBeenCalledWith(
      'evaluate',
      { userId, checkinId },
      {
        delay: 30000,
        jobId: `badge-eval-${userId}-${checkinId}`,
      }
    );
    expect(getCheckinById).toHaveBeenCalledWith(checkinId, userId);
    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('persists a rating sent with check-in creation instead of storing 0', async () => {
    const today = new Date().toISOString().substring(0, 10);
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [], rowCount: 0 };
      if (sql.includes('FROM events e')) {
        return {
          rows: [
            {
              id: eventId,
              venue_id: venueId,
              event_date: today,
              venue_lat: '42.3601',
              venue_lon: '-71.0589',
              venue_type: 'club',
            },
          ],
        };
      }
      if (sql.includes('FROM event_lineup')) return { rows: [{ band_id: bandId }] };
      if (sql.includes('INSERT INTO checkins')) {
        return { rows: [{ id: checkinId }], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await new CheckinCreatorService(jest.fn().mockResolvedValue(fullCheckin)).createEventCheckin({
      userId,
      eventId,
      rating: 4.5,
      comment: 'Great set',
    });

    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO checkins'), [
      userId,
      eventId,
      venueId,
      bandId,
      false,
      'Great set',
      null,
      null,
      today,
      4.5,
      'Great set',
    ]);
  });

  it('rolls back a duplicate event check-in and returns a conflict without side effects', async () => {
    const today = new Date().toISOString().substring(0, 10);
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM events e')) {
        return { rows: [{ event_date: today, venue_id: venueId }] };
      }
      if (sql.includes('FROM event_lineup')) return { rows: [] };
      if (sql.includes('INSERT INTO checkins')) {
        throw Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'checkins_user_event_unique',
        });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(
      new CheckinCreatorService(jest.fn()).createEventCheckin({ userId, eventId })
    ).rejects.toMatchObject({
      message: 'You have already checked in to this event',
      statusCode: 409,
    });

    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClientRelease).toHaveBeenCalled();
    expect(mockBadgeQueueAdd).not.toHaveBeenCalled();
  });

  it('rolls back when the event is absent or cancelled', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FROM events e')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    await expect(
      new CheckinCreatorService(jest.fn()).createEventCheckin({ userId, eventId })
    ).rejects.toMatchObject({
      message: 'Event not found or cancelled',
      statusCode: 404,
    });

    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('creates a manual check-in with safe defaults and returns the hydrated record', async () => {
    mockDbQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM bands')) return { rows: [{ id: bandId, name: 'The Tests' }] };
      if (sql.includes('FROM venues')) {
        return {
          rows: [
            {
              id: venueId,
              name: 'The Hall',
              latitude: '42.3601',
              longitude: '-71.0589',
              venue_type: 'club',
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO checkins')) {
        return {
          rows: [{ id: checkinId, created_at: '2026-07-26T12:00:00.000Z' }],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT follower_id')) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const getCheckinById = jest.fn().mockResolvedValue({ ...fullCheckin, eventId: undefined });

    const result = await new CheckinCreatorService(getCheckinById).createManualCheckin({
      userId,
      bandId,
      venueId,
      rating: 4,
      locationLat: 42.3601,
      locationLon: -71.0589,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(result).toEqual({ ...fullCheckin, eventId: undefined });
    expect(mockDbQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO checkins'), [
      userId,
      venueId,
      bandId,
      true,
      null,
      null,
      4,
      42.3601,
      -71.0589,
    ]);
    expect(mockBadgeQueueAdd).toHaveBeenCalledWith(
      'evaluate',
      { userId, checkinId },
      expect.objectContaining({ jobId: `badge-eval-${userId}-${checkinId}` })
    );
  });

  it('rejects a manual check-in before insertion when the band or venue does not exist', async () => {
    mockDbQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: venueId }] });

    await expect(
      new CheckinCreatorService(jest.fn()).createManualCheckin({
        userId,
        bandId,
        venueId,
      })
    ).rejects.toMatchObject({ message: 'Band not found', statusCode: 404 });

    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: bandId }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      new CheckinCreatorService(jest.fn()).createManualCheckin({
        userId,
        bandId,
        venueId,
      })
    ).rejects.toMatchObject({ message: 'Venue not found', statusCode: 404 });
    expect(mockBadgeQueueAdd).not.toHaveBeenCalled();
  });

  it('commits an owned deletion and invalidates affected aggregate caches', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ band_id: bandId }] })
      .mockResolvedValueOnce({ rows: [{ venue_id: venueId }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [] });

    await new CheckinCreatorService(jest.fn()).deleteCheckin(userId, checkinId);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockClientQuery).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClientQuery).toHaveBeenNthCalledWith(
      3,
      'DELETE FROM checkins WHERE id = $1 AND user_id = $2 RETURNING venue_id',
      [checkinId, userId]
    );
    expect(mockClientQuery).toHaveBeenNthCalledWith(4, 'COMMIT');
    expect(mockCacheDel).toHaveBeenCalledWith(`bands:aggregate:${bandId}`);
    expect(mockCacheDel).toHaveBeenCalledWith(`venues:aggregate:${venueId}`);
    expect(mockClientRelease).toHaveBeenCalled();
  });

  it.each([
    [[], 404, 'Check-in not found'],
    [[{ user_id: 'another-user' }], 403, 'Unauthorized to delete this check-in'],
  ])('rolls back a rejected deletion with status %d', async (existingRows, statusCode, message) => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: existingRows })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      new CheckinCreatorService(jest.fn()).deleteCheckin(userId, checkinId)
    ).rejects.toMatchObject({ message, statusCode });

    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClientRelease).toHaveBeenCalled();
  });
});
