/**
 * Band and Venue Entity Matcher
 *
 * Resolves Ticketmaster attraction names to existing band records using a
 * 4-step matching cascade:
 *   1. External ID match (most reliable -- same Ticketmaster attraction)
 *   2. Exact case-insensitive name match
 *   3. Fuzzy match via pg_trgm similarity (threshold >= 0.8)
 *   4. Create new band record
 *
 * Also handles venue resolution via external ID upsert or name+city fallback.
 *
 * Named BandMatcher (not EntityMatcher) because band matching is the primary
 * and most complex use case. Venue matching is included for convenience since
 * both are needed during event ingestion.
 */

import Database from '../config/database';
import { NormalizedEvent } from '../types/ticketmaster';

export interface BandMatchResult {
  bandId: string;
  matchType: 'external_id' | 'exact' | 'fuzzy' | 'created';
  score?: number;
}

export interface VenueMatchResult {
  venueId: string;
  isNew: boolean;
}

export class BandMatcher {
  private db = Database.getInstance();

  /**
   * Match a Ticketmaster attraction to an existing band, or create a new one.
   *
   * Matching cascade:
   *   1. External ID (Ticketmaster attraction ID)
   *   2. Exact case-insensitive name match
   *   3. Fuzzy match with pg_trgm (similarity >= 0.8)
   *   4. Create new band record
   *
   * When a match is found in steps 2-3 and an externalId is provided,
   * the band's external_id and source are updated (only if currently NULL)
   * to enable faster matching on future syncs.
   */
  async matchOrCreateBand(
    name: string,
    externalId?: string,
    genre?: string,
    imageUrl?: string,
  ): Promise<BandMatchResult> {
    // Step 1: Match by external_id (most reliable)
    if (externalId) {
      const extMatch = await this.db.query(
        `SELECT id FROM bands WHERE source = 'ticketmaster' AND external_id = $1`,
        [externalId],
      );
      if (extMatch.rows.length > 0) {
        return { bandId: extMatch.rows[0].id, matchType: 'external_id' };
      }
    }

    // Step 2: Exact case-insensitive name match
    const exactMatch = await this.db.query(
      `SELECT id FROM bands WHERE LOWER(name) = LOWER($1) AND is_active = true LIMIT 1`,
      [name],
    );
    if (exactMatch.rows.length > 0) {
      const bandId = exactMatch.rows[0].id;
      // Backfill external_id if we have one and band doesn't yet
      if (externalId) {
        await this.db.query(
          `UPDATE bands SET external_id = $1, source = 'ticketmaster' WHERE id = $2 AND external_id IS NULL`,
          [externalId, bandId],
        );
      }
      return { bandId, matchType: 'exact' };
    }

    // Step 3: Fuzzy match with pg_trgm (conservative threshold)
    const fuzzyMatch = await this.db.query(
      `SELECT id, name, similarity(LOWER(name), LOWER($1)) AS score
       FROM bands
       WHERE LOWER(name) % LOWER($1)
         AND similarity(LOWER(name), LOWER($1)) >= 0.8
         AND is_active = true
       ORDER BY score DESC
       LIMIT 1`,
      [name],
    );
    if (fuzzyMatch.rows.length > 0) {
      const bandId = fuzzyMatch.rows[0].id;
      // Backfill external_id if we have one and band doesn't yet
      if (externalId) {
        await this.db.query(
          `UPDATE bands SET external_id = $1, source = 'ticketmaster' WHERE id = $2 AND external_id IS NULL`,
          [externalId, bandId],
        );
      }
      return {
        bandId,
        matchType: 'fuzzy',
        score: parseFloat(fuzzyMatch.rows[0].score),
      };
    }

    // Step 4: No match -- create new band record
    const newBand = await this.db.query(
      `INSERT INTO bands (name, genre, image_url, source, external_id)
       VALUES ($1, $2, $3, 'ticketmaster', $4)
       RETURNING id`,
      [name, genre || null, imageUrl || null, externalId || null],
    );
    return { bandId: newBand.rows[0].id, matchType: 'created' };
  }

  /**
   * Match a Ticketmaster venue to an existing venue, or create/update one.
   *
   * Matching strategy:
   *   1. If externalId provided: upsert via ON CONFLICT on (source, external_id)
   *   2. If no externalId: fall back to name+city case-insensitive match
   *   3. If no match: insert new venue
   *
   * The upsert updates name, address, lat, lon on conflict to keep data fresh.
   * Uses (xmax = 0) to detect whether the row was inserted or updated.
   */
  async matchOrCreateVenue(
    tmVenue: NormalizedEvent['venue'],
  ): Promise<VenueMatchResult> {
    // Step 1: If we have an external ID, use upsert
    if (tmVenue.externalId) {
      const result = await this.db.query(
        `INSERT INTO venues (
          name, address, city, state, country, postal_code,
          latitude, longitude, timezone, source, external_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ticketmaster', $10)
        ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL
        DO UPDATE SET
          name = EXCLUDED.name,
          address = COALESCE(EXCLUDED.address, venues.address),
          latitude = COALESCE(EXCLUDED.latitude, venues.latitude),
          longitude = COALESCE(EXCLUDED.longitude, venues.longitude),
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, (xmax = 0) AS is_new`,
        [
          tmVenue.name,
          tmVenue.address,
          tmVenue.city,
          tmVenue.state,
          tmVenue.country,
          tmVenue.postalCode,
          tmVenue.lat,
          tmVenue.lon,
          tmVenue.timezone,
          tmVenue.externalId,
        ],
      );
      return {
        venueId: result.rows[0].id,
        isNew: result.rows[0].is_new,
      };
    }

    // Step 2: No external ID -- try name+city match
    const nameMatch = await this.db.query(
      `SELECT id FROM venues
       WHERE LOWER(name) = LOWER($1) AND LOWER(city) = LOWER($2)
       AND is_active = true
       LIMIT 1`,
      [tmVenue.name, tmVenue.city],
    );
    if (nameMatch.rows.length > 0) {
      return { venueId: nameMatch.rows[0].id, isNew: false };
    }

    // Step 3: No match -- create new venue
    const newVenue = await this.db.query(
      `INSERT INTO venues (
        name, address, city, state, country, postal_code,
        latitude, longitude, timezone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        tmVenue.name,
        tmVenue.address,
        tmVenue.city,
        tmVenue.state,
        tmVenue.country,
        tmVenue.postalCode,
        tmVenue.lat,
        tmVenue.lon,
        tmVenue.timezone,
      ],
    );
    return { venueId: newVenue.rows[0].id, isNew: true };
  }
}
