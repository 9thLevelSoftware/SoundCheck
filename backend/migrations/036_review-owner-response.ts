import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 036: Review Owner Response
 *
 * Adds owner_response and owner_response_at columns to reviews table,
 * enabling claimed venue/band owners to respond to reviews.
 *
 * Phase 11: Platform Trust & Between-Show Retention (Plan 01)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Add owner_response TEXT column
  pgm.sql(`
    ALTER TABLE reviews ADD COLUMN owner_response TEXT;
  `);

  // 2. Add owner_response_at TIMESTAMPTZ column
  pgm.sql(`
    ALTER TABLE reviews ADD COLUMN owner_response_at TIMESTAMPTZ;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE reviews DROP COLUMN IF EXISTS owner_response_at;`);
  pgm.sql(`ALTER TABLE reviews DROP COLUMN IF EXISTS owner_response;`);
}
