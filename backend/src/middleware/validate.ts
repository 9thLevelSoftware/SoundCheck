import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ApiResponse } from '../types';
import logger from '../utils/logger';

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
        const errorMessages = error.errors.map((err) => {
          return `${err.path.join('.')}: ${err.message}`;
        });

        const response: ApiResponse = {
          success: false,
          error: 'Validation failed',
          data: { details: errorMessages },
        };
        res.status(400).json(response);
        return;
      }
      
      logger.error('Validation middleware unexpected error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  };
};
