# Phase 1: Data Model Foundation - Research

**Researched:** 2026-02-02
**Domain:** PostgreSQL schema migration, expand-contract pattern, event-centric data modeling
**Confidence:** HIGH

## Summary

Phase 1 replaces SoundCheck's current shows/checkins schema with an event-centric data model. The existing database has a `shows` table (1 venue + 1 band + 1 date) and `checkins` that reference `band_id` + `venue_id` directly. The target model centers on `events` with multi-band lineups via a junction table, check-ins that reference `event_id`, dual ratings (venue + band), per-set band ratings in a separate table, and JSONB-based badge criteria.

The critical technical challenge is performing this migration safely on a live database using the expand-contract pattern. The existing ad-hoc migration scripts (`migrate.js` and `migrate-events-model.ts`) have no transaction safety, no rollback capability, and no migration tracking. They must be replaced with `node-pg-migrate` (v8.0.4/9.0.0-alpha), which provides versioned, transactional migrations tracked in a `pgmigrations` table.

**Primary recommendation:** Install node-pg-migrate, write migrations as individual TypeScript files following expand-then-contract ordering, and ensure every migration step keeps existing API endpoints functional. The mobile app already partially expects the new model (CheckIn model has eventId, venueRating, bandRating fields), which reduces frontend risk.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node-pg-migrate | ^8.0.4 | Versioned database migrations | PostgreSQL-specific, SQL-native, tracks state in pgmigrations table, TypeScript support, transactional by default |
| pg | ^8.16.3 | PostgreSQL client | Already installed, used by all services |
| uuid-ossp | (extension) | UUID generation | Already enabled in database |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pg_trgm | (extension) | Fuzzy text matching | Phase 2 band name matching, but install extension in Phase 1 to avoid future DDL |
| dotenv | ^17.2.1 | Env var loading | Already installed, needed for migration scripts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node-pg-migrate | knex migrations | Knex is an ORM with migrations; node-pg-migrate is migration-only. Since the project uses raw `pg` queries (no ORM), adding knex just for migrations introduces unnecessary abstraction |
| node-pg-migrate | pgroll | pgroll is a sophisticated expand-contract tool with versioned schema views. Overkill for a single-developer project; node-pg-migrate is simpler and sufficient |
| node-pg-migrate | Custom migration runner (existing migrate.js) | No rollback, no tracking, no transaction safety. Must be replaced. |

**Installation:**
```bash
npm install node-pg-migrate
```

Note: `pg` is already installed. node-pg-migrate uses it as a peer dependency.

## Architecture Patterns

### Recommended Migration Directory Structure
```
backend/
  migrations/
    001_setup-migration-infrastructure.ts
    002_expand-create-events-table.ts
    003_expand-create-event-lineup-table.ts
    004_expand-add-event-id-to-checkins.ts
    005_expand-create-checkin-band-ratings.ts
    006_expand-add-venue-timezone.ts
    007_expand-add-event-source-tracking.ts
    008_expand-create-badge-criteria.ts
    009_expand-update-triggers.ts
    010_migrate-shows-to-events.ts
    011_migrate-checkins-data.ts
    012_contract-remove-old-columns.ts
```

### Pattern 1: Expand-Contract Migration
**What:** Split schema changes into two deployable phases -- expand (add new alongside old) and contract (remove old after code migrated).

**When to use:** Any breaking schema change on a table with active reads/writes.

**Expand phase migrations (safe, additive only):**
```typescript
// Source: expand-contract pattern, verified from multiple sources
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // EXPAND: Add new columns/tables alongside existing ones
  // Old code continues to work because nothing is removed or renamed
  pgm.createTable('events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    venue_id: { type: 'uuid', notNull: true, references: 'venues', onDelete: 'CASCADE' },
    event_date: { type: 'date', notNull: true },
    event_name: { type: 'varchar(255)' },
    // ... more columns
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
    updated_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP') },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('events');
}
```

