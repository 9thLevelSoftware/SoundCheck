import { Pool } from 'pg';
/**
 * Get SSL configuration for database connection.
 * Defaults to verified TLS for security (rejectUnauthorized: true).
 *
 * @returns SSL configuration object or false to disable SSL
 */
export declare function getSSLConfig(): false | {
    rejectUnauthorized: boolean;
};
declare class Database {
    private pool;
    private static instance;
    private constructor();
    static getInstance(): Database;
    getPool(): Pool;
    query(text: string, params?: any[]): Promise<any>;
    getClient(): Promise<import("pg").PoolClient>;
    close(): Promise<void>;
    healthCheck(): Promise<boolean>;
}
export default Database;
//# sourceMappingURL=database.d.ts.map