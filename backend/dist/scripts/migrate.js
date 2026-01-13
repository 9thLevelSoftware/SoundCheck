"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dotenv = __importStar(require("dotenv"));
// Load environment variables
if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
    console.log('📄 Loaded .env file for development');
}
async function runMigration() {
    console.log('🚀 Starting database migration...\n');
    // Create database connection
    let pool;
    if (process.env.DATABASE_URL) {
        console.log('🔗 Connecting using DATABASE_URL');
        pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
        });
    }
    else {
        console.log('🔗 Connecting using individual DB_* environment variables');
        pool = new pg_1.Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'soundcheck',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'password',
        });
    }
    try {
        // Test connection
        console.log('✅ Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful!\n');
        // Read schema file
        const schemaPath = path.join(__dirname, '../../database-schema.sql');
        console.log(`📖 Reading schema from: ${schemaPath}`);
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        console.log('✅ Schema file loaded\n');
        // Execute schema
        console.log('🔨 Executing schema...');
        await pool.query(schema);
        console.log('✅ Schema executed successfully!\n');
        // Verify tables were created
        const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
        console.log('📊 Created tables:');
        result.rows.forEach((row) => {
            console.log(`   - ${row.table_name}`);
        });
        console.log('\n🎉 Migration completed successfully!');
    }
    catch (error) {
        console.error('❌ Migration failed:', error.message);
        if (error.detail) {
            console.error('Details:', error.detail);
        }
        if (error.hint) {
            console.error('Hint:', error.hint);
        }
        process.exit(1);
    }
    finally {
        await pool.end();
    }
}
runMigration();
//# sourceMappingURL=migrate.js.map