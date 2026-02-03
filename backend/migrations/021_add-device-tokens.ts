import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 021: Add device_tokens table for FCM push notifications
 *
 * Stores Firebase Cloud Messaging device tokens per user.
 * Each user can have multiple tokens (one per device/app install).
 * Tokens are refreshed on every app launch via UPSERT.
 *
 * Phase 5: Social Feed & Real-time (Plan 2)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('device_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    token: { type: 'text', notNull: true },
    platform: { type: 'varchar(20)', notNull: true }, // 'android', 'ios'
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
    updated_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });

  // Unique constraint: one token per user (same token can't be registered twice for same user)
  pgm.addConstraint('device_tokens', 'unique_user_token', {
    unique: ['user_id', 'token'],
  });

  pgm.createIndex('device_tokens', 'user_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('device_tokens');
}
