import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 048: Rename total_reviews → total_checkins
 *
 * Part of the brand alignment initiative: all "review" language is replaced
 * with "check-in" language to reflect the app's primary action.
 *
 * Renames the total_reviews column on both the venues and bands tables to
 * total_checkins to match the updated service layer and TypeScript types.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE venues RENAME COLUMN total_reviews TO total_checkins;
    ALTER TABLE bands RENAME COLUMN total_reviews TO total_checkins;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE venues RENAME COLUMN total_checkins TO total_reviews;
    ALTER TABLE bands RENAME COLUMN total_checkins TO total_reviews;
  `);
}
