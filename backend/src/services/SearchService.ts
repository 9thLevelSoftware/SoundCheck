import Database from '../config/database';
import { Band, Venue, Event, SearchResults, SearchUserResult } from '../types';
import { EventService } from './EventService';

/**
 * SearchService: Unified full-text search across bands, venues, and events.
 *
 * Primary: PostgreSQL tsvector full-text search using websearch_to_tsquery.
 * Fallback: pg_trgm fuzzy matching (similarity > 0.3) for typo tolerance.
 *
 * The tsvector columns and GIN indexes were created in migration 034.
 * The pg_trgm extension was enabled for fuzzy matching.
 *
 * Phase 11 Plan 03: SCALE-01 (O(1) indexed search replaces O(n) ILIKE scans)
 */
export class SearchService {
  private db = Database.getInstance();
  private eventService = new EventService();

  /**
   * Unified search across bands, venues, and events.
   *
   * @param query - Search query string
   * @param options - Optional filters for entity types and result limit
   * @returns Categorized search results
   */
  async search(
    query: string,
    options?: { types?: ('band' | 'venue' | 'event' | 'user')[]; limit?: number }
  ): Promise<SearchResults> {
    const types = options?.types ?? ['band', 'venue', 'event'];
    const limit = Math.min(options?.limit ?? 10, 50);

    const [bands, venues, events, users] = await Promise.all([
      types.includes('band') ? this.searchBands(query, limit) : [],
      types.includes('venue') ? this.searchVenues(query, limit) : [],
      types.includes('event') ? this.searchEvents(query, limit) : [],
      types.includes('user') ? this.searchUsers(query, limit) : [],
    ]);

    const result: SearchResults = { bands, venues, events };
    if (types.includes('user')) {
      result.users = users;
    }
    return result;
  }

  /**
   * Search bands using tsvector full-text search with pg_trgm fuzzy fallback.
   * FTS results come first (ranked by ts_rank), then fuzzy results fill remaining slots.
   */
  private async searchBands(query: string, limit: number): Promise<Band[]> {
    const sql = `
      WITH fts_results AS (
        SELECT id, name, genre, genres, hometown, description, image_url, is_active,
          formed_year, website_url, spotify_url, instagram_url, facebook_url,
          average_rating, total_reviews, created_at, updated_at,
          ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS rank
        FROM bands
        WHERE search_vector @@ websearch_to_tsquery('english', $1)
          AND is_active = TRUE
        ORDER BY rank DESC
        LIMIT $2
      ),
      fuzzy_results AS (
        SELECT id, name, genre, genres, hometown, description, image_url, is_active,
          formed_year, website_url, spotify_url, instagram_url, facebook_url,
          average_rating, total_reviews, created_at, updated_at,
          similarity(name, $1) AS rank
        FROM bands
        WHERE similarity(name, $1) > 0.3
          AND is_active = TRUE
          AND id NOT IN (SELECT id FROM fts_results)
        ORDER BY rank DESC
        LIMIT $2
      )
      SELECT * FROM fts_results
      UNION ALL
      SELECT * FROM fuzzy_results
      LIMIT $2
    `;

    const result = await this.db.query(sql, [query, limit]);
    return result.rows.map((row: any) => this.mapBand(row));
  }

  /**
   * Search venues using tsvector full-text search with pg_trgm fuzzy fallback.
   */
  private async searchVenues(query: string, limit: number): Promise<Venue[]> {
    const sql = `
      WITH fts_results AS (
        SELECT id, name, description, address, city, state, country, postal_code,
          latitude, longitude, website_url, phone, email, capacity, venue_type,
          image_url, average_rating, total_reviews, is_active, created_at, updated_at,
          ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS rank
        FROM venues
        WHERE search_vector @@ websearch_to_tsquery('english', $1)
          AND is_active = TRUE
        ORDER BY rank DESC
        LIMIT $2
      ),
      fuzzy_results AS (
        SELECT id, name, description, address, city, state, country, postal_code,
          latitude, longitude, website_url, phone, email, capacity, venue_type,
          image_url, average_rating, total_reviews, is_active, created_at, updated_at,
          similarity(name, $1) AS rank
        FROM venues
        WHERE similarity(name, $1) > 0.3
          AND is_active = TRUE
          AND id NOT IN (SELECT id FROM fts_results)
        ORDER BY rank DESC
        LIMIT $2
      )
      SELECT * FROM fts_results
      UNION ALL
      SELECT * FROM fuzzy_results
      LIMIT $2
    `;

    const result = await this.db.query(sql, [query, limit]);
    return result.rows.map((row: any) => this.mapVenue(row));
  }

