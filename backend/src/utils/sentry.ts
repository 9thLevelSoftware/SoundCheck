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
  });

  sentryInitialized = true;
  console.log('Sentry error reporting initialized');
}

/**
 * Express request handler middleware
 * Must be the first middleware in the stack
 */
export function sentryRequestHandler() {
  if (!sentryInitialized) {
    return (_req: any, _res: any, next: any) => next();
  }
  return Sentry.expressIntegration().setupOnce as any;
}

/**
 * Express error handler middleware
 * Must be placed before other error handlers
 */
export function sentryErrorHandler() {
  if (!sentryInitialized) {
    return (_err: any, _req: any, _res: any, next: any) => next(_err);
  }
  return Sentry.setupExpressErrorHandler as any;
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
