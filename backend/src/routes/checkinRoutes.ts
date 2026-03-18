import { Router } from 'express';
import { z } from 'zod';
import { CheckinController } from '../controllers/CheckinController';
import { authenticateToken } from '../middleware/auth';
import { dailyCheckinRateLimit } from '../middleware/checkinRateLimit';
import { validate } from '../middleware/validate';

const router = Router();
const checkinController = new CheckinController();

// --- Zod validation schemas ---

const createCheckinSchema = z.object({
  body: z.object({
    eventId: z.string().uuid('eventId must be a valid UUID'),
    checkinLatitude: z.number().min(-90).max(90).optional(),
    checkinLongitude: z.number().min(-180).max(180).optional(),
    locationLat: z.number().min(-90).max(90).optional(),
    locationLon: z.number().min(-180).max(180).optional(),
    comment: z.string().max(2000, 'Comment must be 2000 characters or less').optional(),
    vibeTagIds: z.array(z.string().uuid()).optional(),
  }),
});

const updateRatingsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Check-in ID must be a valid UUID'),
  }),
  body: z.object({
    bandRatings: z.array(z.object({
      bandId: z.string().uuid('bandId must be a valid UUID'),
      rating: z.number().min(0.5).max(5).multipleOf(0.5),
    })).optional(),
    venueRating: z.number().min(0.5).max(5).multipleOf(0.5).optional(),
  }).refine(
    (data) => data.bandRatings !== undefined || data.venueRating !== undefined,
    { message: 'At least one of bandRatings or venueRating is required' }
  ),
});

const requestPhotoUploadSchema = z.object({
  params: z.object({
    id: z.string().uuid('Check-in ID must be a valid UUID'),
  }),
  body: z.object({
    contentTypes: z.array(
      z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic'], {
        invalid_type_error: 'Invalid content type',
      })
    ).min(1, 'contentTypes must be a non-empty array').max(4, 'Maximum 4 photos per request'),
  }),
});

const confirmPhotoUploadSchema = z.object({
  params: z.object({
    id: z.string().uuid('Check-in ID must be a valid UUID'),
  }),
  body: z.object({
    photoKeys: z.array(z.string().min(1))
      .min(1, 'photoKeys must be a non-empty array')
      .max(4, 'Maximum 4 photos per request'),
  }),
});

const checkinIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Check-in ID must be a valid UUID'),
  }),
});

const addCommentSchema = z.object({
  params: z.object({
    id: z.string().uuid('Check-in ID must be a valid UUID'),
  }),
  body: z.object({
    commentText: z.string().min(1, 'Comment text is required').max(2000, 'Comment must be 2000 characters or less'),
  }),
});

const deleteCommentSchema = z.object({
  params: z.object({
    id: z.string().uuid('Check-in ID must be a valid UUID'),
    commentId: z.string().uuid('Comment ID must be a valid UUID'),
  }),
});

// All checkin routes require authentication
router.use(authenticateToken);

// Get activity feed
router.get('/feed', checkinController.getActivityFeed);

// Get vibe tags (must be before /:id routes)
router.get('/vibe-tags', checkinController.getVibeTags);

// Get check-ins with filters
router.get('/', checkinController.getCheckins);

// Create a check-in (daily rate limit: 10/day anti-farming)
router.post('/', dailyCheckinRateLimit, validate(createCheckinSchema), checkinController.createCheckin);

// Update ratings for a check-in (per-band + venue)
router.patch('/:id/ratings', validate(updateRatingsSchema), checkinController.updateRatings);

// Request presigned upload URLs for photos (client uploads directly to R2)
router.post('/:id/photos', validate(requestPhotoUploadSchema), checkinController.requestPhotoUpload);

// Confirm photo uploads and store URLs in check-in
router.patch('/:id/photos', validate(confirmPhotoUploadSchema), checkinController.confirmPhotoUpload);

// Get check-in by ID
router.get('/:id', validate(checkinIdParamSchema), checkinController.getCheckinById);

// Delete check-in
router.delete('/:id', validate(checkinIdParamSchema), checkinController.deleteCheckin);

// Toast a check-in
router.post('/:id/toast', validate(checkinIdParamSchema), checkinController.toastCheckin);

// Untoast a check-in
router.delete('/:id/toast', validate(checkinIdParamSchema), checkinController.untoastCheckin);

// Get toasts for a check-in
router.get('/:id/toasts', validate(checkinIdParamSchema), checkinController.getToasts);

// Get comments for a check-in
router.get('/:id/comments', validate(checkinIdParamSchema), checkinController.getComments);

// Add comment to a check-in
router.post('/:id/comments', validate(addCommentSchema), checkinController.addComment);

// Delete a comment
router.delete('/:id/comments/:commentId', validate(deleteCommentSchema), checkinController.deleteComment);

export default router;
