import request from 'supertest';
import express from 'express';
import { CheckinController } from '../../controllers/CheckinController';
import { CheckinService } from '../../services/CheckinService';

// Mock the CheckinService
jest.mock('../../services/CheckinService');

describe('CheckinController', () => {
  let app: express.Express;
  let mockCheckinService: jest.Mocked<CheckinService>;
  let checkinController: CheckinController;

  // Helper to set authenticated user
  const authMiddleware = (userId: string | null) => {
    return (req: express.Request, _res: express.Response, next: express.NextFunction) => {
      (req as any).user = userId ? { id: userId } : undefined;
      next();
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockCheckinService = new CheckinService() as jest.Mocked<CheckinService>;
    checkinController = new CheckinController();
    // Replace the internal service with our mock
    (checkinController as any).checkinService = mockCheckinService;
  });

  const setupApp = (userId: string | null = 'user-123') => {
    app = express();
    app.use(express.json());
    app.use(authMiddleware(userId));

    app.post('/checkins', checkinController.createCheckin);
    app.get('/checkins/feed', checkinController.getActivityFeed);
    app.get('/checkins/:id', checkinController.getCheckinById);
    app.post('/checkins/:id/toast', checkinController.toastCheckin);
    app.delete('/checkins/:id/toast', checkinController.untoastCheckin);
    app.post('/checkins/:id/comments', checkinController.addComment);
    app.get('/checkins/:id/comments', checkinController.getComments);
    app.delete('/checkins/:id', checkinController.deleteCheckin);
    app.get('/checkins', checkinController.getCheckins);

    return app;
  };

  describe('POST /checkins (createCheckin)', () => {
    const mockCheckin = {
      id: 'checkin-123',
      userId: 'user-123',
      venueId: 'venue-123',
      bandId: 'band-123',
      rating: 0,
      eventId: 'event-123',
      isVerified: true,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      toastCount: 0,
      commentCount: 0,
      hasUserToasted: false,
    };

    it('should create an event-first checkin successfully', async () => {
      setupApp('user-123');
      mockCheckinService.createEventCheckin.mockResolvedValue(mockCheckin);

      const checkinData = {
        eventId: 'event-123',
        locationLat: 40.7128,
        locationLon: -74.006,
      };

      const response = await request(app).post('/checkins').send(checkinData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          id: 'checkin-123',
          userId: 'user-123',
        })
      );
      expect(response.body.message).toBe('Check-in created successfully');
      expect(mockCheckinService.createEventCheckin).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          eventId: 'event-123',
          locationLat: 40.7128,
          locationLon: -74.006,
        })
      );
    });

    it('should return 401 when not authenticated', async () => {
      setupApp(null); // No authenticated user

      const checkinData = {
        eventId: 'event-123',
      };

      const response = await request(app).post('/checkins').send(checkinData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
      expect(mockCheckinService.createEventCheckin).not.toHaveBeenCalled();
    });

    it('should return 400 when eventId is missing', async () => {
      setupApp('user-123');

      const incompleteData = {
        locationLat: 40.7128,
        locationLon: -74.006,
      };

      const response = await request(app).post('/checkins').send(incompleteData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Either eventId OR both bandId and venueId are required');
      expect(mockCheckinService.createEventCheckin).not.toHaveBeenCalled();
    });

    it('should create manual check-in when bandId+venueId sent without eventId', async () => {
      setupApp('user-123');
      mockCheckinService.createManualCheckin = jest.fn().mockResolvedValue({
        ...mockCheckin,
        eventId: undefined,
      });

      const manualData = {
        venueId: 'venue-123',
        bandId: 'band-123',
        rating: 4,
      };

      const response = await request(app).post('/checkins').send(manualData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(mockCheckinService.createManualCheckin).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          bandId: 'band-123',
          venueId: 'venue-123',
          rating: 4,
        })
      );
    });

    it('should return 400 when neither eventId nor bandId+venueId provided', async () => {
      setupApp('user-123');

      const incompleteData = {
        rating: 4,
      };

      const response = await request(app).post('/checkins').send(incompleteData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 when service throws an error', async () => {
      setupApp('user-123');
      mockCheckinService.createEventCheckin.mockRejectedValue(
        new Error('Event not found or cancelled')
      );

      const checkinData = {
        eventId: 'nonexistent-event',
      };

      const response = await request(app).post('/checkins').send(checkinData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Event not found or cancelled');
    });

    it('should pass vibeTagIds and comment when provided', async () => {
      setupApp('user-123');
      mockCheckinService.createEventCheckin.mockResolvedValue(mockCheckin);

      const checkinData = {
        eventId: 'event-123',
        comment: 'Amazing show!',
        vibeTagIds: ['vibe-1', 'vibe-2'],
      };

      const response = await request(app).post('/checkins').send(checkinData);

      expect(response.status).toBe(201);
      expect(mockCheckinService.createEventCheckin).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          eventId: 'event-123',
          comment: 'Amazing show!',
          vibeTagIds: ['vibe-1', 'vibe-2'],
        })
      );
    });
  });

  describe('GET /checkins/feed (getActivityFeed)', () => {
    const mockFeedCheckins = [
      {
        id: 'checkin-1',
        userId: 'user-1',
        venueId: 'venue-1',
        bandId: 'band-1',
        rating: 4,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        toastCount: 5,
        commentCount: 2,
        hasUserToasted: false,
      },
      {
        id: 'checkin-2',
        userId: 'user-2',
        venueId: 'venue-2',
        bandId: 'band-2',
        rating: 5,
        createdAt: new Date('2024-01-02T00:00:00Z'),
        updatedAt: new Date('2024-01-02T00:00:00Z'),
        toastCount: 3,
        commentCount: 1,
        hasUserToasted: true,
      },
    ];

    it('should return activity feed with default pagination', async () => {
      setupApp('user-123');
      mockCheckinService.getActivityFeed.mockResolvedValue(mockFeedCheckins);

      const response = await request(app).get('/checkins/feed');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(mockCheckinService.getActivityFeed).toHaveBeenCalledWith('user-123', 'friends', {
        limit: 50,
        offset: 0,
        latitude: undefined,
        longitude: undefined,
      });
    });

    it('should return 401 when not authenticated', async () => {
      setupApp(null);

      const response = await request(app).get('/checkins/feed');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
      expect(mockCheckinService.getActivityFeed).not.toHaveBeenCalled();
    });

    it('should apply custom pagination parameters', async () => {
      setupApp('user-123');
      mockCheckinService.getActivityFeed.mockResolvedValue([mockFeedCheckins[0]]);

      const response = await request(app).get('/checkins/feed?limit=10&offset=5');

      expect(response.status).toBe(200);
      expect(mockCheckinService.getActivityFeed).toHaveBeenCalledWith('user-123', 'friends', {
        limit: 10,
        offset: 5,
        latitude: undefined,
        longitude: undefined,
      });
    });

    it('should handle different filter types', async () => {
      setupApp('user-123');
      mockCheckinService.getActivityFeed.mockResolvedValue(mockFeedCheckins);

      const response = await request(app).get('/checkins/feed?filter=global');

      expect(response.status).toBe(200);
      expect(mockCheckinService.getActivityFeed).toHaveBeenCalledWith(
        'user-123',
        'global',
        expect.any(Object)
      );
    });

    it('should pass location parameters for nearby filter', async () => {
      setupApp('user-123');
      mockCheckinService.getActivityFeed.mockResolvedValue(mockFeedCheckins);

      const response = await request(app).get(
        '/checkins/feed?filter=nearby&lat=40.7128&lng=-74.0060'
      );

      expect(response.status).toBe(200);
      expect(mockCheckinService.getActivityFeed).toHaveBeenCalledWith('user-123', 'nearby', {
        limit: 50,
        offset: 0,
        latitude: 40.7128,
        longitude: -74.006,
      });
    });

    it('should return 500 when service throws an error', async () => {
      setupApp('user-123');
      mockCheckinService.getActivityFeed.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/checkins/feed');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch activity feed');
    });
  });

  describe('GET /checkins/:id (getCheckinById)', () => {
    const mockCheckin = {
      id: 'checkin-123',
      userId: 'user-123',
      venueId: 'venue-123',
      bandId: 'band-123',
      rating: 4,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      toastCount: 0,
      commentCount: 0,
    };

    it('should return a checkin by ID', async () => {
      setupApp('user-123');
      mockCheckinService.getCheckinById.mockResolvedValue(mockCheckin);

      const response = await request(app).get('/checkins/checkin-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('checkin-123');
      expect(mockCheckinService.getCheckinById).toHaveBeenCalledWith('checkin-123', 'user-123');
    });

    it('should return 404 when checkin not found', async () => {
      setupApp('user-123');
      mockCheckinService.getCheckinById.mockRejectedValue(new Error('Check-in not found'));

      const response = await request(app).get('/checkins/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Check-in not found');
    });
  });

  describe('POST /checkins/:id/toast (toastCheckin)', () => {
    it('should toast a checkin successfully', async () => {
      setupApp('user-123');
      mockCheckinService.toastCheckin.mockResolvedValue({ toastCount: 1, ownerId: 'owner-123' });

      const response = await request(app).post('/checkins/checkin-123/toast');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Check-in toasted successfully');
      expect(mockCheckinService.toastCheckin).toHaveBeenCalledWith('user-123', 'checkin-123');
    });

    it('should return 401 when not authenticated', async () => {
      setupApp(null);

      const response = await request(app).post('/checkins/checkin-123/toast');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should return 400 when already toasted', async () => {
      setupApp('user-123');
      mockCheckinService.toastCheckin.mockRejectedValue(new Error('Already toasted this check-in'));

      const response = await request(app).post('/checkins/checkin-123/toast');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Already toasted this check-in');
    });
  });

  describe('DELETE /checkins/:id/toast (untoastCheckin)', () => {
    it('should untoast a checkin successfully', async () => {
      setupApp('user-123');
      mockCheckinService.untoastCheckin.mockResolvedValue();

      const response = await request(app).delete('/checkins/checkin-123/toast');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Toast removed successfully');
      expect(mockCheckinService.untoastCheckin).toHaveBeenCalledWith('user-123', 'checkin-123');
    });

    it('should return 401 when not authenticated', async () => {
      setupApp(null);

      const response = await request(app).delete('/checkins/checkin-123/toast');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });
  });

  describe('POST /checkins/:id/comments (addComment)', () => {
    const mockComment = {
      id: 'comment-123',
      checkinId: 'checkin-123',
      userId: 'user-123',
      content: 'Nice show!',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      user: {
        id: 'user-123',
        username: 'testuser',
        profileImageUrl: null,
      },
    };

    it('should add a comment successfully', async () => {
      setupApp('user-123');
      mockCheckinService.addComment.mockResolvedValue(mockComment);

      const response = await request(app)
        .post('/checkins/checkin-123/comments')
        .send({ commentText: 'Nice show!' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.content).toBe('Nice show!');
      expect(response.body.message).toBe('Comment added successfully');
      expect(mockCheckinService.addComment).toHaveBeenCalledWith(
        'user-123',
        'checkin-123',
        'Nice show!'
      );
    });

    it('should return 401 when not authenticated', async () => {
      setupApp(null);

      const response = await request(app)
        .post('/checkins/checkin-123/comments')
        .send({ commentText: 'Nice show!' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should return 400 when comment text is missing', async () => {
      setupApp('user-123');

      const response = await request(app).post('/checkins/checkin-123/comments').send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Comment text is required');
    });

    it('should return 400 when comment text is empty', async () => {
      setupApp('user-123');

      const response = await request(app)
        .post('/checkins/checkin-123/comments')
        .send({ commentText: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Comment text is required');
    });
  });

  describe('GET /checkins/:id/comments (getComments)', () => {
    const mockComments = [
      {
        id: 'comment-1',
        checkinId: 'checkin-123',
        userId: 'user-1',
        content: 'Great!',
        createdAt: new Date('2024-01-01T00:00:00Z'),
      },
      {
        id: 'comment-2',
        checkinId: 'checkin-123',
        userId: 'user-2',
        content: 'Awesome show!',
        createdAt: new Date('2024-01-01T01:00:00Z'),
      },
    ];

    it('should return comments for a checkin', async () => {
      setupApp('user-123');
      mockCheckinService.getComments.mockResolvedValue(mockComments);

      const response = await request(app).get('/checkins/checkin-123/comments');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(mockCheckinService.getComments).toHaveBeenCalledWith('checkin-123');
    });

    it('should return 500 when service throws an error', async () => {
      setupApp('user-123');
      mockCheckinService.getComments.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/checkins/checkin-123/comments');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch comments');
    });
  });

  describe('DELETE /checkins/:id (deleteCheckin)', () => {
    it('should delete a checkin successfully', async () => {
      setupApp('user-123');
      mockCheckinService.deleteCheckin.mockResolvedValue();

      const response = await request(app).delete('/checkins/checkin-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Check-in deleted successfully');
      expect(mockCheckinService.deleteCheckin).toHaveBeenCalledWith('user-123', 'checkin-123');
    });

    it('should return 401 when not authenticated', async () => {
      setupApp(null);

      const response = await request(app).delete('/checkins/checkin-123');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should return 403 when user is not authorized', async () => {
      setupApp('user-123');
      const err = new Error('You can only delete your own check-ins');
      (err as any).statusCode = 403;
      mockCheckinService.deleteCheckin.mockRejectedValue(err);

      const response = await request(app).delete('/checkins/checkin-123');

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('You can only delete your own check-ins');
    });

    it('should return 404 when check-in not found', async () => {
      setupApp('user-123');
      const err = new Error('Check-in not found');
      (err as any).statusCode = 404;
      mockCheckinService.deleteCheckin.mockRejectedValue(err);

      const response = await request(app).delete('/checkins/checkin-123');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Check-in not found');
    });
  });

  describe('GET /checkins (getCheckins)', () => {
    const mockCheckins = [
      {
        id: 'checkin-1',
        userId: 'user-1',
        venueId: 'venue-1',
        bandId: 'band-1',
        rating: 4,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        toastCount: 0,
        commentCount: 0,
      },
    ];

    it('should return checkins with default pagination', async () => {
      setupApp('user-123');
      mockCheckinService.getCheckins.mockResolvedValue(mockCheckins);

      const response = await request(app).get('/checkins');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockCheckinService.getCheckins).toHaveBeenCalledWith({
        venueId: undefined,
        bandId: undefined,
        userId: undefined,
        page: 1,
        limit: 20,
      });
    });

    it('should filter checkins by venueId', async () => {
      setupApp('user-123');
      mockCheckinService.getCheckins.mockResolvedValue(mockCheckins);

      const response = await request(app).get('/checkins?venueId=venue-123');

      expect(response.status).toBe(200);
      expect(mockCheckinService.getCheckins).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-123',
        })
      );
    });

    it('should filter checkins by bandId', async () => {
      setupApp('user-123');
      mockCheckinService.getCheckins.mockResolvedValue(mockCheckins);

      const response = await request(app).get('/checkins?bandId=band-123');

      expect(response.status).toBe(200);
      expect(mockCheckinService.getCheckins).toHaveBeenCalledWith(
        expect.objectContaining({
          bandId: 'band-123',
        })
      );
    });

    it('should apply custom pagination', async () => {
      setupApp('user-123');
      mockCheckinService.getCheckins.mockResolvedValue(mockCheckins);

      const response = await request(app).get('/checkins?page=2&limit=10');

      expect(response.status).toBe(200);
      expect(mockCheckinService.getCheckins).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 10,
        })
      );
    });
  });
});
