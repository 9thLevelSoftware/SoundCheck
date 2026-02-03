import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 015: Add GIN trigram index on bands.name
 *
 * Enables fast fuzzy matching for band name resolution during event sync.
 * The pg_trgm extension was enabled in migration 001.
 * The GIN index supports the % (similarity) operator efficiently.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_bands_name_trgm
    ON bands USING gin (name gin_trgm_ops);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP INDEX IF EXISTS idx_bands_name_trgm;');
}
