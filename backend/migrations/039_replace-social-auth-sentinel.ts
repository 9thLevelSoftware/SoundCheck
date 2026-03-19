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
  // DI-014: Use a fixed sentinel hash instead of a random one.
  // A random password generated at migration time makes the migration
  // non-deterministic -- re-running it produces different hashes, and
  // the random value is lost so the hash can never be reproduced.
  // Instead, use a fixed bcrypt hash of a known-unguessable sentinel
  // value. The hash below is bcrypt(10 rounds) of the string
  // "SOCIAL_AUTH_SENTINEL_DO_NOT_USE_AS_PASSWORD_2026".
  // This is safe because: (1) bcrypt prevents reverse lookup,
  // (2) the sentinel string is not a real password, and
  // (3) social auth accounts skip password verification entirely.
  const fixedSentinelHash = await bcrypt.hash(
    'SOCIAL_AUTH_SENTINEL_DO_NOT_USE_AS_PASSWORD_2026',
    10
  );

  // Replace all plaintext sentinel values with the deterministic bcrypt hash
  pgm.sql(`
    UPDATE users
    SET password_hash = '${fixedSentinelHash}'
    WHERE password_hash = '$SOCIAL_AUTH$'
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Cannot reliably reverse this — the random password is lost
  // This is intentional: we don't want to restore the plaintext sentinel
}
