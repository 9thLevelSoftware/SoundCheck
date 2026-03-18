const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: mockLoggerError,
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
    mockLoggerError.mockClear();
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

describe('Database pool error handling', () => {
  const originalEnv = process.env;
  let mockPoolOn: jest.Mock;
  let poolErrorHandler: ((err: Error) => void) | undefined;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    mockLoggerError.mockClear();

    // Capture the 'error' event handler registered by the Database constructor
    mockPoolOn = jest.fn((event: string, handler: (err: Error) => void) => {
      if (event === 'error') {
        poolErrorHandler = handler;
      }
    });

    jest.mock('pg', () => ({
      Pool: jest.fn().mockImplementation(() => ({
        on: mockPoolOn,
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
      })),
    }));
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('should NOT call process.exit on pool error', () => {
    process.env.DB_SSL = 'false';
    process.env.DB_HOST = 'localhost';
    process.env.DB_PASSWORD = 'test';
    delete process.env.DATABASE_URL;

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Importing the module triggers the singleton constructor
    const Database = require('../../config/database').default;
    Database.getInstance();

    // Verify the error handler was registered
    expect(mockPoolOn).toHaveBeenCalledWith('error', expect.any(Function));
    expect(poolErrorHandler).toBeDefined();

    // Simulate a pool error
    poolErrorHandler!(new Error('connection reset by peer'));

    // Verify process.exit was NOT called
    expect(exitSpy).not.toHaveBeenCalled();

    // Verify error was logged
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Unexpected error on idle client',
      expect.objectContaining({ error: 'connection reset by peer' })
    );

    exitSpy.mockRestore();
  });
});
