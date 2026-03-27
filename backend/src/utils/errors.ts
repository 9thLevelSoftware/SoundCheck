/**
 * Custom error classes for better error handling and user-friendly messages
 *
 * Each error has:
 * - statusCode: HTTP status code to return
 * - message: User-facing message
 * - internalMessage: Internal message for logging (optional)
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly internalMessage?: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, internalMessage?: string) {
    super(message);
    this.statusCode = statusCode;
    this.internalMessage = internalMessage;
    this.isOperational = true; // Operational errors are expected errors (not bugs)

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request - Invalid input from client
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Invalid request', internalMessage?: string) {
    super(message, 400, internalMessage);
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required', internalMessage?: string) {
    super(message, 401, internalMessage);
  }
}

/**
 * 403 Forbidden - Authenticated but not authorized
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied', internalMessage?: string) {
    super(message, 403, internalMessage);
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found', internalMessage?: string) {
    super(message, 404, internalMessage);
  }
}

/**
 * 409 Conflict - Resource already exists or state conflict
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists', internalMessage?: string) {
    super(message, 409, internalMessage);
  }
}

/**
 * 422 Unprocessable Entity - Validation failed
 */
export class ValidationError extends AppError {
  public readonly validationErrors?: any;

  constructor(
    message: string = 'Validation failed',
    validationErrors?: any,
    internalMessage?: string
  ) {
    super(message, 422, internalMessage);
    this.validationErrors = validationErrors;
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = 'Too many requests, please try again later',
    internalMessage?: string
  ) {
    super(message, 429, internalMessage);
  }
}

/**
 * 500 Internal Server Error - Unexpected server error
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'An unexpected error occurred', internalMessage?: string) {
    super(message, 500, internalMessage);
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', internalMessage?: string) {
    super(message, 503, internalMessage);
  }
}

/**
 * Helper function to determine if an error is operational
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}
