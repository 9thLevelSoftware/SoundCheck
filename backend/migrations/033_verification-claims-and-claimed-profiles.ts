import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 033: Verification Claims & Claimed Profiles
 *
 * Creates:
 * 1. verification_claims table with pending/approved/denied workflow
 * 2. Partial unique index enforcing one pending claim per entity
 * 3. claimed_by_user_id column on venues and bands tables
 * 4. wilson_lower_bound SQL function for trending score calculation
 * 5. updated_at trigger for verification_claims
 *
 * Phase 11: Platform Trust & Between-Show Retention (Plan 01)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Create verification_claims table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS verification_claims (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('venue', 'band')),
      entity_id UUID NOT NULL,
      status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
      evidence_text TEXT,
      evidence_url VARCHAR(500),
      reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Partial unique index: only one pending claim per entity
  pgm.sql(`
    CREATE UNIQUE INDEX idx_claims_one_pending
      ON verification_claims (entity_type, entity_id)
      WHERE status = 'pending';
  `);

  // 3. Additional indexes for common queries
  pgm.sql(`CREATE INDEX idx_claims_user_id ON verification_claims (user_id);`);
  pgm.sql(`CREATE INDEX idx_claims_entity ON verification_claims (entity_type, entity_id);`);
  pgm.sql(`CREATE INDEX idx_claims_status ON verification_claims (status);`);

  // 4. Add claimed_by_user_id to venues
  pgm.sql(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'venues' AND column_name = 'claimed_by_user_id'
      ) THEN
        ALTER TABLE venues ADD COLUMN claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  // 5. Add claimed_by_user_id to bands
  pgm.sql(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bands' AND column_name = 'claimed_by_user_id'
      ) THEN
        ALTER TABLE bands ADD COLUMN claimed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  // 6. Wilson lower bound SQL function
  // Source: Evan Miller "How Not To Sort By Average Rating"
  // z = 1.96 (95% confidence interval)
  pgm.sql(`
    CREATE OR REPLACE FUNCTION wilson_lower_bound(positive BIGINT, total BIGINT)
    RETURNS DOUBLE PRECISION AS $$
    DECLARE
      z CONSTANT DOUBLE PRECISION := 1.96;
      n DOUBLE PRECISION;
      p_hat DOUBLE PRECISION;
    BEGIN
      n := total::DOUBLE PRECISION;
      IF n = 0 THEN RETURN 0; END IF;
      p_hat := positive::DOUBLE PRECISION / n;
      RETURN (p_hat + z*z/(2*n) - z * SQRT((p_hat*(1-p_hat) + z*z/(4*n)) / n)) / (1 + z*z/n);
    END;
    $$ LANGUAGE plpgsql IMMUTABLE STRICT;
  `);

  // 7. updated_at trigger for verification_claims
  pgm.sql(`
    DROP TRIGGER IF EXISTS update_verification_claims_updated_at ON verification_claims;
    CREATE TRIGGER update_verification_claims_updated_at
      BEFORE UPDATE ON verification_claims
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TRIGGER IF EXISTS update_verification_claims_updated_at ON verification_claims;`);
  pgm.sql(`DROP FUNCTION IF EXISTS wilson_lower_bound(BIGINT, BIGINT);`);
  pgm.sql(`ALTER TABLE bands DROP COLUMN IF EXISTS claimed_by_user_id;`);
  pgm.sql(`ALTER TABLE venues DROP COLUMN IF EXISTS claimed_by_user_id;`);
  pgm.sql(`DROP TABLE IF EXISTS verification_claims CASCADE;`);
}
