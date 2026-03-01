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

    // Check if DATABASE_URL is provided (Railway, Heroku, etc.)
    if (process.env.DATABASE_URL) {
      logger.info('Using DATABASE_URL for database connection');
      logger.info('Database config version: 2025-01-06-v3');

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

      logger.info(`SSL mode: ${sslMode} (rejectUnauthorized: ${sslConfig === false ? 'N/A' : sslConfig.rejectUnauthorized})`);

      this.pool = new Pool({
        connectionString,
        ssl: sslConfig,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
    } else {
      // Fall back to individual environment variables
      logger.info('Using individual DB_* environment variables');
      logger.info(`SSL mode: ${sslMode} (rejectUnauthorized: ${sslConfig === false ? 'N/A' : sslConfig.rejectUnauthorized})`);

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
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
      });
    }

    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
      process.exit(-1);
    });
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
      logger.error('Database query error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  public async getClient() {
    return await this.pool.connect();
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  // Health check method
  public async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      logger.error('Database health check failed', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      return false;
    }
  }
}

export default Database;
