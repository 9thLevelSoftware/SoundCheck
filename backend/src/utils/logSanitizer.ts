/**
 * Log Sanitizer Utility
 *
 * Redacts sensitive information from objects before logging to prevent
 * accidental exposure of API keys, tokens, passwords, and other secrets.
 *
 * Security Fix: Addresses Finding 6 - Third-party API keys can leak into logs
 */

/** Headers that contain authentication or sensitive information */
const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'cookie',
  'set-cookie',
];

/** Field names that typically contain sensitive data */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'credentials',
];

/**
 * Redact sensitive headers from a headers object.
 *
 * @param headers - The headers object to sanitize
 * @returns A new object with sensitive headers replaced with '[REDACTED]'
 *
 * @example
 * const headers = { 'Authorization': 'Bearer token', 'Content-Type': 'application/json' };
 * const sanitized = redactHeaders(headers);
 * // sanitized = { 'Authorization': '[REDACTED]', 'Content-Type': 'application/json' }
 */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Recursively sanitize an object for safe logging.
 * Redacts sensitive fields and headers throughout the object tree.
 *
 * @param obj - The object to sanitize
 * @returns A new object with sensitive data replaced with '[REDACTED]'
 *
 * @example
 * const errorData = {
 *   request: {
 *     headers: { 'Authorization': 'Bearer secret' },
 *     url: '/api/search'
 *   },
 *   password: 'user-password'
 * };
 * const sanitized = sanitizeForLogging(errorData);
 * // sanitized.request.headers.Authorization === '[REDACTED]'
 * // sanitized.password === '[REDACTED]'
 * // sanitized.request.url === '/api/search'
 */
export function sanitizeForLogging(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeForLogging);
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();

    // Redact sensitive fields
    if (SENSITIVE_FIELDS.some((f) => lowerKey.includes(f))) {
      sanitized[key] = '[REDACTED]';
    } else if (lowerKey === 'headers' && typeof value === 'object' && value !== null) {
      // Handle headers objects specially
      sanitized[key] = redactHeaders(value as Record<string, string>);
    } else if (typeof value === 'object') {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeForLogging(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
