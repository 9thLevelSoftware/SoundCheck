import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 016: Create sync_regions table
 *
 * Tracks geographic regions for event sync coverage.
 * Each region is a lat/lon centroid with a radius. Regions can be
 * auto-derived from user check-in locations or manually configured.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sync_regions'
      ) THEN
        CREATE TABLE sync_regions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          label VARCHAR(255),
          latitude DECIMAL(10,8) NOT NULL,
          longitude DECIMAL(11,8) NOT NULL,
          radius_miles INTEGER DEFAULT 50,
          is_active BOOLEAN DEFAULT true,
          user_count INTEGER DEFAULT 0,
          last_synced_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('sync_regions', { ifExists: true });
}
