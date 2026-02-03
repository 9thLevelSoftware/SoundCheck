import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 019: Add metadata JSONB column to user_badges
 *
 * Stores contextual data about how a badge was earned, e.g.:
 *   - superfan: { bandId: "...", bandName: "Radiohead" }
 *   - road_warrior: { cities: ["NYC", "LA", ...] }
 *
 * Default is empty JSONB object. Column is optional for badge types
 * that don't produce metadata.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('user_badges', {
    metadata: {
      type: 'jsonb',
      default: pgm.func("'{}'::jsonb"),
      comment: 'Context data: superfan band info, etc.',
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('user_badges', 'metadata');
}
