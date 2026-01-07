/**
 * Sentry Error Tracking Integration
 *
 * Provides error tracking and performance monitoring via Sentry.
 * Requires SENTRY_DSN environment variable to be set.
 */

import * as Sentry from '@sentry/node';

let sentryInitialized = false;

/**
 * Initialize Sentry error tracking
 * Should be called early in application startup, before other middleware
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.log('Sentry DSN not configured, error reporting disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || '1.0.0',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      // Enable HTTP request tracing
      Sentry.httpIntegration(),
    ],
    // Scrub sensitive data before sending to Sentry
    beforeSend: (event) => {
      // Scrub sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
      }
      return event;
    },
  });

  sentryInitialized = true;
  console.log('Sentry error reporting initialized');
}

/**
 * Setup Sentry Express error handler on the app
 * In Sentry SDK v10+, setupExpressErrorHandler must be called directly on the app
 * This should be called after routes but before custom error handlers
 */
export function setupSentryForExpress(app: any): void {
  if (!sentryInitialized) {
    return;
  }
  // Sentry v10+ API: setupExpressErrorHandler adds both request and error handling
  Sentry.setupExpressErrorHandler(app);
}

/**
 * Flush pending events and close Sentry
 * Should be called during graceful shutdown
 */
export async function closeSentry(timeout: number = 2000): Promise<void> {
  if (!sentryInitialized) {
    return;
  }
  await Sentry.close(timeout);
}

/**
 * Capture an exception with optional additional context
 */
export function captureException(error: Error, context?: Record<string, any>): void {
  if (!sentryInitialized) {
    console.error('[Sentry disabled] Would capture:', error.message);
    return;
  }

  if (context) {
    Sentry.setContext('additional', context);
  }
  Sentry.captureException(error);
}

/**
 * Capture a message with specified severity level
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info'
): void {
  if (!sentryInitialized) {
    console.log(`[Sentry disabled] Would capture message (${level}):`, message);
    return;
  }

  Sentry.captureMessage(message, level);
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string; username?: string }): void {
  if (!sentryInitialized) return;
  Sentry.setUser(user);
}

/**
 * Clear user context (e.g., on logout)
 */
export function clearUser(): void {
  if (!sentryInitialized) return;
  Sentry.setUser(null);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
  message: string;
  category?: string;
  level?: 'debug' | 'info' | 'warning' | 'error';
  data?: Record<string, any>;
}): void {
  if (!sentryInitialized) return;
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Check if Sentry is initialized
 */
export function isSentryInitialized(): boolean {
  return sentryInitialized;
}

export { Sentry };