**Contract phase migrations (removing old schema):**
```typescript
// ONLY run after verifying:
// 1. All code paths use new schema
// 2. Data migration is complete and validated
// 3. Old columns are no longer read or written

export async function up(pgm: MigrationBuilder): Promise<void> {
  // CONTRACT: Remove old columns that are no longer used
  pgm.dropColumn('checkins', ['band_id', 'venue_id', 'rating', 'comment', 'photo_url', 'event_date']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Restore old columns (for rollback safety)
  pgm.addColumn('checkins', {
    band_id: { type: 'uuid', references: 'bands' },
    venue_id: { type: 'uuid', references: 'venues' },
    rating: { type: 'decimal(2,1)' },
    comment: { type: 'text' },
    photo_url: { type: 'varchar(500)' },
    event_date: { type: 'date' },
  });
}
```

### Pattern 2: Data Migration as Separate Migration Files
**What:** Data migrations (INSERT/UPDATE to move data) are separate from schema migrations (CREATE/ALTER).

**When to use:** When migrating data between old and new schema structures.

**Example:**
```typescript
// This is async because it needs to do data work, not just DDL
export async function up(pgm: MigrationBuilder): Promise<void> {
  // Migrate shows -> events
  // Each show becomes an event with a single-band lineup
  pgm.sql(`
    INSERT INTO events (id, venue_id, event_date, event_name, doors_time, start_time, end_time,
                        ticket_url, ticket_price_min, ticket_price_max, is_sold_out, is_cancelled,
                        source, created_at, updated_at)
    SELECT id, venue_id, show_date, NULL, doors_time, start_time, end_time,
           ticket_url, ticket_price_min, ticket_price_max, is_sold_out, is_cancelled,
           'migrated', created_at, updated_at
    FROM shows
    ON CONFLICT DO NOTHING;
  `);

  // Create lineup entries from shows (each show had exactly one band)
  pgm.sql(`
    INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner)
    SELECT id, band_id, 0, true
    FROM shows
    ON CONFLICT DO NOTHING;
  `);
}
```

### Pattern 3: JSONB Badge Criteria
**What:** Store badge evaluation rules as JSONB documents instead of hardcoded switch statements.

**When to use:** When business rules need to change without code deployment.

**Example:**
```typescript
// Badge criteria JSONB structure
pgm.addColumn('badges', {
  criteria: {
    type: 'jsonb',
    default: pgm.func("'{}'::jsonb"),
    comment: 'Data-driven badge evaluation criteria',
  },
});

// Seed example criteria:
// { "type": "checkin_count", "threshold": 10 }
// { "type": "genre", "genre": "rock", "threshold": 5 }
// { "type": "band_repeat", "threshold": 3 }
// { "type": "unique_venues", "threshold": 10 }
// { "type": "time_window", "window_hours": 24, "threshold": 3 }
```

### Pattern 4: Dual-Write During Migration
**What:** During the expand phase, application code writes to both old AND new columns to keep data consistent.

**When to use:** When old code paths must continue reading from old columns while new code reads from new columns.

**In this project's context:** The existing `CheckinService.createCheckin()` writes `band_id`, `venue_id`, `rating`. During expand phase, it must ALSO write `event_id` (looking up or creating the event). This dual-write period lasts until the contract phase removes old columns.

### Anti-Patterns to Avoid
- **Big-bang migration:** Never drop old tables and create new ones in a single deployment. The app will have downtime between code deploy and migration completion.
- **Skipping the dual-write period:** If you add `event_id` to checkins but don't populate it for new check-ins, you'll have a mix of null and non-null event_ids that complicates queries.
- **Running data migrations without transaction:** The existing `migrate-events-model.ts` has zero transaction safety. A failure halfway through leaves the database in an inconsistent state.
- **Tight coupling to column names in routes:** The existing controllers reference specific column names. Use the service layer as the abstraction boundary -- controllers call services, services handle the schema differences.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration versioning/tracking | Custom migration table + runner | node-pg-migrate (pgmigrations table) | Handles ordering, lock safety, transaction wrapping, rollback |
| UUID generation | Application-side UUID | PostgreSQL uuid-ossp extension (`uuid_generate_v4()`) | Already in use, database-level generation is atomic |
| Timestamp management | Application-side Date.now() | PostgreSQL `CURRENT_TIMESTAMP` defaults + `update_updated_at_column()` trigger | Already exists in codebase, consistent and reliable |
| Advisory locking for migrations | Custom locking code | node-pg-migrate built-in advisory locks | Prevents concurrent migration runs in multi-instance deploys |
| JSONB validation | Custom TypeScript validation | PostgreSQL CHECK constraints on JSONB structure | Database-level enforcement, cannot be bypassed |

