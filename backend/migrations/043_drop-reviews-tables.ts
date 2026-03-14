import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 043: Drop reviews tables
 *
 * The reviews feature has been removed. Ratings are now derived from
 * checkin_band_ratings. Drop the dependent review_helpfulness table first,
 * then the reviews table itself.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS review_helpfulness;`);
  pgm.sql(`DROP TABLE IF EXISTS reviews;`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
      band_id UUID REFERENCES bands(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      title VARCHAR(255),
      content TEXT,
      event_date TIMESTAMP WITH TIME ZONE,
      image_urls TEXT[],
      is_verified BOOLEAN DEFAULT false,
      helpful_count INTEGER DEFAULT 0,
      owner_response TEXT,
      owner_response_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  pgm.sql(`
    CREATE TABLE IF NOT EXISTS review_helpfulness (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_helpful BOOLEAN NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (review_id, user_id)
    );
  `);
}
