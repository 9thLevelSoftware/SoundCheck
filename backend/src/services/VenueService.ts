import Database from '../config/database';
import { Venue, CreateVenueRequest, SearchQuery } from '../types';

export class VenueService {
  private db = Database.getInstance();

  /**
   * Create a new venue
   */
  async createVenue(venueData: CreateVenueRequest): Promise<Venue> {
    const {
      name,
      description,
      address,
      city,
      state,
      country,
      postalCode,
      latitude,
      longitude,
      websiteUrl,
      phone,
      email,
      capacity,
      venueType,
      imageUrl,
    } = venueData;

    const query = `
      INSERT INTO venues (name, description, address, city, state, country, postal_code,
                         latitude, longitude, website_url, phone, email, capacity, 
                         venue_type, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, name, description, address, city, state, country, postal_code,
                latitude, longitude, website_url, phone, email, capacity, venue_type,
                image_url, average_rating, total_checkins, is_active, claimed_by_user_id,
                created_at, updated_at
    `;

    const values = [
      name,
      description || null,
      address || null,
      city || null,
      state || null,
      country || null,
      postalCode || null,
      latitude || null,
      longitude || null,
      websiteUrl || null,
      phone || null,
      email || null,
      capacity || null,
      venueType || null,
      imageUrl || null,
    ];

    const result = await this.db.query(query, values);
    return this.mapDbVenueToVenue(result.rows[0]);
  }