**Key insight:** The existing codebase already has the trigger pattern for `updated_at` columns (`update_updated_at_column()` function). Reuse this for all new tables rather than creating new trigger functions.

## Common Pitfalls

### Pitfall 1: The Shows/Events Dual Table (CRITICAL)
**What goes wrong:** The codebase already has BOTH a `shows` table (from `database-schema.sql`) AND a partial `events` table (from `migrate-events-model.ts`). The `EventService.ts` wraps `shows` queries as "event" queries. Running the Phase 1 migration on a database where `migrate-events-model.ts` was already applied will fail with conflicts.
**Why it happens:** Incomplete incremental migration left two parallel schemas.
**How to avoid:** The FIRST migration must detect and handle the existing state: check if the old `events` table from `migrate-events-model.ts` exists, drop it if so (it has wrong schema -- it has `band_id` directly instead of lineup junction table), then create the correct new `events` table. Document this clearly in migration comments.
**Warning signs:** `CREATE TABLE IF NOT EXISTS` silently succeeding on a table with the wrong shape.

### Pitfall 2: Foreign Key Ordering in Migrations
**What goes wrong:** Creating `event_lineup` before `events` table, or `checkin_band_ratings` before `checkins` is redesigned, causes foreign key reference failures.
**Why it happens:** Migration files execute in order. Wrong ordering means referenced tables don't exist yet.
**How to avoid:** Number migrations explicitly. events before event_lineup, events before checkins (for event_id FK), checkins before checkin_band_ratings.
**Warning signs:** Migration failure with "relation does not exist" errors.

### Pitfall 3: Nullable event_id During Transition
**What goes wrong:** Adding `event_id` to `checkins` as NOT NULL immediately breaks all existing rows (they have no event_id). Adding it as nullable means queries must handle both null and non-null event_ids forever.
**Why it happens:** Expand-contract requires the column to be nullable initially (existing rows have no value), then made NOT NULL after data backfill.
**How to avoid:** Step 1: Add `event_id UUID REFERENCES events(id)` (nullable). Step 2: Backfill from old data. Step 3: Add NOT NULL constraint in contract phase. Step 4: The application code must handle both states during the transition window.
**Warning signs:** CHECK constraint violation when altering column to NOT NULL before all rows are populated.

### Pitfall 4: Trigger Conflicts on Redesigned Checkins Table
**What goes wrong:** The existing `trigger_update_stats_on_checkin` trigger references `checkins.band_id` and `checkins.venue_id`. When these columns are removed in the contract phase, the trigger will fail on every INSERT.
**Why it happens:** Triggers are not automatically updated when referenced columns change.
**How to avoid:** Update the trigger function BEFORE the contract phase. In the expand phase, create a new version of the trigger function that reads from events table (via event_id) instead of directly from band_id/venue_id. Swap triggers before removing old columns.
**Warning signs:** "column does not exist" errors in trigger functions after column removal.

### Pitfall 5: Notifications Table FK to Shows
**What goes wrong:** The `notifications` table has `show_id UUID REFERENCES shows(id)`. Dropping the `shows` table breaks this constraint.
**Why it happens:** Foreign key to a table that's being retired.
**How to avoid:** Add `event_id` column to notifications, backfill from shows, drop `show_id` in contract phase. Or add a migration step that replaces the FK.
**Warning signs:** Cannot drop `shows` table due to existing foreign key references.

