import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 003: Create event_lineup junction table (Expand phase)
 *
 * Supports multi-band lineups per event. Each row is one band's slot
 * in an event, with set order and headliner flag.
 *
 * FK: event_id -> events(id) (created in migration 002)
 * FK: band_id -> bands(id) (existing table)
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('event_lineup', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    event_id: { type: 'uuid', notNull: true, references: 'events', onDelete: 'CASCADE' },
    band_id: { type: 'uuid', notNull: true, references: 'bands', onDelete: 'CASCADE' },
    set_order: { type: 'integer', notNull: true, default: 0 },
    set_time: { type: 'time' },
    is_headliner: { type: 'boolean', default: false },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });

  // One band can only appear once per event
  pgm.addConstraint('event_lineup', 'unique_lineup_slot', {
    unique: ['event_id', 'band_id'],
  });

  // Indexes for joins and lookups
  pgm.createIndex('event_lineup', 'event_id');
  pgm.createIndex('event_lineup', 'band_id');
  pgm.createIndex('event_lineup', ['event_id', 'set_order']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('event_lineup', { cascade: true });
}
