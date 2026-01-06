import { Router } from 'express';
import { UserController } from '../controllers/UserController';
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

const router = Router();
const userController = new UserController();

// Rate limiting for auth endpoints
const authRateLimit = rateLimit(15 * 60 * 1000, 5); // 5 requests per 15 minutes
const generalRateLimit = rateLimit(15 * 60 * 1000, 30); // 30 requests per 15 minutes

// Public routes (no authentication required)
router.post('/register', authRateLimit, validate(createUserSchema), userController.register);
router.post('/login', authRateLimit, validate(loginUserSchema), userController.login);

// Protected routes (authentication required) - MUST come before /:username
router.get('/me', authenticateToken, userController.getProfile);
router.put('/me', authenticateToken, validate(updateProfileSchema), userController.updateProfile);
router.post('/me/profile-image', authenticateToken, uploadProfileImage, userController.uploadProfileImage);
router.delete('/me', authenticateToken, userController.deactivateAccount);

// Username and email availability check - MUST come before /:username
router.get('/check-username/:username', generalRateLimit, validate(checkUsernameSchema), userController.checkUsername);
router.get('/check-email', generalRateLimit, validate(checkEmailSchema), userController.checkEmail); // Changed to query param

// Public user profiles - MUST be last as it's a catch-all
router.get('/:username', generalRateLimit, userController.getUserByUsername);

export default router;
