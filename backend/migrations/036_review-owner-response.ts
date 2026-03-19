import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 036: Review Owner Response
 *
 * Adds owner_response and owner_response_at columns to reviews table,
 * enabling claimed venue/band owners to respond to reviews.
 *
 * NOTE (CFR-019 / DB-002 / DI-013): On a fresh database where reviews
 * table was never created (it is schema.sql-only, not in any migration),
 * this migration will safely no-op thanks to the IF EXISTS guard.
 * The reviews table was subsequently dropped in migration 043.
 *
 * Phase 11: Platform Trust & Between-Show Retention (Plan 01)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Guard: reviews table may not exist on fresh databases (CFR-019)
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reviews') THEN
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS owner_response TEXT;
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS owner_response_at TIMESTAMPTZ;
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE reviews DROP COLUMN IF EXISTS owner_response_at;`);
  pgm.sql(`ALTER TABLE reviews DROP COLUMN IF EXISTS owner_response;`);
}
