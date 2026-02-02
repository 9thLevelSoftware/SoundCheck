import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 008: Add JSONB badge criteria (Expand phase)
 *
 * Adds a criteria JSONB column to the badges table for data-driven
 * badge evaluation. Example criteria structures:
 *   {"type": "checkin_count", "threshold": 10}
 *   {"type": "genre", "genre": "rock", "threshold": 5}
 *   {"type": "unique_venues", "threshold": 10}
 *
 * GIN index enables efficient containment queries (@>, ?).
 * The actual BadgeService rewrite to use this column happens in Phase 4.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('badges', {
    criteria: {
      type: 'jsonb',
      default: pgm.func("'{}'::jsonb"),
      comment: 'Data-driven evaluation criteria: {"type":"checkin_count","threshold":10}',
    },
  });

  // GIN index for JSONB containment queries
  pgm.createIndex('badges', 'criteria', { method: 'gin' });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('badges', 'criteria');
}
