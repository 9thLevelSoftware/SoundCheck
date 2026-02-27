import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { UserController } from '../controllers/UserController';
import { FollowController } from '../controllers/FollowController';
import { authenticateToken, rateLimit } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uploadProfileImage } from '../middleware/upload';
import {
  createUserSchema,
  loginUserSchema,
  updateProfileSchema,
  checkEmailSchema,
  checkUsernameSchema
} from '../utils/validationSchemas';
import { pushNotificationService } from '../services/PushNotificationService';
import { DataRetentionService } from '../services/DataRetentionService';
import { AuditService } from '../services/AuditService';

// Multer error handler for profile image uploads
const handleMulterError = (err: Error | null, req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ success: false, error: 'File too large. Maximum size is 5MB.' });
      return;
    }
    res.status(400).json({ success: false, error: err.message });
    return;
  }
  if (err) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }
  next();
};

const router = Router();
const userController = new UserController();
const followController = new FollowController();
const dataRetentionService = new DataRetentionService();
const auditService = new AuditService();

// Rate limiting for auth endpoints
const authRateLimit = rateLimit(15 * 60 * 1000, 5); // 5 requests per 15 minutes
const generalRateLimit = rateLimit(15 * 60 * 1000, 30); // 30 requests per 15 minutes

// Public routes (no authentication required)
router.post('/register', authRateLimit, validate(createUserSchema), userController.register);
router.post('/login', authRateLimit, validate(loginUserSchema), userController.login);

// Protected routes (authentication required) - MUST come before /:username
router.get('/me', authenticateToken, userController.getProfile);
router.put('/me', authenticateToken, validate(updateProfileSchema), userController.updateProfile);
router.post('/me/profile-image', authenticateToken, (req: Request, res: Response, next: NextFunction) => {
  uploadProfileImage(req, res, (err) => {
    if (err) {
      return handleMulterError(err, req, res, next);
    }
    next();
  });
}, userController.uploadProfileImage);
router.delete('/me', authenticateToken, userController.deactivateAccount);

// Account deletion routes (GDPR-compliant with 30-day grace period)
router.post('/me/delete-account', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const result = await dataRetentionService.requestAccountDeletion(userId);

    // Audit log: user deletion request
    auditService.logUserDeleted(userId, result.deletionRequest.scheduledFor, req);

    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error &&
        (error.message === 'User not found' || error.message.includes('pending deletion request'))) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
});

router.post('/me/cancel-deletion', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const result = await dataRetentionService.cancelDeletionRequest(userId);
    res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'No pending deletion request found') {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    next(error);
  }
});

router.get('/me/deletion-status', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const result = await dataRetentionService.getDeletionRequestStatus(userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Device token management for push notifications - MUST come before /:username
router.post('/device-token', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const { token, platform } = req.body;

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Token is required and must be a non-empty string' });
      return;
    }

    if (!platform || !['android', 'ios'].includes(platform)) {
      res.status(400).json({ success: false, error: 'Platform must be "android" or "ios"' });
      return;
    }

    await pushNotificationService.registerDeviceToken(userId, token.trim(), platform);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/device-token', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const { token } = req.body;

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Token is required and must be a non-empty string' });
      return;
    }

    await pushNotificationService.removeDeviceToken(userId, token.trim());
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Username and email availability check - MUST come before /:username
router.get('/check-username/:username', generalRateLimit, validate(checkUsernameSchema), userController.checkUsername);
router.get('/check-email', generalRateLimit, validate(checkEmailSchema), userController.checkEmail); // Changed to query param

// Followers/Following routes - use userId (UUID) for these
// These are public routes since follower/following lists are typically public info
// GET /api/users/:userId/followers - get followers of a user
router.get('/:userId/followers', generalRateLimit, followController.getFollowers);

// GET /api/users/:userId/following - get users that this user is following
router.get('/:userId/following', generalRateLimit, followController.getFollowing);

// GET /api/users/:userId/stats - get user stats by ID
router.get('/:userId/stats', authenticateToken, userController.getUserStats);

// GET /api/users/:userId/concert-cred - get concert cred stats
router.get('/:userId/concert-cred', authenticateToken, userController.getConcertCred);

// Public user profiles - MUST be last as it's a catch-all
router.get('/:username', generalRateLimit, userController.getUserByUsername);

export default router;
