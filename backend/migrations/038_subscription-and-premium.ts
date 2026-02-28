import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 038: Subscription & Premium Infrastructure
 *
 * Adds is_premium boolean to users table for subscription gating,
 * and creates processed_webhook_events table for RevenueCat webhook idempotency.
 *
 * Phase 12: Monetization & Wrapped (Plan 01)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add is_premium column to users table
  pgm.sql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE`);

  // 2. Create processed_webhook_events table for webhook idempotency
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      app_user_id TEXT,
      processed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // 3. Add cleanup index on processed_webhook_events
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_processed_webhook_events_processed_at
      ON processed_webhook_events (processed_at)
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS processed_webhook_events`);
  pgm.sql(`ALTER TABLE users DROP COLUMN IF EXISTS is_premium`);
}
