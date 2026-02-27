import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 028: Create password_reset_tokens table
 *
 * Secure password reset flow for Trust & Safety. Stores hashed tokens
 * (never plaintext) with expiry timestamps. Tokens are single-use:
 * used_at is set when consumed.
 *
 * Phase 9: Trust & Safety Foundation
 *
 * Security notes:
 *   - token_hash stores SHA-256 hash, not the raw token
 *   - expires_at enforces time-limited validity (typically 1 hour)
 *   - used_at prevents token reuse
 *
 * Indexes:
 *   - token_hash: fast lookup during reset flow
 *   - user_id: find/invalidate tokens for a user
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  pgm.sql('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP TABLE IF EXISTS password_reset_tokens CASCADE;');
}
