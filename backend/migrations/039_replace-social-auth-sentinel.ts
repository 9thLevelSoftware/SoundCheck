import type { MigrationBuilder } from 'node-pg-migrate';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

/**
 * Migration 039: Replace Social Auth Plaintext Sentinel
 *
 * Replaces the plaintext '$SOCIAL_AUTH$' password_hash values with proper
 * bcrypt hashes of random values. This prevents account type leakage
 * through password hash inspection.
 *
 * Phase 13: Security & Infrastructure Hardening (Plan 01)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Generate a random password and hash it with bcrypt
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const hashedPlaceholder = await bcrypt.hash(randomPassword, 10);

  // Replace all plaintext sentinel values with the bcrypt hash
  pgm.sql(`
    UPDATE users
    SET password_hash = '${hashedPlaceholder}'
    WHERE password_hash = '$SOCIAL_AUTH$'
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Cannot reliably reverse this — the random password is lost
  // This is intentional: we don't want to restore the plaintext sentinel
}