### Pitfall 6: BadgeService Queries Reviews Table, Not Checkins
**What goes wrong:** The existing `BadgeService.getUserStats()` counts from the `reviews` table, not `checkins`. Phase 1 creates the infrastructure for data-driven badges via JSONB criteria, but the actual badge evaluation rewrite happens in Phase 4. The badge system will be disconnected during Phases 1-3.
**Why it happens:** The badge system was built against the review model, not the check-in model.
**How to avoid:** Phase 1 should create the `badge_criteria` JSONB column and the `checkin_band_ratings` table structure, but NOT rewrite BadgeService. Leave the existing badge evaluation pointing at reviews until Phase 4. Document this explicitly as a known gap.
**Warning signs:** Badge evaluations returning 0 for users who only have check-ins (not reviews).

### Pitfall 7: Rating Type Mismatch
**What goes wrong:** The current `checkins.rating` is `DECIMAL(2,1)` (0-5, half-star). The old `migrate-events-model.ts` defined `venue_rating INTEGER CHECK (venue_rating >= 1 AND venue_rating <= 5)` -- INTEGER, not DECIMAL, and 1-5 not 0.5-5. If the old migration was applied, the existing events table has the wrong type.
**Why it happens:** Design changed between migration script versions.
**How to avoid:** The new schema must use `DECIMAL(2,1) CHECK (rating >= 0.5 AND rating <= 5.0)` for all ratings. Half-star increments require decimal. The minimum should be 0.5 (not 0, which means "not rated" -- use NULL for that).
**Warning signs:** Ratings of 3.5 being rounded to 4 because column is INTEGER.

## Code Examples

Verified patterns from the existing codebase and official documentation:

### node-pg-migrate package.json Setup
```json
{
  "scripts": {
    "migrate": "node-pg-migrate -j ts --migrations-dir ./migrations --database-url-var DATABASE_URL",
    "migrate:up": "npm run migrate up",
    "migrate:down": "npm run migrate down",
    "migrate:create": "npm run migrate create"
  }
}
```

