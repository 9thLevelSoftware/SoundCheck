import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 020: Add feed_read_cursors table
 *
 * Tracks per-user last-read position per feed tab (friends, event, happening_now).
 * Used for unseen count badges on tabs and bottom nav.
 *
 * Phase 5: Social Feed & Real-time
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('feed_read_cursors', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    feed_type: { type: 'varchar(20)', notNull: true }, // 'friends', 'event', 'happening_now'
    last_seen_at: { type: 'timestamptz', notNull: true },
    last_seen_checkin_id: { type: 'uuid' },
    updated_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });

  pgm.addConstraint('feed_read_cursors', 'unique_user_feed', {
    unique: ['user_id', 'feed_type'],
  });

  pgm.createIndex('feed_read_cursors', 'user_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('feed_read_cursors');
}
