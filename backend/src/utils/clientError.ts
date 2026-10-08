import { AppError } from './errors';

const PUBLIC_STATUS_MESSAGES: Record<number, string> = {
  400: 'Invalid request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Resource not found',
  409: 'Conflict',
  422: 'Validation failed',
  429: 'Too many requests, please try again later',
  503: 'Service temporarily unavailable',
};

/**
 * Client-visible message for the global error handler.
 * Operational AppError text is intentional. Any other error stays generic
 * so a database or runtime message cannot reach the client.
 */
export function clientErrorMessage(error: unknown, statusCode: number): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (statusCode >= 500) {
    return 'Internal server error';
  }
  return PUBLIC_STATUS_MESSAGES[statusCode] ?? 'Request failed';
}

/**
 * Stack traces are omitted unless EXPOSE_STACK_TRACES is explicitly true.
 * NODE_ENV=development is not enough.
 */
export function clientErrorStack(error: unknown): string | undefined {
  if (process.env.EXPOSE_STACK_TRACES !== 'true') {
    return undefined;
  }
  if (error instanceof Error && error.stack) {
    return error.stack;
  }
  return undefined;
}
