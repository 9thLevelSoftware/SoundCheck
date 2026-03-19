import { z } from 'zod';

// ============================================
// Shared validation utilities (API-030)
// ============================================

/**
 * Canonical UUID v1-v5 regex. Shared across all controllers to avoid
 * duplicated UUID_REGEX constants.
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Check whether a string is a valid UUID v1-v5.
 * Returns false for null/undefined/empty strings.
 */
export function isValidUUID(value: string | undefined | null): value is string {
  if (!value) return false;
  return UUID_REGEX.test(value);
}

/**
 * Escape user-generated strings for safe HTML template injection.
 * Prevents XSS by replacing dangerous characters with HTML entities.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Parse an integer from a query string value with NaN handling.
 * Returns the clamped value within [min, max], or defaultValue if parsing fails.
 * API-014: Consistent bounded parseInt pattern.
 */
export function parseBoundedInt(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number
): number {
  if (value === undefined || value === null) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

// ============================================

/**
 * User Validation Schemas
 */

export const createUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/(?=.*[a-z])/, 'Password must contain at least one lowercase letter')
      .regex(/(?=.*[A-Z])/, 'Password must contain at least one uppercase letter')
      .regex(/(?=.*\d)/, 'Password must contain at least one number')
      .regex(/(?=.*[@$!%*?&])/, 'Password must contain at least one special character (@$!%*?&)'),
    username: z.string()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be no more than 30 characters')
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, dots, hyphens, and underscores'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  }),
});

export const loginUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
    location: z.string().optional(),
    profileImageUrl: z.string().url('Invalid URL').optional(),
    dateOfBirth: z.string().datetime().optional(), // Assuming ISO string
  }),
});

export const checkEmailSchema = z.object({
  query: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export const checkUsernameSchema = z.object({
  params: z.object({
    username: z.string().min(3),
  }),
});

/**
 * RSVP Validation Schemas
 */

export const toggleRsvpSchema = z.object({
  params: z.object({
    eventId: z.string().uuid('Event ID must be a valid UUID'),
  }),
});

/**
 * Onboarding Validation Schemas
 */

export const saveGenrePreferencesSchema = z.object({
  body: z.object({
    genres: z.array(z.string().min(1).max(100)).min(3, 'Must select at least 3 genres').max(8, 'Cannot select more than 8 genres'),
  }),
});