  /**
   * Search events using tsvector full-text search with pg_trgm fuzzy fallback.
   * Only searches upcoming events. Joins venues for venue info.
   * Fuzzy fallback matches on event_name OR venue name.
   */
  private async searchEvents(query: string, limit: number): Promise<Event[]> {
    const sql = `
      WITH fts_results AS (
        SELECT e.id
        FROM events e
        WHERE e.search_vector @@ websearch_to_tsquery('english', $1)
          AND e.event_date >= CURRENT_DATE
          AND e.is_cancelled = FALSE
        ORDER BY ts_rank(e.search_vector, websearch_to_tsquery('english', $1)) DESC
        LIMIT $2
      ),
      fuzzy_results AS (
        SELECT e.id
        FROM events e
        JOIN venues v ON e.venue_id = v.id
        WHERE (similarity(COALESCE(e.event_name, ''), $1) > 0.3
               OR similarity(v.name, $1) > 0.3)
          AND e.event_date >= CURRENT_DATE
          AND e.is_cancelled = FALSE
          AND e.id NOT IN (SELECT id FROM fts_results)
        ORDER BY GREATEST(
          similarity(COALESCE(e.event_name, ''), $1),
          similarity(v.name, $1)
        ) DESC
        LIMIT $2
      ),
      matched_ids AS (
        SELECT id FROM fts_results
        UNION ALL
        SELECT id FROM fuzzy_results
        LIMIT $2
      )
      SELECT e.*,
        v.id as v_id, v.name as venue_name, v.city as venue_city,
        v.state as venue_state, v.image_url as venue_image,
        (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id AND c.is_hidden IS NOT TRUE) as checkin_count
      FROM events e
      JOIN venues v ON e.venue_id = v.id
      WHERE e.id IN (SELECT id FROM matched_ids)
      ORDER BY e.event_date ASC
    `;

    const result = await this.db.query(sql, [query, limit]);

    if (result.rows.length === 0) return [];

    // Hydrate with lineup data using EventService helper
    return this.eventService.mapDbEventsWithHeadliner(result.rows);
  }

  /**
   * Search users using ILIKE on username, first_name, last_name.
   * Exact username matches rank first, then prefix matches, then partial matches.
   */
  private async searchUsers(query: string, limit: number): Promise<SearchUserResult[]> {
    const searchTerm = `%${query.toLowerCase()}%`;
    const exactTerm = query.toLowerCase();
    const prefixTerm = `${query.toLowerCase()}%`;

    const sql = `
      SELECT u.id, u.username, u.first_name, u.last_name,
        u.profile_image_url, u.bio, u.is_verified,
        (SELECT COUNT(*)::int FROM checkins WHERE user_id = u.id) AS total_checkins
      FROM users u
      WHERE u.is_active = true
        AND (LOWER(u.username) LIKE $1
             OR LOWER(u.first_name) LIKE $1
             OR LOWER(u.last_name) LIKE $1
             OR LOWER(COALESCE(u.first_name || ' ' || u.last_name, '')) LIKE $1)
      ORDER BY
        CASE WHEN LOWER(u.username) = $3 THEN 0
             WHEN LOWER(u.username) LIKE $4 THEN 1
             ELSE 2 END,
        total_checkins DESC
      LIMIT $2
    `;

    const result = await this.db.query(sql, [searchTerm, limit, exactTerm, prefixTerm]);

    return result.rows.map((row: any) => ({
      id: row.id,
      username: row.username,
      displayName: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.username,
      profileImageUrl: row.profile_image_url || null,
      bio: row.bio || null,
      totalCheckins: row.total_checkins || 0,
      isVerified: row.is_verified === true,
    }));
  }

  /**
   * Map a database band row to the Band interface.
   */
  private mapBand(row: any): Band {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      genre: row.genre,
      formedYear: row.formed_year,
      websiteUrl: row.website_url,
      spotifyUrl: row.spotify_url,
      instagramUrl: row.instagram_url,
      facebookUrl: row.facebook_url,
      imageUrl: row.image_url,
      hometown: row.hometown,
      averageRating: parseFloat(row.average_rating || 0),
      totalReviews: parseInt(row.total_reviews || 0),
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map a database venue row to the Venue interface.
   */
  private mapVenue(row: any): Venue {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      address: row.address,
      city: row.city,
      state: row.state,
      country: row.country,
      postalCode: row.postal_code,
      latitude: row.latitude ? parseFloat(row.latitude) : undefined,
      longitude: row.longitude ? parseFloat(row.longitude) : undefined,
      websiteUrl: row.website_url,
      phone: row.phone,
      email: row.email,
      capacity: row.capacity,
      venueType: row.venue_type,
      imageUrl: row.image_url,
      coverImageUrl: row.cover_image_url || null,
      averageRating: parseFloat(row.average_rating || 0),
      totalReviews: parseInt(row.total_reviews || 0),
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
