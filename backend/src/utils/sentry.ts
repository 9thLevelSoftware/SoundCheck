/**
 * Sentry Error Tracking Integration
 *
 * STATUS: DISABLED - @sentry/node not installed
 *
 * To enable:
 * 1. npm install @sentry/node
 * 2. Set SENTRY_DSN environment variable
 * 3. Uncomment code below
 */

// Placeholder functions until Sentry is enabled
export const initSentry = (): void => {
  console.log('[Sentry] Not configured - SENTRY_DSN not set');
};

export const sentryRequestHandler = () => {
  return (_req: any, _res: any, next: any) => next();
};

export const sentryErrorHandler = () => {
  return (_err: any, _req: any, _res: any, next: any) => next(_err);
};

export const captureException = (error: Error): void => {
  console.error('[Sentry disabled] Would capture:', error.message);
};
