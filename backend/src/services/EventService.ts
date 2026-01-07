import Database from '../config/database';

interface CreateShowRequest {
  venueId: string;
  bandId: string;
  showDate: Date;
  doorsTime?: string;
  startTime?: string;
  endTime?: string;
  ticketUrl?: string;
  ticketPriceMin?: number;
  ticketPriceMax?: number;
  description?: string;
}

interface Show {
  id: string;
  venueId: string;
  bandId: string;
  showDate: Date;
  doorsTime?: string;
  startTime?: string;
  endTime?: string;
  ticketUrl?: string;
  ticketPriceMin?: number;
  ticketPriceMax?: number;
  isSoldOut: boolean;
  isCancelled: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  venue?: any;
  band?: any;
  checkinCount?: number;
}

export class EventService {
  private db = Database.getInstance();

  /**
   * Create a new show or return existing one
   * Shows are unique by venue + band + date combination
   */
  async createShow(data: CreateShowRequest): Promise<Show> {
    try {
      const {
        venueId,
        bandId,
        showDate,
        doorsTime,
        startTime,
        endTime,
        ticketUrl,
        ticketPriceMin,
        ticketPriceMax,
        description,
      } = data;

      // Check if show already exists
      const existingShow = await this.db.query(
        `SELECT * FROM shows
         WHERE venue_id = $1 AND band_id = $2 AND show_date = $3`,
        [venueId, bandId, showDate]
      );

      if (existingShow.rows.length > 0) {
        // Return existing show with venue and band details
        return this.getShowById(existingShow.rows[0].id);
      }

      // Create new show
      const insertQuery = `
        INSERT INTO shows (
          venue_id, band_id, show_date, doors_time, start_time, end_time,
          ticket_url, ticket_price_min, ticket_price_max, description
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      const result = await this.db.query(insertQuery, [
        venueId,
        bandId,
        showDate,
        doorsTime || null,
        startTime || null,
        endTime || null,
        ticketUrl || null,
        ticketPriceMin || null,
        ticketPriceMax || null,
        description || null,
      ]);

      // Return new show with venue and band details
      return this.getShowById(result.rows[0].id);
    } catch (error) {
      console.error('Create show error:', error);
      throw error;
    }
  }

  /**
   * Get show by ID with venue and band details
   * Note: checkin_count is based on checkins for this venue+band+date, not show_id
   */
  async getShowById(showId: string): Promise<Show> {
    try {
      const query = `
        SELECT
          s.*,
          v.id as venue_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          b.id as band_id, b.name as band_name, b.genre as band_genre,
          b.image_url as band_image,
          (
            SELECT COUNT(*) FROM checkins c
            WHERE c.venue_id = s.venue_id
              AND c.band_id = s.band_id
              AND c.event_date = s.show_date
          ) as checkin_count
        FROM shows s
        LEFT JOIN venues v ON s.venue_id = v.id
        LEFT JOIN bands b ON s.band_id = b.id
        WHERE s.id = $1
      `;

      const result = await this.db.query(query, [showId]);

      if (result.rows.length === 0) {
        throw new Error('Show not found');
      }

      return this.mapDbShowToShow(result.rows[0]);
    } catch (error) {
      console.error('Get show error:', error);
      throw error;
    }
  }

  /**
   * Get shows at a specific venue
   */
  async getShowsByVenue(
    venueId: string,
    options: { upcoming?: boolean; limit?: number } = {}
  ): Promise<Show[]> {
    try {
      const { upcoming = true, limit = 50 } = options;

      let whereClause = 'WHERE s.venue_id = $1';
      if (upcoming) {
        whereClause += ' AND s.show_date >= CURRENT_DATE';
      }

      const query = `
        SELECT
          s.*,
          v.id as venue_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          b.id as band_id, b.name as band_name, b.genre as band_genre,
          b.image_url as band_image,
          (
            SELECT COUNT(*) FROM checkins c
            WHERE c.venue_id = s.venue_id
              AND c.band_id = s.band_id
              AND c.event_date = s.show_date
          ) as checkin_count
        FROM shows s
        LEFT JOIN venues v ON s.venue_id = v.id
        LEFT JOIN bands b ON s.band_id = b.id
        ${whereClause}
        ORDER BY s.show_date ${upcoming ? 'ASC' : 'DESC'}
        LIMIT $2
      `;

      const result = await this.db.query(query, [venueId, limit]);

      return result.rows.map((row: any) => this.mapDbShowToShow(row));
    } catch (error) {
      console.error('Get shows by venue error:', error);
      throw error;
    }
  }

  /**
   * Get shows for a specific band
   */
  async getShowsByBand(
    bandId: string,
    options: { upcoming?: boolean; limit?: number } = {}
  ): Promise<Show[]> {
    try {
      const { upcoming = true, limit = 50 } = options;

      let whereClause = 'WHERE s.band_id = $1';
      if (upcoming) {
        whereClause += ' AND s.show_date >= CURRENT_DATE';
      }

      const query = `
        SELECT
          s.*,
          v.id as venue_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          b.id as band_id, b.name as band_name, b.genre as band_genre,
          b.image_url as band_image,
          (
            SELECT COUNT(*) FROM checkins c
            WHERE c.venue_id = s.venue_id
              AND c.band_id = s.band_id
              AND c.event_date = s.show_date
          ) as checkin_count
        FROM shows s
        LEFT JOIN venues v ON s.venue_id = v.id
        LEFT JOIN bands b ON s.band_id = b.id
        ${whereClause}
        ORDER BY s.show_date ${upcoming ? 'ASC' : 'DESC'}
        LIMIT $2
      `;

      const result = await this.db.query(query, [bandId, limit]);

      return result.rows.map((row: any) => this.mapDbShowToShow(row));
    } catch (error) {
      console.error('Get shows by band error:', error);
      throw error;
    }
  }

  /**
   * Get upcoming shows (across all venues/bands)
   */
  async getUpcomingShows(limit: number = 50): Promise<Show[]> {
    try {
      const query = `
        SELECT
          s.*,
          v.id as venue_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          b.id as band_id, b.name as band_name, b.genre as band_genre,
          b.image_url as band_image,
          (
            SELECT COUNT(*) FROM checkins c
            WHERE c.venue_id = s.venue_id
              AND c.band_id = s.band_id
              AND c.event_date = s.show_date
          ) as checkin_count
        FROM shows s
        LEFT JOIN venues v ON s.venue_id = v.id
        LEFT JOIN bands b ON s.band_id = b.id
        WHERE s.show_date >= CURRENT_DATE AND s.is_cancelled = FALSE
        ORDER BY s.show_date ASC, s.created_at DESC
        LIMIT $1
      `;

      const result = await this.db.query(query, [limit]);

      return result.rows.map((row: any) => this.mapDbShowToShow(row));
    } catch (error) {
      console.error('Get upcoming shows error:', error);
      throw error;
    }
  }

  /**
   * Get trending shows (most check-ins recently)
   */
  async getTrendingShows(limit: number = 20): Promise<Show[]> {
    try {
      const query = `
        SELECT
          s.*,
          v.id as venue_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          b.id as band_id, b.name as band_name, b.genre as band_genre,
          b.image_url as band_image,
          (
            SELECT COUNT(*) FROM checkins c
            WHERE c.venue_id = s.venue_id
              AND c.band_id = s.band_id
              AND c.event_date = s.show_date
          ) as checkin_count
        FROM shows s
        LEFT JOIN venues v ON s.venue_id = v.id
        LEFT JOIN bands b ON s.band_id = b.id
        WHERE s.show_date >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY checkin_count DESC, s.show_date DESC
        LIMIT $1
      `;

      const result = await this.db.query(query, [limit]);

      return result.rows.map((row: any) => this.mapDbShowToShow(row));
    } catch (error) {
      console.error('Get trending shows error:', error);
      throw error;
    }
  }

  /**
   * Delete a show
   */
  async deleteShow(showId: string): Promise<void> {
    try {
      await this.db.query('DELETE FROM shows WHERE id = $1', [showId]);
    } catch (error) {
      console.error('Delete show error:', error);
      throw error;
    }
  }

  /**
   * Map database show row to Show type
   */
  private mapDbShowToShow(row: any): Show {
    return {
      id: row.id,
      venueId: row.venue_id,
      bandId: row.band_id,
      showDate: row.show_date,
      doorsTime: row.doors_time,
      startTime: row.start_time,
      endTime: row.end_time,
      ticketUrl: row.ticket_url,
      ticketPriceMin: row.ticket_price_min ? parseFloat(row.ticket_price_min) : undefined,
      ticketPriceMax: row.ticket_price_max ? parseFloat(row.ticket_price_max) : undefined,
      isSoldOut: row.is_sold_out || false,
      isCancelled: row.is_cancelled || false,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      venue: row.venue_name ? {
        id: row.venue_id,
        name: row.venue_name,
        city: row.venue_city,
        state: row.venue_state,
        imageUrl: row.venue_image,
      } : undefined,
      band: row.band_name ? {
        id: row.band_id,
        name: row.band_name,
        genre: row.band_genre,
        imageUrl: row.band_image,
      } : undefined,
      checkinCount: parseInt(row.checkin_count || 0),
    };
  }
}
