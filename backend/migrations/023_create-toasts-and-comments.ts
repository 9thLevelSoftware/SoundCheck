import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 023: Create toasts and checkin_comments tables
 *
 * These tables are defined in database-schema.sql but were never created
 * via a migration. The FeedService, CheckinService, and DataExportService
 * all reference them, causing 500 errors on production.
 *
 * Phase 8: Polish & App Store Readiness (bug fix)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Toasts (like "fist bumps" - Untappd's likes)
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS toasts (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, checkin_id)
    );
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_toasts_checkin_id ON toasts(checkin_id);');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_toasts_user_id ON toasts(user_id);');

  // Comments on check-ins
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS checkin_comments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      checkin_id UUID NOT NULL REFERENCES checkins(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_checkin_comments_checkin_id ON checkin_comments(checkin_id);');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_checkin_comments_user_id ON checkin_comments(user_id);');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS checkin_comments CASCADE;');
  pgm.sql('DROP TABLE IF EXISTS toasts CASCADE;');
}
