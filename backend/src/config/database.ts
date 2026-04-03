import { Pool } from 'pg';
import { DatabaseConfig } from '../types';
import logger from '../utils/logger';

/**
 * Get SSL configuration for database connection.
 * Defaults to verified TLS for security (rejectUnauthorized: true).
 *
 * @returns SSL configuration object or false to disable SSL
 */
export function getSSLConfig(): false | { rejectUnauthorized: boolean } {
  const dbSSL = process.env.DB_SSL?.toLowerCase();

  // Explicit disable
  if (dbSSL === 'false' || dbSSL === 'no' || dbSSL === 'off') {
    return false;
  }

  // Explicit no-verify (not recommended, logs warning)
  if (dbSSL === 'no-verify') {
    logger.warn('DB_SSL=no-verify disables certificate verification. Use only for development.');
    return { rejectUnauthorized: false };
  }

  // Default: SSL enabled with verification (secure default)
  return { rejectUnauthorized: true };
}

class Database {
  private pool: Pool;
  private static instance: Database;

  private constructor() {
    // Get SSL configuration (defaults to verified TLS)
    const sslConfig = getSSLConfig();
    const sslMode = process.env.DB_SSL?.toLowerCase() || 'verify';

    // Pool configuration - CRITICAL: prevent unbounded connections
    // Railway free tier: ~20-25 max connections, reserve some for admin/monitoring
    const poolMax = parseInt(process.env.DB_POOL_MAX || '20', 10);
    const poolMin = parseInt(process.env.DB_POOL_MIN || '2', 10);
    const idleTimeoutMs = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
    const connectionTimeoutMs = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10);

    // Validate pool configuration
    const maxPoolSize = Number.isNaN(poolMax) || poolMax < 1 ? 20 : poolMax;
    const minPoolSize = Number.isNaN(poolMin) || poolMin < 0 ? 2 : Math.min(poolMin, maxPoolSize);
    const idleTimeoutMillis =
      Number.isNaN(idleTimeoutMs) || idleTimeoutMs < 1000 ? 30000 : idleTimeoutMs;
    const connectionTimeoutMillis =
      Number.isNaN(connectionTimeoutMs) || connectionTimeoutMs < 1000 ? 5000 : connectionTimeoutMs;

    logger.info(
      `Database pool config: max=${maxPoolSize}, min=${minPoolSize}, idleTimeout=${idleTimeoutMillis}ms, connectTimeout=${connectionTimeoutMillis}ms`
    );

    // Check if DATABASE_URL is provided (Railway, Heroku, etc.)
    if (process.env.DATABASE_URL) {
      logger.info('Using DATABASE_URL for database connection');
      logger.info('Database config version: 2025-01-06-v4-pool-hardened');

      // Modify DATABASE_URL to control SSL mode
      // Railway's URL may have sslmode=require which overrides Pool options
      let connectionString = process.env.DATABASE_URL;

      // Remove any existing sslmode from URL
      connectionString = connectionString.replace(/[?&]sslmode=[^&]*/gi, '');

      // Add appropriate sslmode based on DB_SSL setting
      const separator = connectionString.includes('?') ? '&' : '?';
      if (sslConfig === false) {
        connectionString = `${connectionString}${separator}sslmode=disable`;
      } else if (!sslConfig.rejectUnauthorized) {
        connectionString = `${connectionString}${separator}sslmode=no-verify`;
      }
      // Default (rejectUnauthorized: true) uses sslmode=require with verification

      logger.info(
        `SSL mode: ${sslMode} (rejectUnauthorized: ${sslConfig === false ? 'N/A' : sslConfig.rejectUnauthorized})`
      );

      this.pool = new Pool({
        connectionString,
        ssl: sslConfig,
        // Connection pool limits - CRITICAL FIX for unbounded connections
        max: maxPoolSize, // Maximum number of clients in the pool
        min: minPoolSize, // Minimum number of clients to maintain (keep warm connections ready)
        // Timeouts - prevent hanging connections
        idleTimeoutMillis, // Close idle clients after 30 seconds (default)
        connectionTimeoutMillis, // Fail fast if can't connect in 5 seconds (default)
        // Health check - validate connections before use
        allowExitOnIdle: false, // Keep pool alive even when idle
      });
    } else {
      // Fall back to individual environment variables
      logger.info('Using individual DB_* environment variables');
      logger.info(
        `SSL mode: ${sslMode} (rejectUnauthorized: ${sslConfig === false ? 'N/A' : sslConfig.rejectUnauthorized})`
      );

      const config: DatabaseConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'soundcheck',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD!, // Required - validated at startup
      };

      this.pool = new Pool({
        ...config,
        ssl: sslConfig,
        // Connection pool limits - CRITICAL FIX for unbounded connections
        max: maxPoolSize, // Maximum number of clients in the pool
        min: minPoolSize, // Minimum number of clients to maintain (keep warm connections ready)
        // Timeouts - prevent hanging connections
        idleTimeoutMillis, // Close idle clients after 30 seconds (default)
        connectionTimeoutMillis, // Fail fast if can't connect in 5 seconds (default)
        // Health check - validate connections before use
        allowExitOnIdle: false, // Keep pool alive even when idle
      });
    }

    // Pool event listeners for monitoring and debugging
    this.pool.on('connect', (client) => {
      logger.debug('New client connected to PostgreSQL pool');
    });

    this.pool.on('acquire', (client) => {
      logger.debug('Client acquired from pool', {
        total: this.pool.totalCount,
        idle: this.pool.idleCount,
        waiting: this.pool.waitingCount,
      });
    });

    this.pool.on('remove', (client) => {
      logger.debug('Client removed from pool');
    });

    // Handle pool errors - critical for preventing crashes on idle client errors
    this.pool.on('error', (err, client) => {
      logger.error('Unexpected error on idle PostgreSQL client', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      // Do NOT exit -- pool will reconnect automatically.
      // The /health endpoint will detect persistent DB failures.
    });

    logger.info('PostgreSQL connection pool initialized with hardened configuration');
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public getPool(): Pool {
    return this.pool;
  }

  public async query(text: string, params?: any[]): Promise<any> {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;

      if (process.env.NODE_ENV === 'development') {
        logger.debug('Executed query', { text, duration, rows: res.rowCount });
      }

      return res;
    } catch (error) {
      logger.error('Database query error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  public async getClient() {
    return await this.pool.connect();
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  // Get pool metrics for health checks and monitoring
  public getPoolMetrics() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  // Health check method with detailed diagnostics
  public async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      // Add 5-second timeout to prevent hanging health checks
      await Promise.race([
        this.query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Database health check timeout')), 5000)
        ),
      ]);
      return { healthy: true };
    } catch (error) {
      logger.error('Database health check failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Database query failed',
      };
    }
  }
}

export default Database;
