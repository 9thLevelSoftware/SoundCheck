import { z } from 'zod';

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
