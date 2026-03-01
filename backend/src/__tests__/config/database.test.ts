const mockLoggerWarn = jest.fn();

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: mockLoggerWarn,
    debug: jest.fn(),
  },
}));

describe('Database Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    mockLoggerWarn.mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should enable SSL verification by default when DB_SSL is not set', () => {
    delete process.env.DB_SSL;
    delete process.env.DATABASE_URL;
    process.env.DB_HOST = 'localhost';
    process.env.DB_PASSWORD = 'test';

    const { getSSLConfig } = require('../../config/database');
    const sslConfig = getSSLConfig();

    expect(sslConfig).not.toBe(false);
    expect(sslConfig.rejectUnauthorized).toBe(true);
  });

  test('should allow explicit SSL disable with DB_SSL=false', () => {
    process.env.DB_SSL = 'false';

    const { getSSLConfig } = require('../../config/database');
    const sslConfig = getSSLConfig();

    expect(sslConfig).toBe(false);
  });

  test('should allow explicit SSL disable with DB_SSL=no', () => {
    process.env.DB_SSL = 'no';

    const { getSSLConfig } = require('../../config/database');
    const sslConfig = getSSLConfig();

    expect(sslConfig).toBe(false);
  });

  test('should allow explicit SSL disable with DB_SSL=off', () => {
    process.env.DB_SSL = 'off';

    const { getSSLConfig } = require('../../config/database');
    const sslConfig = getSSLConfig();

    expect(sslConfig).toBe(false);
  });

  test('should allow no-verify mode with warning for development', () => {
    process.env.DB_SSL = 'no-verify';

    const { getSSLConfig } = require('../../config/database');
    const sslConfig = getSSLConfig();

    expect(sslConfig).toEqual({ rejectUnauthorized: false });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'DB_SSL=no-verify disables certificate verification. Use only for development.'
    );
  });

  test('should enable SSL verification with DB_SSL=true', () => {
    process.env.DB_SSL = 'true';

    const { getSSLConfig } = require('../../config/database');
    const sslConfig = getSSLConfig();

    expect(sslConfig).toEqual({ rejectUnauthorized: true });
  });

  test('should handle case-insensitive DB_SSL values', () => {
    process.env.DB_SSL = 'FALSE';

    const { getSSLConfig } = require('../../config/database');
    const sslConfig = getSSLConfig();

    expect(sslConfig).toBe(false);
  });
});
