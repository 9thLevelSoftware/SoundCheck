import Database from '../config/database';
import { Band, CreateBandRequest, SearchQuery } from '../types';

export class BandService {
  private db = Database.getInstance();

  /**
   * Create a new band
   */
  async createBand(bandData: CreateBandRequest): Promise<Band> {
    const {
      name,
      description,
      genre,
      formedYear,
      websiteUrl,
      spotifyUrl,
      instagramUrl,
      facebookUrl,
      imageUrl,
      hometown,
    } = bandData;

    const query = `
      INSERT INTO bands (name, description, genre, formed_year, website_url, 
                        spotify_url, instagram_url, facebook_url, image_url, hometown)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, name, description, genre, formed_year, website_url, spotify_url,
                instagram_url, facebook_url, image_url, hometown, average_rating,
                total_reviews, is_active, claimed_by_user_id, created_at, updated_at
    `;

    const values = [
      name,
      description || null,
      genre || null,
      formedYear || null,
      websiteUrl || null,
      spotifyUrl || null,
      instagramUrl || null,
      facebookUrl || null,
      imageUrl || null,
      hometown || null,
    ];

    const result = await this.db.query(query, values);
    return this.mapDbBandToBand(result.rows[0]);
  }

  /**
   * Get band by ID
   */
  async getBandById(bandId: string): Promise<Band | null> {
    const query = `
      SELECT id, name, description, genre, formed_year, website_url, spotify_url,
             instagram_url, facebook_url, image_url, hometown, average_rating,
             total_reviews, is_active, claimed_by_user_id, created_at, updated_at
      FROM bands
      WHERE id = $1 AND is_active = true
    `;

    const result = await this.db.query(query, [bandId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDbBandToBand(result.rows[0]);
  }

  /**
   * Search bands with filters and pagination
   */
  async searchBands(searchQuery: SearchQuery): Promise<{
    bands: Band[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      q = '',
      genre,
      rating,
      page = 1,
      limit = 20,
      sort = 'name',
      order = 'asc',
    } = searchQuery;

    const offset = (page - 1) * limit;
    const conditions: string[] = ['is_active = true'];
    const values: any[] = [];
    let paramCount = 1;

    // PERF-016: Use tsvector full-text search instead of ILIKE on unnested
    // genres. The search_vector GIN index (migration 034) makes this O(1)
    // instead of O(n) ILIKE scans with unnest.
    if (q.trim()) {
      conditions.push(`(search_vector @@ websearch_to_tsquery('english', $${paramCount}) OR name ILIKE $${paramCount + 1})`);
      values.push(q.trim(), `%${q.trim()}%`);
      paramCount += 2;
    }

    // Genre filter (uses genres TEXT[] column)
    if (genre) {
      conditions.push(`$${paramCount} = ANY(genres)`);
      values.push(genre);
      paramCount++;
    }

    // Rating filter
    if (rating) {
      conditions.push(`average_rating >= $${paramCount}`);
      values.push(rating);
      paramCount++;
    }

    // Validate sort column
    const allowedSortColumns = ['name', 'genre', 'formed_year', 'hometown', 'average_rating', 'total_reviews', 'created_at'];
    const sortColumn = allowedSortColumns.includes(sort) ? sort : 'name';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM bands
      WHERE ${conditions.join(' AND ')}
    `;

    // Main query
    const mainQuery = `
      SELECT id, name, description, genre, formed_year, website_url, spotify_url,
             instagram_url, facebook_url, image_url, hometown, average_rating,
             total_reviews, is_active, claimed_by_user_id, created_at, updated_at
      FROM bands
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    values.push(limit, offset);

    const [countResult, bandsResult] = await Promise.all([
      this.db.query(countQuery, values.slice(0, -2)),
      this.db.query(mainQuery, values),
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);
    const bands = bandsResult.rows.map((row: any) => this.mapDbBandToBand(row));

    return {
      bands,
      total,
      page,
      totalPages,
    };
  }

  /**
   * Update band
   */
  async updateBand(bandId: string, updateData: Partial<CreateBandRequest>): Promise<Band> {
    const allowedFields = [
      'name', 'description', 'genre', 'formedYear', 'websiteUrl', 'spotifyUrl',
      'instagramUrl', 'facebookUrl', 'imageUrl', 'hometown'
    ];
    
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        const dbField = this.camelToSnakeCase(key);
        updates.push(`${dbField} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(bandId);
    const query = `
      UPDATE bands 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND is_active = true
      RETURNING id, name, description, genre, formed_year, website_url, spotify_url,
                instagram_url, facebook_url, image_url, hometown, average_rating,
                total_reviews, is_active, claimed_by_user_id, created_at, updated_at
    `;

    const result = await this.db.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('Band not found or inactive');
    }

    return this.mapDbBandToBand(result.rows[0]);
  }

  /**
   * Delete band (soft delete).
   * Also denies pending verification claims for this band (CFR-DI-007).
   */
  async deleteBand(bandId: string): Promise<void> {
    const query = `
      UPDATE bands
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await this.db.query(query, [bandId]);

    // CFR-DI-007: Deny pending verification claims for this band (entity deleted)
    await this.db.query(
      `UPDATE verification_claims SET status = 'denied', review_notes = 'entity_deleted', updated_at = CURRENT_TIMESTAMP
       WHERE entity_type = 'band' AND entity_id = $1 AND status = 'pending'`,
      [bandId]
    );
  }

  /**
   * Get popular bands (by average rating and rating count from checkin_band_ratings)
   */
  async getPopularBands(limit: number = 10): Promise<Band[]> {
    const query = `
      SELECT b.id, b.name, b.description, b.genre, b.formed_year, b.website_url, b.spotify_url,
             b.instagram_url, b.facebook_url, b.image_url, b.hometown, b.average_rating,
             COALESCE(rc.rating_count, 0) AS total_reviews,
             b.is_active, b.claimed_by_user_id, b.created_at, b.updated_at
      FROM bands b
      LEFT JOIN (
        SELECT band_id, COUNT(*)::int AS rating_count
        FROM checkin_band_ratings
        GROUP BY band_id
      ) rc ON rc.band_id = b.id
      WHERE b.is_active = true AND COALESCE(rc.rating_count, 0) >= 3
      ORDER BY (b.average_rating * 0.7 + LEAST(COALESCE(rc.rating_count, 0)/50.0, 1.0) * 0.3) DESC
      LIMIT $1
    `;

    const result = await this.db.query(query, [limit]);
    return result.rows.map((row: any) => this.mapDbBandToBand(row));
  }

  /**
   * Get bands by genre
   */
  async getBandsByGenre(genre: string, limit: number = 20): Promise<Band[]> {
    const query = `
      SELECT id, name, description, genre, formed_year, website_url, spotify_url,
             instagram_url, facebook_url, image_url, hometown, average_rating,
             total_reviews, is_active, claimed_by_user_id, created_at, updated_at
      FROM bands
      WHERE is_active = true AND $1 = ANY(genres)
      ORDER BY average_rating DESC, total_checkins DESC
      LIMIT $2
    `;

    const result = await this.db.query(query, [genre, limit]);
    return result.rows.map((row: any) => this.mapDbBandToBand(row));
  }

  /**
   * Get trending bands (recently added with good ratings)
   */
  async getTrendingBands(limit: number = 10): Promise<Band[]> {
    const query = `
      SELECT b.id, b.name, b.description, b.genre, b.formed_year, b.website_url, b.spotify_url,
             b.instagram_url, b.facebook_url, b.image_url, b.hometown, b.average_rating,
             COALESCE(rc.rating_count, 0) AS total_reviews,
             b.is_active, b.claimed_by_user_id, b.created_at, b.updated_at
      FROM bands b
      LEFT JOIN (
        SELECT band_id, COUNT(*)::int AS rating_count
        FROM checkin_band_ratings
        GROUP BY band_id
      ) rc ON rc.band_id = b.id
      WHERE b.is_active = true
        AND b.created_at >= CURRENT_DATE - INTERVAL '30 days'
        AND (COALESCE(rc.rating_count, 0) = 0 OR b.average_rating >= 3.5)
      ORDER BY b.created_at DESC, b.average_rating DESC
      LIMIT $1
    `;

    const result = await this.db.query(query, [limit]);
    return result.rows.map((row: any) => this.mapDbBandToBand(row));
  }

  /**
   * Get all unique genres
   */
  async getGenres(): Promise<string[]> {
    const query = `
      SELECT DISTINCT genre
      FROM bands
      WHERE is_active = true AND genre IS NOT NULL AND genre != ''
      ORDER BY genre
    `;

    const result = await this.db.query(query);
    return result.rows.map((row: any) => row.genre);
  }

  /**
   * Update band rating after review
   */
  async updateBandRating(bandId: string): Promise<void> {
    const query = `
      UPDATE bands
      SET
        average_rating = (
          SELECT COALESCE(AVG(rating::numeric), 0)
          FROM checkin_band_ratings
          WHERE band_id = $1
        ),
        total_reviews = (
          SELECT COUNT(*)
          FROM checkin_band_ratings
          WHERE band_id = $1
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await this.db.query(query, [bandId]);
  }

  /**
   * Check if a user is the claimed owner of a band.
   */
  async isClaimedOwner(bandId: string, userId: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM bands WHERE id = $1 AND claimed_by_user_id = $2',
      [bandId, userId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get aggregate stats for a claimed band owner.
   * Returns check-in totals, average rating, unique fans, recent events, and top venues.
   */
  async getBandStats(bandId: string): Promise<{
    totalCheckins: number;
    averageRating: number;
    uniqueFans: number;
    recentEventsCount: number;
    topVenues: Array<{ venueId: string; venueName: string; checkinCount: number }>;
  }> {
    // Total check-ins to events featuring this band
    const checkinsResult = await this.db.query(
      `SELECT COUNT(c.id) AS total_checkins,
              COUNT(DISTINCT c.user_id) AS unique_fans
       FROM checkins c
       JOIN events e ON c.event_id = e.id
       JOIN event_lineup el ON el.event_id = e.id
       WHERE el.band_id = $1`,
      [bandId]
    );

    // Average rating from checkin band ratings
    const ratingResult = await this.db.query(
      `SELECT COALESCE(AVG(rating)::numeric(3,2), 0) AS avg_rating
       FROM checkin_band_ratings WHERE band_id = $1`,
      [bandId]
    );

    // Recent events count (last 90 days)
    const recentEventsResult = await this.db.query(
      `SELECT COUNT(DISTINCT e.id) AS recent_events
       FROM events e
       JOIN event_lineup el ON el.event_id = e.id
       WHERE el.band_id = $1 AND e.event_date >= CURRENT_DATE - INTERVAL '90 days'`,
      [bandId]
    );

    // Top venues by checkin count
    const topVenuesResult = await this.db.query(
      `SELECT v.id AS venue_id, v.name AS venue_name, COUNT(c.id) AS checkin_count
       FROM checkins c
       JOIN events e ON c.event_id = e.id
       JOIN event_lineup el ON el.event_id = e.id
       JOIN venues v ON e.venue_id = v.id
       WHERE el.band_id = $1
       GROUP BY v.id, v.name
       ORDER BY checkin_count DESC
       LIMIT 5`,
      [bandId]
    );

    const row = checkinsResult.rows[0];
    return {
      totalCheckins: parseInt(row.total_checkins || '0'),
      averageRating: parseFloat(ratingResult.rows[0].avg_rating || '0'),
      uniqueFans: parseInt(row.unique_fans || '0'),
      recentEventsCount: parseInt(recentEventsResult.rows[0].recent_events || '0'),
      topVenues: topVenuesResult.rows.map((r: any) => ({
        venueId: r.venue_id,
        venueName: r.venue_name,
        checkinCount: parseInt(r.checkin_count),
      })),
    };
  }

  /**
   * Map database band row to Band type
   */
  private mapDbBandToBand(row: any): Band {
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
      claimedByUserId: row.claimed_by_user_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Convert camelCase to snake_case
   */
  private camelToSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}