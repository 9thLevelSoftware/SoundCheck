"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
class Database {
    constructor() {
        // Check if DATABASE_URL is provided (Railway, Heroku, etc.)
        if (process.env.DATABASE_URL) {
            console.log('🔗 Using DATABASE_URL for database connection');
            this.pool = new pg_1.Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
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