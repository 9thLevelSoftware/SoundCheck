import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 002: Create events table (Expand phase)
 *
 * Events are first-class entities with multi-band support via event_lineup.
 * This replaces the old shows table (which had 1 band per show).
 * The shows table is NOT dropped here -- it will be retired in a future
 * contract migration after all code paths are migrated.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    venue_id: { type: 'uuid', notNull: true, references: 'venues', onDelete: 'CASCADE' },
    event_date: { type: 'date', notNull: true },
    event_name: { type: 'varchar(255)' },
    description: { type: 'text' },
    doors_time: { type: 'time' },
    start_time: { type: 'time' },
    end_time: { type: 'time' },
    ticket_url: { type: 'varchar(500)' },
    ticket_price_min: { type: 'decimal(10,2)' },
    ticket_price_max: { type: 'decimal(10,2)' },
    is_sold_out: { type: 'boolean', default: false },
    is_cancelled: { type: 'boolean', default: false },
    event_type: { type: 'varchar(50)', default: "'concert'" },
    source: { type: 'varchar(50)', default: "'user_created'" },
    external_id: { type: 'varchar(255)' },
    created_by_user_id: { type: 'uuid', references: 'users' },
    is_verified: { type: 'boolean', default: false },
    total_checkins: { type: 'integer', default: 0 },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
    updated_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });

  // Deduplication constraint: one event per source per external ID
  pgm.addConstraint('events', 'unique_external_event', {
    unique: ['source', 'external_id'],
  });

  // Indexes for common query patterns
  pgm.createIndex('events', 'venue_id');
  pgm.createIndex('events', 'event_date');
  pgm.createIndex('events', ['venue_id', 'event_date']);
  pgm.createIndex('events', 'source');

  // Reuse the existing update_updated_at_column() trigger function
  pgm.sql(`
    DROP TRIGGER IF EXISTS update_events_updated_at ON events;
    CREATE TRIGGER update_events_updated_at
      BEFORE UPDATE ON events
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('events', { cascade: true });
}