### Creating the Events Table (Expand Phase)
```typescript
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Drop the incomplete events table from the old migration if it exists
  // (it has band_id directly instead of junction table)
  pgm.sql(`
    DROP TABLE IF EXISTS checkin_toasts CASCADE;
    DROP TABLE IF EXISTS checkin_comments CASCADE;
  `);
  // Only drop old events if it has band_id column (wrong schema)
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'band_id'
      ) THEN
        DROP TABLE IF EXISTS events CASCADE;
      END IF;
    END $$;
  `);

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

  // Indexes
  pgm.createIndex('events', 'venue_id');
  pgm.createIndex('events', 'event_date');
  pgm.createIndex('events', ['venue_id', 'event_date']);
  pgm.createIndex('events', 'source');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('events', { cascade: true });
}
```

### Creating the Event Lineup Junction Table
```typescript
import type { MigrationBuilder } from 'node-pg-migrate';

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

  pgm.addConstraint('event_lineup', 'unique_lineup_slot', {
    unique: ['event_id', 'band_id'],
  });

  pgm.createIndex('event_lineup', 'event_id');
  pgm.createIndex('event_lineup', 'band_id');
  pgm.createIndex('event_lineup', ['event_id', 'set_order']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('event_lineup', { cascade: true });
}
```

### Adding event_id to Checkins (Expand - Nullable First)
```typescript
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add event_id as NULLABLE (existing rows have no event)
  pgm.addColumn('checkins', {
    event_id: { type: 'uuid', references: 'events', onDelete: 'CASCADE' },
  });

  // Add venue_rating as separate column (dual rating system)
  pgm.addColumn('checkins', {
    venue_rating: {
      type: 'decimal(2,1)',
      check: 'venue_rating IS NULL OR (venue_rating >= 0.5 AND venue_rating <= 5.0)',
    },
  });

  // Add review_text (rename of comment)
  pgm.addColumn('checkins', {
    review_text: { type: 'text' },
  });

  // Add image_urls array (multiple photos)
  pgm.addColumn('checkins', {
    image_urls: { type: 'text[]' },
  });

  // Add location verification flag
  pgm.addColumn('checkins', {
    is_verified: { type: 'boolean', default: false },
  });

  // Add unique constraint for one check-in per user per event
  // (only enforced on non-null event_ids during transition)
  pgm.createIndex('checkins', ['user_id', 'event_id'], {
    unique: true,
    where: 'event_id IS NOT NULL',
    name: 'idx_unique_user_event_checkin',
  });

  pgm.createIndex('checkins', 'event_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('checkins', ['user_id', 'event_id'], { name: 'idx_unique_user_event_checkin' });
  pgm.dropIndex('checkins', 'event_id');
  pgm.dropColumn('checkins', ['event_id', 'venue_rating', 'review_text', 'image_urls', 'is_verified']);
}
```

### Creating Checkin Band Ratings Table
```typescript
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('checkin_band_ratings', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    checkin_id: { type: 'uuid', notNull: true, references: 'checkins', onDelete: 'CASCADE' },
    band_id: { type: 'uuid', notNull: true, references: 'bands', onDelete: 'CASCADE' },
    rating: {
      type: 'decimal(2,1)',
      notNull: true,
      check: 'rating >= 0.5 AND rating <= 5.0',
    },
    created_at: { type: 'timestamptz', default: pgm.func('CURRENT_TIMESTAMP'), notNull: true },
  });

  pgm.addConstraint('checkin_band_ratings', 'unique_checkin_band_rating', {
    unique: ['checkin_id', 'band_id'],
  });

  pgm.createIndex('checkin_band_ratings', 'checkin_id');
  pgm.createIndex('checkin_band_ratings', 'band_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('checkin_band_ratings', { cascade: true });
}
```

### Adding IANA Timezone to Venues
```typescript
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add IANA timezone identifier to venues
  pgm.addColumn('venues', {
    timezone: {
      type: 'varchar(50)',
      comment: 'IANA timezone identifier, e.g. America/New_York',
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('venues', 'timezone');
}
```

### Adding JSONB Badge Criteria
```typescript
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add JSONB criteria column to existing badges table
  pgm.addColumn('badges', {
    criteria: {
      type: 'jsonb',
      default: pgm.func("'{}'::jsonb"),
      comment: 'Data-driven evaluation criteria: {"type":"checkin_count","threshold":10}',
    },
  });

  // GIN index for JSONB containment queries
  pgm.createIndex('badges', 'criteria', { method: 'gin' });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('badges', 'criteria');
}
```

### Data Migration: Shows to Events
```typescript
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Step 1: Migrate shows -> events
  pgm.sql(`
    INSERT INTO events (
      id, venue_id, event_date, doors_time, start_time, end_time,
      ticket_url, ticket_price_min, ticket_price_max,
      is_sold_out, is_cancelled, description,
      source, is_verified, created_at, updated_at
    )
    SELECT
      id, venue_id, show_date, doors_time, start_time, end_time,
      ticket_url, ticket_price_min, ticket_price_max,
      is_sold_out, is_cancelled, description,
      'migrated', true, created_at, updated_at
    FROM shows
    ON CONFLICT DO NOTHING;
  `);

  // Step 2: Create lineup entries (each old show had exactly one band)
  pgm.sql(`
    INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner)
    SELECT id, band_id, 0, true
    FROM shows
    ON CONFLICT DO NOTHING;
  `);

  // Step 3: Backfill event_id on checkins
  // Match checkins to events by venue_id + band_id + event_date
  pgm.sql(`
    UPDATE checkins c
    SET event_id = e.id
    FROM events e
    JOIN event_lineup el ON e.id = el.event_id
    WHERE c.venue_id = e.venue_id
      AND c.band_id = el.band_id
      AND c.event_date = e.event_date
      AND c.event_id IS NULL;
  `);

  // Step 4: For checkins that couldn't match (no show record),
  -- create events on-the-fly
  pgm.sql(`
    INSERT INTO events (venue_id, event_date, source, is_verified, created_at, updated_at)
    SELECT DISTINCT c.venue_id, c.event_date, 'migrated', false, c.created_at, c.created_at
    FROM checkins c
    WHERE c.event_id IS NULL
      AND c.venue_id IS NOT NULL
      AND c.event_date IS NOT NULL
    ON CONFLICT DO NOTHING;
  `);

  -- Create lineup entries for orphaned checkins
  pgm.sql(`
    INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner)
    SELECT DISTINCT e.id, c.band_id, 0, true
    FROM checkins c
    JOIN events e ON c.venue_id = e.venue_id AND c.event_date = e.event_date
    WHERE c.event_id IS NULL
      AND c.band_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  `);

  -- Re-run the backfill for newly created events
  pgm.sql(`
    UPDATE checkins c
    SET event_id = e.id
    FROM events e
    WHERE c.venue_id = e.venue_id
      AND c.event_date = e.event_date
      AND c.event_id IS NULL;
  `);

  // Step 5: Copy old single rating to both band rating and venue rating
  pgm.sql(`
    UPDATE checkins
    SET venue_rating = rating
    WHERE venue_rating IS NULL AND rating IS NOT NULL;
  `);

  // Create band ratings from old single rating
  pgm.sql(`
    INSERT INTO checkin_band_ratings (checkin_id, band_id, rating)
    SELECT c.id, c.band_id, c.rating
    FROM checkins c
    WHERE c.rating IS NOT NULL
      AND c.band_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  `);

  // Step 6: Copy old comment to review_text
  pgm.sql(`
    UPDATE checkins
    SET review_text = comment
    WHERE review_text IS NULL AND comment IS NOT NULL;
  `);

  // Step 7: Copy old photo_url to image_urls array
  pgm.sql(`
    UPDATE checkins
    SET image_urls = ARRAY[photo_url]
    WHERE image_urls IS NULL AND photo_url IS NOT NULL;
  `);
}

