import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 005: Create checkin_band_ratings table (Expand phase)
 *
 * Per-set band ratings within a check-in. When a user checks in to an
 * event with multiple bands, they can rate each band independently.
 * Rating is DECIMAL(2,1) NOT NULL with half-star increments (0.5 - 5.0).
 *
 * FK: checkin_id -> checkins(id)
 * FK: band_id -> bands(id)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('checkin_band_ratings', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    checkin_id: { type: 'uuid', notNull: true, references: 'checkins', onDelete: 'CASCADE' },
    band_id: { type: 'uuid', notNull: true, references: 'bands', onDelete: 'CASCADE' },
    rating: {
      type: 'decimal(2,1)',
      notNull: true,
    },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });

  // Add CHECK constraint for rating range
  pgm.sql(`
    ALTER TABLE checkin_band_ratings
    ADD CONSTRAINT checkin_band_ratings_rating_range
    CHECK (rating >= 0.5 AND rating <= 5.0);
  `);

  // One rating per band per check-in
  pgm.addConstraint('checkin_band_ratings', 'unique_checkin_band_rating', {
    unique: ['checkin_id', 'band_id'],
  });

  // Indexes for lookups
  pgm.createIndex('checkin_band_ratings', 'checkin_id');
  pgm.createIndex('checkin_band_ratings', 'band_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('checkin_band_ratings', { cascade: true });
}
