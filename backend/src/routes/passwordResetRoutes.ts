import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { createPerUserRateLimit } from '../middleware/perUserRateLimit';
import passwordResetController from '../controllers/PasswordResetController';

const router = Router();

// Rate limit: 5 requests per hour per IP for password reset endpoints
const passwordResetRateLimit = createPerUserRateLimit({
  maxRequests: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
  message: 'Too many password reset requests. Please try again later.',
});

// Validation schemas
const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
  }),
});

const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(64, 'Invalid reset token').max(128, 'Invalid reset token'),
    newPassword: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/\d/, 'Password must contain at least one number')
      .regex(/[@$!%*?&]/, 'Password must contain at least one special character (@$!%*?&)'),
  }),
});

/**
 * POST /api/auth/forgot-password
 *
 * Request a password reset email. Rate limited to 5/hour per IP.
 */
router.post(
  '/forgot-password',
  passwordResetRateLimit,
  validate(forgotPasswordSchema),
  passwordResetController.forgotPassword
);

/**
 * POST /api/auth/reset-password
 *
 * Reset password with a valid token. Rate limited to 5/hour per IP.
 */
router.post(
  '/reset-password',
  passwordResetRateLimit,
  validate(resetPasswordSchema),
  passwordResetController.resetPassword
);

export default router;
