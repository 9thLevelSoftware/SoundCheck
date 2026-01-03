"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
class Database {
    constructor() {
        // Check if DATABASE_URL is provided (Railway, Heroku, etc.)
        if (process.env.DATABASE_URL) {
            console.log('🔗 Using DATABASE_URL for database connection');
            console.log('📦 Database config version: 2025-01-03-v2');
            // Modify DATABASE_URL to control SSL mode
            // Railway's URL may have sslmode=require which overrides Pool options
            let connectionString = process.env.DATABASE_URL;
            const sslMode = process.env.DB_SSL || 'no-verify';
            // Remove any existing sslmode from URL
            connectionString = connectionString.replace(/[?&]sslmode=[^&]*/gi, '');
            // Add appropriate sslmode based on DB_SSL setting
            const separator = connectionString.includes('?') ? '&' : '?';
            if (sslMode === 'false') {
                connectionString = `${connectionString}${separator}sslmode=disable`;
            }
            else if (sslMode === 'no-verify') {
                connectionString = `${connectionString}${separator}sslmode=no-verify`;
            }
            // sslMode === 'true' uses default (require with verification)
            console.log(`🔒 SSL mode: ${sslMode}`);
            // SSL config for Pool (belt and suspenders with URL param)
            let sslConfig = false;
            if (sslMode === 'no-verify') {
                sslConfig = { rejectUnauthorized: false };
            }
            else if (sslMode === 'true') {
                sslConfig = { rejectUnauthorized: true };
            }
            this.pool = new pg_1.Pool({
                connectionString,
                ssl: sslConfig,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });
        }
        else {
            // Fall back to individual environment variables
            console.log('🔗 Using individual DB_* environment variables');
            const config = {
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432'),
                database: process.env.DB_NAME || 'pitpulse',
                user: process.env.DB_USER || 'postgres',
                password: process.env.DB_PASSWORD, // Required - validated at startup
            };
            this.pool = new pg_1.Pool({
                ...config,
                max: 20, // Maximum number of clients in the pool
                idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
                connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
            });
        }
        // Handle pool errors
        this.pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
            process.exit(-1);
        });
    }
    static getInstance() {
        if (!Database.instance) {
            Database.instance = new Database();
        }
        return Database.instance;
    }
    getPool() {
        return this.pool;
    }
    async query(text, params) {
        const start = Date.now();
        try {
            const res = await this.pool.query(text, params);
            const duration = Date.now() - start;
            if (process.env.NODE_ENV === 'development') {
                console.log('Executed query', { text, duration, rows: res.rowCount });
            }
            return res;
        }
        catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    }
    async getClient() {
        return await this.pool.connect();
    }
    async close() {
        await this.pool.end();
    }
    // Health check method
    async healthCheck() {
        try {
            await this.query('SELECT 1');
            return true;
        }
        catch (error) {
            console.error('Database health check failed:', error);
            return false;
        }
    }
}
exports.default = Database;
//# sourceMappingURL=database.js.map