import { sanitizeForLogging, redactHeaders } from '../../utils/logSanitizer';

describe('Log Sanitizer', () => {
  describe('redactHeaders', () => {
    test('should redact Authorization header', () => {
      const headers = {
        'Authorization': 'Bearer secret-token-123',
        'Content-Type': 'application/json',
      };

      const sanitized = redactHeaders(headers);

      expect(sanitized['Authorization']).toBe('[REDACTED]');
      expect(sanitized['Content-Type']).toBe('application/json');
    });

    test('should redact API key headers', () => {
      const headers = {
        'X-Api-Key': 'fsq_secret_key',
        'Accept': 'application/json',
      };

      const sanitized = redactHeaders(headers);

      expect(sanitized['X-Api-Key']).toBe('[REDACTED]');
      expect(sanitized['Accept']).toBe('application/json');
    });

    test('should redact cookie headers', () => {
      const headers = {
        'Cookie': 'session=abc123; token=xyz789',
        'Set-Cookie': 'session=abc123; HttpOnly; Secure',
        'Content-Length': '100',
      };

      const sanitized = redactHeaders(headers);

      expect(sanitized['Cookie']).toBe('[REDACTED]');
      expect(sanitized['Set-Cookie']).toBe('[REDACTED]');
      expect(sanitized['Content-Length']).toBe('100');
    });

    test('should handle case-insensitive header names', () => {
      const headers = {
        'authorization': 'Bearer token',
        'AUTHORIZATION': 'Bearer another-token',
        'x-api-key': 'secret',
        'X-AUTH-TOKEN': 'auth-token',
      };

      const sanitized = redactHeaders(headers);

      expect(sanitized['authorization']).toBe('[REDACTED]');
      expect(sanitized['AUTHORIZATION']).toBe('[REDACTED]');
      expect(sanitized['x-api-key']).toBe('[REDACTED]');
      expect(sanitized['X-AUTH-TOKEN']).toBe('[REDACTED]');
    });

    test('should return empty object for empty input', () => {
      const sanitized = redactHeaders({});
      expect(sanitized).toEqual({});
    });
  });

  describe('sanitizeForLogging', () => {
    test('should handle nested objects with headers', () => {
      const obj = {
        request: {
          headers: {
            Authorization: 'Bearer token',
          },
        },
        response: { data: 'ok' },
      };

      const sanitized = sanitizeForLogging(obj) as any;

      expect(sanitized.request.headers.Authorization).toBe('[REDACTED]');
      expect(sanitized.response.data).toBe('ok');
    });

    test('should redact sensitive fields by name', () => {
      const obj = {
        password: 'secret123',
        token: 'jwt-token',
        secret: 'my-secret',
        apikey: 'api-key-value',
        api_key: 'another-api-key',
        credentials: { user: 'test', pass: 'test' },
        username: 'testuser',
      };

      const sanitized = sanitizeForLogging(obj) as any;

      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.secret).toBe('[REDACTED]');
      expect(sanitized.apikey).toBe('[REDACTED]');
      expect(sanitized.api_key).toBe('[REDACTED]');
      expect(sanitized.credentials).toBe('[REDACTED]');
      expect(sanitized.username).toBe('testuser'); // Not sensitive
    });

    test('should handle deeply nested objects', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              headers: {
                Authorization: 'Bearer deep-token',
              },
              password: 'deep-password',
            },
          },
        },
      };

      const sanitized = sanitizeForLogging(obj) as any;

      expect(sanitized.level1.level2.level3.headers.Authorization).toBe('[REDACTED]');
      expect(sanitized.level1.level2.level3.password).toBe('[REDACTED]');
    });

    test('should handle arrays', () => {
      const obj = {
        items: [
          { token: 'token1', name: 'item1' },
          { token: 'token2', name: 'item2' },
        ],
      };

      const sanitized = sanitizeForLogging(obj) as any;

      expect(sanitized.items[0].token).toBe('[REDACTED]');
      expect(sanitized.items[0].name).toBe('item1');
      expect(sanitized.items[1].token).toBe('[REDACTED]');
      expect(sanitized.items[1].name).toBe('item2');
    });

    test('should handle null and undefined values', () => {
      expect(sanitizeForLogging(null)).toBeNull();
      expect(sanitizeForLogging(undefined)).toBeUndefined();
    });

    test('should handle primitive values', () => {
      expect(sanitizeForLogging('string')).toBe('string');
      expect(sanitizeForLogging(123)).toBe(123);
      expect(sanitizeForLogging(true)).toBe(true);
    });

    test('should not modify the original object', () => {
      const original = {
        password: 'secret',
        data: 'visible',
      };

      sanitizeForLogging(original);

      expect(original.password).toBe('secret');
      expect(original.data).toBe('visible');
    });

    test('should sanitize axios error config properly', () => {
      // Simulating an axios error config structure
      const errorConfig = {
        baseURL: 'https://places-api.foursquare.com',
        url: '/places/search',
        params: { query: 'venue', limit: 20 },
        headers: {
          'Authorization': 'Bearer fsq_secret_api_key',
          'Accept': 'application/json',
          'X-Places-Api-Version': '2025-11-14',
        },
      };

      const sanitized = sanitizeForLogging(errorConfig) as any;

      expect(sanitized.baseURL).toBe('https://places-api.foursquare.com');
      expect(sanitized.url).toBe('/places/search');
      expect(sanitized.params.query).toBe('venue');
      expect(sanitized.headers['Authorization']).toBe('[REDACTED]');
      expect(sanitized.headers['Accept']).toBe('application/json');
    });
  });
});