  /**
   * Get venue by ID
   */
  async getVenueById(venueId: string): Promise<Venue | null> {
    const query = `
      SELECT id, name, description, address, city, state, country, postal_code,
             latitude, longitude, website_url, phone, email, capacity, venue_type,
             image_url, average_rating, total_checkins, is_active, claimed_by_user_id,
             created_at, updated_at
      FROM venues
      WHERE id = $1 AND is_active = true
    `;

    const result = await this.db.query(query, [venueId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDbVenueToVenue(result.rows[0]);
  }

  /**
   * Search venues with filters and pagination
   */
  async searchVenues(searchQuery: SearchQuery): Promise<{
    venues: Venue[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      q = '',
      city,
      venueType,
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

    // Text search
    if (q.trim()) {
      conditions.push(`(name ILIKE $${paramCount} OR description ILIKE $${paramCount} OR city ILIKE $${paramCount})`);
      values.push(`%${q.trim()}%`);
      paramCount++;
    }

    // City filter
    if (city) {
      conditions.push(`city ILIKE $${paramCount}`);
      values.push(`%${city}%`);
      paramCount++;
    }

    // Venue type filter
    if (venueType) {
      conditions.push(`venue_type = $${paramCount}`);
      values.push(venueType);
      paramCount++;
    }

    // Rating filter
    if (rating) {
      conditions.push(`average_rating >= $${paramCount}`);
      values.push(rating);
      paramCount++;
    }

    // Validate sort column
    const allowedSortColumns = ['name', 'city', 'average_rating', 'total_checkins', 'capacity', 'created_at'];
    const sortColumn = allowedSortColumns.includes(sort) ? sort : 'name';
    const sortOrder = order === 'desc' ? 'DESC' : 'ASC';

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM venues
      WHERE ${conditions.join(' AND ')}
    `;

    // Main query
    const mainQuery = `
      SELECT id, name, description, address, city, state, country, postal_code,
             latitude, longitude, website_url, phone, email, capacity, venue_type,
             image_url, average_rating, total_checkins, is_active, claimed_by_user_id,
             created_at, updated_at
      FROM venues
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    values.push(limit, offset);

    const [countResult, venuesResult] = await Promise.all([
      this.db.query(countQuery, values.slice(0, -2)),
      this.db.query(mainQuery, values),
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);
    const venues = venuesResult.rows.map((row: any) => this.mapDbVenueToVenue(row));

    return {
      venues,
      total,
      page,
      totalPages,
    };
  }

  /**
   * Update venue
   */
  async updateVenue(venueId: string, updateData: Partial<CreateVenueRequest>): Promise<Venue> {
    const allowedFields = [
      'name', 'description', 'address', 'city', 'state', 'country', 'postalCode',
      'latitude', 'longitude', 'websiteUrl', 'phone', 'email', 'capacity', 
      'venueType', 'imageUrl'
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

    values.push(venueId);
    const query = `
      UPDATE venues 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND is_active = true
      RETURNING id, name, description, address, city, state, country, postal_code,
                latitude, longitude, website_url, phone, email, capacity, venue_type,
                image_url, average_rating, total_checkins, is_active, claimed_by_user_id,
                created_at, updated_at
    `;

    const result = await this.db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Venue not found or inactive');
    }

    return this.mapDbVenueToVenue(result.rows[0]);
  }

  /**
   * Delete venue (soft delete).
   * Also invalidates pending verification claims and resolves pending reports (CFR-DI-007, CFR-DI-008).
   */
  async deleteVenue(venueId: string): Promise<void> {
    const query = `
      UPDATE venues
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await this.db.query(query, [venueId]);

    // CFR-DI-007: Deny pending verification claims for this venue (entity deleted)
    await this.db.query(
      `UPDATE verification_claims SET status = 'denied', review_notes = 'entity_deleted', updated_at = CURRENT_TIMESTAMP
       WHERE entity_type = 'venue' AND entity_id = $1 AND status = 'pending'`,
      [venueId]
    );

    // Note: reports table uses content_type_enum ('checkin','comment','photo','user')
    // and does not include 'venue', so no report cleanup is needed here.
  }

  /**
   * Get popular venues (by average rating and review count)
   */
  async getPopularVenues(limit: number = 10): Promise<Venue[]> {
    const query = `
      SELECT id, name, description, address, city, state, country, postal_code,
             latitude, longitude, website_url, phone, email, capacity, venue_type,
             image_url, average_rating, total_checkins, is_active, claimed_by_user_id,
             created_at, updated_at
      FROM venues
      WHERE is_active = true AND total_checkins >= 5
      ORDER BY (average_rating * 0.7 + LEAST(total_checkins/100.0, 1.0) * 0.3) DESC
      LIMIT $1
    `;

    const result = await this.db.query(query, [limit]);
    return result.rows.map((row: any) => this.mapDbVenueToVenue(row));
  }

  /**
   * Get venues near coordinates
   *
   * DB-018/CFR-023: Uses bounding-box pre-filter on lat/lon range before
   * computing the expensive Haversine formula. This allows PostgreSQL to
   * use the idx_venues_location index to eliminate most rows cheaply
   * before the trig-heavy distance calculation runs on the remainder.
   */
  async getVenuesNear(
    latitude: number,
    longitude: number,
    radiusKm: number = 50,
    limit: number = 20
  ): Promise<Venue[]> {
    // Approximate degrees per km at the given latitude for bounding box.
    // 1 degree latitude ~= 111 km everywhere.
    // 1 degree longitude ~= 111 * cos(lat) km (shrinks toward poles).
    const latDelta = radiusKm / 111.0;
    const lonDelta = radiusKm / (111.0 * Math.cos((latitude * Math.PI) / 180));

    const query = `
      SELECT * FROM (
        SELECT id, name, description, address, city, state, country, postal_code,
               latitude, longitude, website_url, phone, email, capacity, venue_type,
               image_url, average_rating, total_checkins, is_active, claimed_by_user_id,
               created_at, updated_at,
               (6371 * acos(LEAST(GREATEST(
                cos(radians($1)) * cos(radians(latitude)) *
                cos(radians(longitude) - radians($2)) +
                sin(radians($1)) * sin(radians(latitude)), -1), 1))) AS distance
        FROM venues
        WHERE is_active = true
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND latitude BETWEEN $5 AND $6
          AND longitude BETWEEN $7 AND $8
      ) AS venues_with_distance
      WHERE distance <= $3
      ORDER BY distance
      LIMIT $4
    `;

    const result = await this.db.query(query, [
      latitude,
      longitude,
      radiusKm,
      limit,
      latitude - latDelta,
      latitude + latDelta,
      longitude - lonDelta,
      longitude + lonDelta,
    ]);
    return result.rows.map((row: any) => this.mapDbVenueToVenue(row));
  }

  /**
   * Update venue rating after review
   */
  async updateVenueRating(venueId: string): Promise<void> {
    const query = `
      UPDATE venues
      SET
        average_rating = (
          SELECT COALESCE(AVG(venue_rating::numeric), 0)
          FROM checkins
          WHERE venue_id = $1 AND venue_rating IS NOT NULL
        ),
        total_checkins = (
          SELECT COUNT(*)
          FROM checkins
          WHERE venue_id = $1 AND venue_rating IS NOT NULL
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;

    await this.db.query(query, [venueId]);
  }

  /**
   * Check if a user is the claimed owner of a venue.
   */
  async isClaimedOwner(venueId: string, userId: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM venues WHERE id = $1 AND claimed_by_user_id = $2',
      [venueId, userId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get aggregate stats for a claimed venue owner.
   * Returns check-in totals, average rating, unique visitors, upcoming events, and popular genres.
   */
  async getVenueStats(venueId: string): Promise<{
    totalCheckins: number;
    averageRating: number;
    uniqueVisitors: number;
    upcomingEventsCount: number;
    popularGenres: Array<{ genre: string; count: number }>;
  }> {
    // Total check-ins and unique visitors
    const checkinsResult = await this.db.query(
      `SELECT COUNT(c.id) AS total_checkins,
              COUNT(DISTINCT c.user_id) AS unique_visitors
       FROM checkins c
       JOIN events e ON c.event_id = e.id
       WHERE e.venue_id = $1`,
      [venueId]
    );

    // Average rating from checkins
    const ratingResult = await this.db.query(
      `SELECT COALESCE(AVG(venue_rating)::numeric(3,2), 0) AS avg_rating
       FROM checkins WHERE venue_id = $1 AND venue_rating IS NOT NULL`,
      [venueId]
    );

    // Upcoming events count
    const upcomingResult = await this.db.query(
      `SELECT COUNT(*) AS upcoming_events
       FROM events
       WHERE venue_id = $1 AND event_date >= CURRENT_DATE AND is_cancelled = false`,
      [venueId]
    );

    // Popular genres (from bands who played at this venue)
    const genresResult = await this.db.query(
      `SELECT b.genre, COUNT(DISTINCT el.event_id) AS event_count
       FROM event_lineup el
       JOIN events e ON el.event_id = e.id
       JOIN bands b ON el.band_id = b.id
       WHERE e.venue_id = $1 AND b.genre IS NOT NULL AND b.genre != ''
       GROUP BY b.genre
       ORDER BY event_count DESC
       LIMIT 10`,
      [venueId]
    );

    const row = checkinsResult.rows[0];
    return {
      totalCheckins: parseInt(row.total_checkins || '0'),
      averageRating: parseFloat(ratingResult.rows[0].avg_rating || '0'),
      uniqueVisitors: parseInt(row.unique_visitors || '0'),
      upcomingEventsCount: parseInt(upcomingResult.rows[0].upcoming_events || '0'),
      popularGenres: genresResult.rows.map((r: any) => ({
        genre: r.genre,
        count: parseInt(r.event_count),
      })),
    };
  }

  /**
   * Map database venue row to Venue type
   */
  private mapDbVenueToVenue(row: any): Venue {
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
      totalCheckins: parseInt(row.total_checkins || 0),
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