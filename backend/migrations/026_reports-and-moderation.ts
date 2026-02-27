import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 026: Create reports and moderation_items tables
 *
 * Content reporting system for Trust & Safety. Users can report content
 * (checkins, comments, photos, users) with structured reasons. Reports
 * feed into the moderation queue via moderation_items.
 *
 * Phase 9: Trust & Safety Foundation
 *
 * Tables:
 *   - reports: user-submitted content reports with deduplication (UNIQUE on reporter+content)
 *   - moderation_items: unified moderation queue sourced from user reports or auto-safesearch
 *
 * Enum types:
 *   - report_reason: spam, harassment, inappropriate, copyright, other
 *   - report_status: pending, reviewed, actioned, dismissed
 *   - content_type_enum: checkin, comment, photo, user
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create enum types using DO block since CREATE TYPE IF NOT EXISTS is not supported
  pgm.sql(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_reason') THEN
        CREATE TYPE report_reason AS ENUM ('spam', 'harassment', 'inappropriate', 'copyright', 'other');
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
        CREATE TYPE report_status AS ENUM ('pending', 'reviewed', 'actioned', 'dismissed');
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'content_type_enum') THEN
        CREATE TYPE content_type_enum AS ENUM ('checkin', 'comment', 'photo', 'user');
      END IF;
    END $$;
  `);

  // Reports table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content_type content_type_enum NOT NULL,
      content_id UUID NOT NULL,
      target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      reason report_reason NOT NULL,
      description TEXT,
      status report_status DEFAULT 'pending',
      reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(reporter_id, content_type, content_id)
    );
  `);

  // Reports indexes
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_reports_content ON reports(content_type, content_id);');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_reports_target_user ON reports(target_user_id);');

  // Moderation items table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS moderation_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      content_type content_type_enum NOT NULL,
      content_id UUID NOT NULL,
      source VARCHAR(50) NOT NULL,
      report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
      safesearch_results JSONB,
      status VARCHAR(20) DEFAULT 'pending_review',
      reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      action_taken VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Moderation items index
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_moderation_status ON moderation_items(status, created_at);');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS moderation_items CASCADE;');
  pgm.sql('DROP TABLE IF EXISTS reports CASCADE;');

  pgm.sql(`
    DO $$ BEGIN
      DROP TYPE IF EXISTS content_type_enum;
      DROP TYPE IF EXISTS report_status;
      DROP TYPE IF EXISTS report_reason;
    END $$;
  `);
}
