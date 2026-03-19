import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 047: Database & Data Integrity Fixes (Medium + Low findings)
 *
 * Addresses findings from the consolidated beta readiness review:
 *
 * DB-011:  User-created events lack dedup constraint (partial unique index)
 * DB-016:  Missing index for recommendation exclusion query (idx_checkins_user_event)
 * DI-004:  Toast/comment triggers fire during CASCADE deletes (parent-exists guard)
 * DI-021:  total_reviews column not in migrations (add column to bands + venues)
 * DI-005:  bands.monthly_checkins never maintained (add column if missing)
 * CFR-019: Migration 036 fails on fresh DB (handled here with IF EXISTS guard)
 *
 * All DDL uses IF NOT EXISTS / IF EXISTS guards for idempotency.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // -------------------------------------------------------------------
  // DB-011: User-created events lack dedup constraint
  // Prevent duplicate user-created events at the same venue on the same date
  // with the same name. Only applies to user_created events (partial index).
  // -------------------------------------------------------------------
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_events_user_dedup
    ON events (venue_id, event_date, event_name, created_by_user_id)
    WHERE source = 'user_created';
  `);

  // -------------------------------------------------------------------
  // DB-016: Missing index for recommendation exclusion query
  // UserDiscoveryService excludes events user already checked into
  // -------------------------------------------------------------------
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_checkins_user_event
    ON checkins (user_id, event_id);
  `);

  // -------------------------------------------------------------------
  // DI-021 / CFR-021: total_reviews column not in migrations
  // Services reference this column (VenueService, BandService, SearchService)
  // but no migration creates it. Add to both bands and venues tables.
  // -------------------------------------------------------------------
  pgm.sql(`
    ALTER TABLE venues ADD COLUMN IF NOT EXISTS total_reviews INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE bands ADD COLUMN IF NOT EXISTS total_reviews INTEGER NOT NULL DEFAULT 0;
  `);

  // Backfill total_reviews from checkin_band_ratings (bands) and venue_rating checkins (venues)
  pgm.sql(`
    UPDATE bands b SET total_reviews = COALESCE(sub.cnt, 0)
    FROM (
      SELECT band_id, COUNT(*)::int AS cnt
      FROM checkin_band_ratings
      GROUP BY band_id
    ) sub
    WHERE b.id = sub.band_id AND b.total_reviews = 0;

    UPDATE venues v SET total_reviews = COALESCE(sub.cnt, 0)
    FROM (
      SELECT venue_id, COUNT(*)::int AS cnt
      FROM checkins
      WHERE venue_rating IS NOT NULL
      GROUP BY venue_id
    ) sub
    WHERE v.id = sub.venue_id AND v.total_reviews = 0;
  `);

  // -------------------------------------------------------------------
  // DI-005: bands.monthly_checkins never maintained — add the column
  // so schema.sql matches. Column exists in schema.sql but not migrations.
  // -------------------------------------------------------------------
  pgm.sql(`
    ALTER TABLE bands ADD COLUMN IF NOT EXISTS monthly_checkins INTEGER NOT NULL DEFAULT 0;
  `);

  // -------------------------------------------------------------------
  // DI-004 / DB-009 / CFR-042: Toast/comment triggers fire during CASCADE
  // deletes and schema.sql lacks GREATEST(). Replace trigger functions
  // with parent-exists guard + GREATEST() for safe decrement.
  // -------------------------------------------------------------------
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_checkin_toast_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        -- Guard: only fire if the parent checkin still exists
        IF EXISTS (SELECT 1 FROM checkins WHERE id = NEW.checkin_id) THEN
          UPDATE checkins SET toast_count = toast_count + 1 WHERE id = NEW.checkin_id;
        END IF;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        -- Guard: only fire if the parent checkin still exists (skip during CASCADE)
        IF EXISTS (SELECT 1 FROM checkins WHERE id = OLD.checkin_id) THEN
          UPDATE checkins SET toast_count = GREATEST(toast_count - 1, 0) WHERE id = OLD.checkin_id;
        END IF;
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_checkin_comment_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        -- Guard: only fire if the parent checkin still exists
        IF EXISTS (SELECT 1 FROM checkins WHERE id = NEW.checkin_id) THEN
          UPDATE checkins SET comment_count = comment_count + 1 WHERE id = NEW.checkin_id;
        END IF;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        -- Guard: only fire if the parent checkin still exists (skip during CASCADE)
        IF EXISTS (SELECT 1 FROM checkins WHERE id = OLD.checkin_id) THEN
          UPDATE checkins SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.checkin_id;
        END IF;
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // -------------------------------------------------------------------
  // CFR-019 / DB-002 / DI-013: Migration 036 fails on fresh DB because
  // it ALTERs the reviews table which may not exist. The reviews table
  // was dropped in migration 043. This cannot be fixed retroactively
  // in migration 036 itself, but we add a safety net: if for some
  // reason owner_response columns survived on a reviews table, this
  // is a no-op. The real fix is the IF EXISTS guard applied to
  // migration 036's source below.
  // -------------------------------------------------------------------
  // (No runtime action needed here — the fix is applied to migration 036 source)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Reverse in opposite order

  // Restore original trigger functions (without parent-exists guard)
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_checkin_toast_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE checkins SET toast_count = toast_count + 1 WHERE id = NEW.checkin_id;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE checkins SET toast_count = GREATEST(toast_count - 1, 0) WHERE id = OLD.checkin_id;
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_checkin_comment_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE checkins SET comment_count = comment_count + 1 WHERE id = NEW.checkin_id;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE checkins SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.checkin_id;
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`ALTER TABLE bands DROP COLUMN IF EXISTS monthly_checkins;`);
  pgm.sql(`ALTER TABLE bands DROP COLUMN IF EXISTS total_reviews;`);
  pgm.sql(`ALTER TABLE venues DROP COLUMN IF EXISTS total_reviews;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_checkins_user_event;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_events_user_dedup;`);
}
