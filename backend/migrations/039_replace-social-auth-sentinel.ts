import type { MigrationBuilder } from 'node-pg-migrate';

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
  // DI-014: bcrypt.hash() draws a new salt on every run, so this file
  // used to store a different hash each time it was applied. The constant
  // below is one bcrypt (10 rounds) digest of
  // "SOCIAL_AUTH_SENTINEL_DO_NOT_USE_AS_PASSWORD_2026". It looks like any
  // other password hash, and social-auth accounts never verify it.
  // Already-applied databases keep the hash they stored; node-pg-migrate
  // records the migration name, not a file checksum, so this edit does
  // not re-run 039.
  const fixedSentinelHash = '$2b$10$sGTAwsSApiWQT9/nLGqGDOch56nNJY5WMDfLGKaZW.N.IsiMi25jK';

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
