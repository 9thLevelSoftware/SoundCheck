import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 006: Add timezone to venues (Expand phase)
 *
 * IANA timezone identifier (e.g. America/New_York) for correct
 * local time display. VARCHAR(50) is sufficient for all IANA timezone IDs.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'venues' AND column_name = 'timezone'
      ) THEN
        ALTER TABLE venues ADD COLUMN timezone VARCHAR(50);
        COMMENT ON COLUMN venues.timezone IS 'IANA timezone identifier, e.g. America/New_York';
      END IF;
    END $$;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('venues', 'timezone');
}
