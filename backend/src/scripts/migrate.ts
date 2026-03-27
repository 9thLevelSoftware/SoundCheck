import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
  console.log('📄 Loaded .env file for development');
}

async function runMigration() {
  console.log('🚀 Starting database migration...\n');

  // Create database connection
  let pool: Pool;

  if (process.env.DATABASE_URL) {
    console.log('🔗 Connecting using DATABASE_URL');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
    });
  } else {
    console.log('🔗 Connecting using individual DB_* environment variables');
    pool = new Pool({
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
    result.rows.forEach((row: any) => {
      console.log(`   - ${row.table_name}`);
    });

    console.log('\n🎉 Migration completed successfully!');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    if (error.detail) {
      console.error('Details:', error.detail);
    }
    if (error.hint) {
      console.error('Hint:', error.hint);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
