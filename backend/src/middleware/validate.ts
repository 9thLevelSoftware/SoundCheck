import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import logger from '../utils/logger';

/**
 * Canonical error response shape.
 * All error responses across validation, global handler, and controllers
 * should use this format for consistency (CFR-API-013).
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Helper to build a canonical error response.
 */
export function buildErrorResponse(code: string, message: string, details?: any): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    error: { code, message },
  };
  if (details !== undefined) {
    response.error.details = details;
  }
  return response;
}

/**
 * Middleware factory for Zod schema validation
 */
export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        res
          .status(400)
          .json(buildErrorResponse('VALIDATION_ERROR', 'Validation failed', fieldErrors));
        return;
      }

      logger.error('Validation middleware unexpected error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json(buildErrorResponse('INTERNAL_ERROR', 'Internal server error'));
    }
  };
};