// Data migrations should NOT have a down function that deletes data
// Instead, the down function is a no-op with a comment explaining why
export async function down(pgm: MigrationBuilder): Promise<void> {
  // Data migration rollback would require restoring original data.
  // The expand phase preserved all original columns, so data is not lost.
  // Rolling back this migration just means the backfilled columns have data
  // that won't be used if the schema reverts.
}
```

### Updated Venue Rating Trigger (for Dual Rating System)
```sql
-- New trigger function for venue ratings via events
CREATE OR REPLACE FUNCTION update_venue_rating_on_checkin()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE venues SET
    average_rating = COALESCE(
      (SELECT AVG(c.venue_rating)
       FROM checkins c
       JOIN events e ON c.event_id = e.id
       WHERE e.venue_id = (SELECT venue_id FROM events WHERE id = NEW.event_id)
       AND c.venue_rating IS NOT NULL),
      0
    ),
    total_checkins = (
      SELECT COUNT(*) FROM checkins c
      JOIN events e ON c.event_id = e.id
      WHERE e.venue_id = (SELECT venue_id FROM events WHERE id = NEW.event_id)
    )
  WHERE id = (SELECT venue_id FROM events WHERE id = NEW.event_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ad-hoc SQL scripts (migrate.js) | Versioned migration tools (node-pg-migrate) | Standard practice for years | Tracked, reversible, transactional migrations |
| TIMESTAMP for event times | TIMESTAMPTZ everywhere | PostgreSQL best practice | Correct timezone handling across regions |
| VARCHAR timezone abbreviations | IANA timezone identifiers (e.g. America/New_York) | PostgreSQL wiki "Don't Do This" | Handles DST correctly, future-proof |
| Single rating column | Dual ratings (venue + band) in separate columns/tables | Design decision for this project | Independent signals, per-set band ratings |
| Hardcoded badge rules (switch statement) | JSONB criteria columns | Data-driven pattern | New badges without code deployment |
| shows table (1 band per show) | events + event_lineup (N bands per event) | This migration | Supports festivals, multi-band bills |

**Deprecated/outdated in codebase:**
- `migrate.js`: Raw SQL script runner with no tracking. Replace with node-pg-migrate.
- `migrate-events-model.ts`: Partial migration with wrong schema (events has band_id). Must be cleaned up.
- `BadgeService.getUserStats()`: Queries `reviews` table. Will be rewritten in Phase 4 to query `checkins`.
- `EventService` wrapping `shows` table: Facade pattern hiding the wrong table. Will be rewritten.

## Existing Codebase State Analysis

### Database Schema (Current)
| Table | Status | Phase 1 Action |
|-------|--------|----------------|
| `users` | Keep | Add no changes (stats triggers updated) |
| `venues` | Keep + extend | Add `timezone VARCHAR(50)` |
| `bands` | Keep | Already has `musicbrainz_id`, `source` from old migration |
| `shows` | RETIRE | Migrate data to `events`, drop in contract phase |
| `checkins` | EXTEND | Add `event_id`, `venue_rating`, `review_text`, `image_urls`, `is_verified` |
| `vibe_tags` | Keep | No changes |
| `checkin_vibes` | Keep | No changes |
| `toasts` | Keep | No changes (references checkins.id, which persists) |
| `checkin_comments` | Keep | No changes |
| `user_followers` | Keep | No changes |
| `badges` | EXTEND | Add `criteria JSONB` column |
| `user_badges` | Keep | No changes |
| `notifications` | EXTEND | Add `event_id`, migrate `show_id` references |
| `reviews` | Keep (for now) | Do NOT modify -- BadgeService depends on it until Phase 4 |
| `review_helpfulness` | Keep (for now) | Same as reviews |
| `refresh_tokens` | Keep | No changes |
| `deletion_requests` | Keep | No changes |
| `user_consents` | Keep | No changes |
| `user_social_accounts` | Keep | No changes |
| `user_wishlist` | Keep | No changes |
| NEW: `events` | CREATE | Event entity with venue+date, source tracking, dedup constraint |
| NEW: `event_lineup` | CREATE | Junction table for multi-band lineups |
| NEW: `checkin_band_ratings` | CREATE | Per-set band ratings within a check-in |

### Service Layer Impact
| Service | Phase 1 Changes Required |
|---------|-------------------------|
| `EventService.ts` | Rewrite: stop wrapping shows, query events+event_lineup directly |
| `CheckinService.ts` | Dual-write: write to both old columns and new event_id during expand |
| `BadgeService.ts` | Minimal: add criteria column, do NOT rewrite evaluation (Phase 4) |
| All other services | No changes in Phase 1 |

### Mobile Model Readiness
The Flutter `CheckIn` model (`checkin.dart`) is ALREADY partially prepared:
- Has `eventId` field (nullable String?)
- Has `venueRating` and `bandRating` as separate doubles
- Has `reviewText` field
- Has `imageUrls` as List<String>?
- Has nested `CheckInEvent` with venue and band sub-objects
- Has `earnedBadges` list

However, `CreateCheckInRequest` still sends `bandId` + `venueId` + `eventDate` (not `eventId`). This will need updating in Phase 3 (Check-in Flow) when the check-in UX is redesigned.

### API Endpoints That Must Continue Working
| Endpoint | Current Behavior | Phase 1 Compatibility Strategy |
|----------|-----------------|-------------------------------|
| `POST /api/checkins` | Takes bandId, venueId, rating | Keep working via dual-write (look up/create event from band+venue+date) |
| `GET /api/checkins/feed` | Joins checkins with bands, venues | Keep working (old columns still exist during expand) |
| `GET /api/checkins/:id` | Returns band, venue, rating | Keep working, also return event data when available |
| `GET /api/events/upcoming` | Queries shows table | Rewrite to query events table |
| `GET /api/events/trending` | Queries shows table | Rewrite to query events table |
| `POST /api/events` | Creates show record | Rewrite to create event + lineup entry |
| `GET /api/events/:id` | Queries shows table | Rewrite to query events table with lineup |
| All review endpoints | Query reviews table | No changes (reviews untouched in Phase 1) |

## Open Questions

Things that couldn't be fully resolved:

1. **Was `migrate-events-model.ts` ever run on production?**
   - What we know: The script exists and creates an `events` table with `band_id` (wrong schema). The `EventService.ts` queries the `shows` table, not `events`, suggesting the migration may not have been applied to production, or it was applied but the code never switched to use it.
   - What's unclear: The actual production database state.
   - Recommendation: The first migration must handle BOTH cases (events table exists with old schema, or doesn't exist at all). Use conditional DDL.

2. **How much data exists in the production database?**
   - What we know: The app is deployed on Railway. Seed data exists for vibe_tags and badges. User data quantity is unknown.
   - What's unclear: Number of rows in shows, checkins, reviews tables.
   - Recommendation: The data migration should work for any size. For safety, test on a database dump before running on production.

3. **Should the old `shows` table be dropped in Phase 1 or deferred?**
   - What we know: The expand-contract pattern says to defer removal until all code paths are migrated.
   - What's unclear: Whether any mobile client code directly references shows-related endpoints.
   - Recommendation: Do NOT drop `shows` in Phase 1. Keep it as read-only through Phase 2. Drop in a future contract-only migration after verifying no code reads from it.

4. **node-pg-migrate v8 (stable) vs v9 (alpha)?**
   - What we know: v8.0.4 is the latest stable release. v9.0.0-alpha.6 is in alpha with Node 20.11+ requirement.
   - Recommendation: Use v8.0.4 (stable). The alpha has no critical features needed for this project.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `database-schema.sql` (591 lines, complete current schema)
- Existing codebase: `migrate-events-model.ts` (partial migration, documents what was attempted)
- Existing codebase: `EventService.ts`, `CheckinService.ts`, `BadgeService.ts` (current service layer)
- Existing codebase: `checkin.dart` (Flutter model, shows mobile is partially prepared)
- [node-pg-migrate official docs](https://salsita.github.io/node-pg-migrate/) - v8.0.4/v9.0.0-alpha.6 documentation
- [node-pg-migrate npm](https://www.npmjs.com/package/node-pg-migrate) - version and dependency info
- [PostgreSQL TIMESTAMPTZ docs](https://www.postgresql.org/docs/current/datatype-datetime.html) - timezone handling
- [PostgreSQL Don't Do This wiki](https://wiki.postgresql.org/wiki/Don't_Do_This) - timezone abbreviation warnings

### Secondary (MEDIUM confidence)
- [PlanetScale: Backward compatible database changes](https://planetscale.com/blog/backward-compatible-databases-changes) - expand-contract pattern guide
- [Xata: Zero-downtime schema migrations PostgreSQL](https://xata.io/blog/zero-downtime-schema-migrations-postgresql) - PostgreSQL-specific migration patterns
- [Pete Hodgson: Expand/Contract pattern](https://blog.thepete.net/blog/2023/12/05/expand/contract-making-a-breaking-change-without-a-big-bang/) - Pattern description with examples
- `.planning/research/ARCHITECTURE.md` - Prior domain research with schema design
- `.planning/research/PITFALLS.md` - Prior domain research identifying CRITICAL-1 and CRITICAL-2

### Tertiary (LOW confidence)
- node-pg-migrate v9 alpha features - alpha status means API could change

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - node-pg-migrate is well-established, 65+ dependents on npm, active maintenance
- Architecture: HIGH - expand-contract is a proven pattern, schema design verified against prior research
- Pitfalls: HIGH - all pitfalls directly observed in existing codebase or documented in prior research
- Migration ordering: HIGH - derived from foreign key dependencies (deterministic)
- Mobile readiness: HIGH - directly read from checkin.dart source

**Research date:** 2026-02-02
**Valid until:** 2026-04-02 (stable domain, 60-day validity)
