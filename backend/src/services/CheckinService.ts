import Database from '../config/database';
import { VenueService } from './VenueService';
import { BandService } from './BandService';

interface CreateCheckinRequest {
  userId: string;
  venueId: string;
  bandId: string;
  rating: number;
  comment?: string;
  photoUrl?: string;
  eventDate?: Date;
  checkinLatitude?: number;
  checkinLongitude?: number;
  vibeTagIds?: string[];
}

interface VibeTag {
  id: string;
  name: string;
  icon: string;
  category: string;
}

interface Toast {
  id: string;
  checkinId: string;
  userId: string;
  createdAt: Date;
  user?: any;
}

interface Checkin {
  id: string;
  userId: string;
  venueId: string;
  bandId: string;
  rating: number;
  comment?: string;
  photoUrl?: string;
  eventDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  user?: any;
  venue?: any;
  band?: any;
  toastCount?: number;
  commentCount?: number;
  hasUserToasted?: boolean;
  vibeTags?: VibeTag[];
}

interface GetCheckinsOptions {
  venueId?: string;
  bandId?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

interface Comment {
  id: string;
  checkinId: string;
  userId: string;
  content: string;
  createdAt: Date;
  user?: any;
  ownerId?: string; // Check-in owner for WebSocket notifications
}

export class CheckinService {
  private db = Database.getInstance();
  private venueService = new VenueService();
  private bandService = new BandService();

  /**
   * Create a new check-in
   * Uses venue_id and band_id directly (matches database schema)
   */
  async createCheckin(data: CreateCheckinRequest): Promise<Checkin> {
    try {
      const {
        userId,
        venueId,
        bandId,
        rating,
        comment,
        photoUrl,
        eventDate,
        checkinLatitude,
        checkinLongitude,
        vibeTagIds,
      } = data;

      // Create check-in using venue_id and band_id (matching schema)
      const insertQuery = `
        INSERT INTO checkins (
          user_id, band_id, venue_id, rating, comment, photo_url,
          event_date, checkin_latitude, checkin_longitude
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const result = await this.db.query(insertQuery, [
        userId,
        bandId,
        venueId,
        rating,
        comment || null,
        photoUrl || null,
        eventDate || null,
        checkinLatitude || null,
        checkinLongitude || null,
      ]);

      const checkinId = result.rows[0].id;

      // Add vibe tags if provided
      if (vibeTagIds && vibeTagIds.length > 0) {
        await this.addVibeTagsToCheckin(checkinId, vibeTagIds);
      }

      // Update venue and band ratings asynchronously (triggers handle stats)
      this.venueService.updateVenueRating(venueId).catch(err =>
        console.error('Error updating venue rating:', err)
      );
      this.bandService.updateBandRating(bandId).catch(err =>
        console.error('Error updating band rating:', err)
      );

      // Return full check-in with details
      return this.getCheckinById(checkinId, userId);
    } catch (error) {
      console.error('Create check-in error:', error);
      throw error;
    }
  }

  /**
   * Get check-in by ID with full details
   */
  async getCheckinById(checkinId: string, currentUserId?: string): Promise<Checkin> {
    try {
      const query = `
        SELECT
          c.*,
          u.id as user_id, u.username, u.profile_image_url,
          v.id as venue_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          b.id as band_id, b.name as band_name, b.genre as band_genre,
          b.image_url as band_image,
          COUNT(DISTINCT t.id) as toast_count,
          COUNT(DISTINCT cm.id) as comment_count
          ${currentUserId ? `, EXISTS(
            SELECT 1 FROM toasts
            WHERE checkin_id = c.id AND user_id = $2
          ) as has_user_toasted` : ''}
        FROM checkins c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN venues v ON c.venue_id = v.id
        LEFT JOIN bands b ON c.band_id = b.id
        LEFT JOIN toasts t ON c.id = t.checkin_id
        LEFT JOIN checkin_comments cm ON c.id = cm.checkin_id
        WHERE c.id = $1
        GROUP BY c.id, u.id, v.id, b.id
      `;

      const params = currentUserId ? [checkinId, currentUserId] : [checkinId];
      const result = await this.db.query(query, params);

      if (result.rows.length === 0) {
        throw new Error('Check-in not found');
      }

      return this.mapDbCheckinToCheckin(result.rows[0]);
    } catch (error) {
      console.error('Get check-in error:', error);
      throw error;
    }
  }

  /**
   * Get activity feed
   * Filters: 'friends', 'nearby', 'global'
   */
  async getActivityFeed(
    userId: string,
    filter: 'friends' | 'nearby' | 'global' = 'friends',
    options: { limit?: number; offset?: number; latitude?: number; longitude?: number } = {}
  ): Promise<Checkin[]> {
    try {
      const { limit = 50, offset = 0 } = options;

      let whereClause = '';
      let params: any[] = [userId];

      if (filter === 'friends') {
        // Get check-ins from friends
        whereClause = `
          WHERE c.user_id IN (
            SELECT following_id FROM user_followers WHERE follower_id = $1
          )
        `;
      } else if (filter === 'nearby') {
        // Get check-ins from venues within 40 miles of user's location
        const { latitude, longitude } = options;
        if (latitude !== undefined && longitude !== undefined) {
          // Use Haversine formula for ~40 mile radius (64.4 km)
          whereClause = `
            WHERE (
              6371 * acos(
                cos(radians($2)) * cos(radians(v.latitude)) *
                cos(radians(v.longitude) - radians($3)) +
                sin(radians($2)) * sin(radians(v.latitude))
              )
            ) <= 64.4
          `;
          params.push(latitude, longitude);
        } else {
          // Fallback to global if no location provided
          whereClause = 'WHERE 1=1';
        }
      } else {
        // Global feed - all check-ins
        whereClause = 'WHERE 1=1';
      }

      const query = `
        SELECT
          c.*,
          u.id as user_id, u.username, u.profile_image_url,
          v.id as venue_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          b.id as band_id, b.name as band_name, b.genre as band_genre,
          b.image_url as band_image,
          COUNT(DISTINCT t.id) as toast_count,
          COUNT(DISTINCT cm.id) as comment_count,
          EXISTS(
            SELECT 1 FROM toasts
            WHERE checkin_id = c.id AND user_id = $1
          ) as has_user_toasted
        FROM checkins c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN venues v ON c.venue_id = v.id
        LEFT JOIN bands b ON c.band_id = b.id
        LEFT JOIN toasts t ON c.id = t.checkin_id
        LEFT JOIN checkin_comments cm ON c.id = cm.checkin_id
        ${whereClause}
        GROUP BY c.id, u.id, v.id, b.id
        ORDER BY c.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      params.push(limit, offset);
      const result = await this.db.query(query, params);

      return result.rows.map((row: any) => this.mapDbCheckinToCheckin(row));
    } catch (error) {
      console.error('Get activity feed error:', error);
      throw error;
    }
  }

  /**
   * Toast a check-in (like Untappd's toast feature)
   * Returns toast count and owner ID for WebSocket broadcasts
   */
  async toastCheckin(userId: string, checkinId: string): Promise<{ toastCount: number; ownerId: string }> {
    try {
      // Check if already toasted
      const existingToast = await this.db.query(
        'SELECT id FROM toasts WHERE checkin_id = $1 AND user_id = $2',
        [checkinId, userId]
      );

      if (existingToast.rows.length > 0) {
        throw new Error('Already toasted this check-in');
      }

      // Create toast
      await this.db.query(
        'INSERT INTO toasts (checkin_id, user_id) VALUES ($1, $2)',
        [checkinId, userId]
      );

      // Get toast count and owner ID for WebSocket broadcast
      const result = await this.db.query(
        `SELECT c.user_id as owner_id, COUNT(t.id) as toast_count
         FROM checkins c
         LEFT JOIN toasts t ON c.id = t.checkin_id
         WHERE c.id = $1
         GROUP BY c.id`,
        [checkinId]
      );

      return {
        toastCount: parseInt(result.rows[0]?.toast_count || '0'),
        ownerId: result.rows[0]?.owner_id,
      };
    } catch (error) {
      console.error('Toast check-in error:', error);
      throw error;
    }
  }

  /**
   * Untoast a check-in
   */
  async untoastCheckin(userId: string, checkinId: string): Promise<void> {
    try {
      await this.db.query(
        'DELETE FROM toasts WHERE checkin_id = $1 AND user_id = $2',
        [checkinId, userId]
      );
    } catch (error) {
      console.error('Untoast check-in error:', error);
      throw error;
    }
  }

  /**
   * Add a comment to a check-in
   * Returns comment with owner ID for WebSocket notifications
   */
  async addComment(
    userId: string,
    checkinId: string,
    content: string
  ): Promise<Comment> {
    try {
      const query = `
        INSERT INTO checkin_comments (checkin_id, user_id, content)
        VALUES ($1, $2, $3)
        RETURNING *
      `;

      const result = await this.db.query(query, [checkinId, userId, content]);

      // Get check-in owner for WebSocket notification
      const checkin = await this.db.query(
        'SELECT user_id FROM checkins WHERE id = $1',
        [checkinId]
      );

      // Get comment with user details
      const comment = await this.getCommentById(result.rows[0].id);

      return {
        ...comment,
        ownerId: checkin.rows[0]?.user_id,
      };
    } catch (error) {
      console.error('Add comment error:', error);
      throw error;
    }
  }

  /**
   * Get comments for a check-in
   */
  async getComments(checkinId: string): Promise<Comment[]> {
    try {
      const query = `
        SELECT
          c.*,
          u.id as user_id, u.username, u.profile_image_url
        FROM checkin_comments c
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.checkin_id = $1
        ORDER BY c.created_at ASC
      `;

      const result = await this.db.query(query, [checkinId]);

      return result.rows.map((row: any) => ({
        id: row.id,
        checkinId: row.checkin_id,
        userId: row.user_id,
        content: row.content,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          username: row.username,
          profileImageUrl: row.profile_image_url,
        },
      }));
    } catch (error) {
      console.error('Get comments error:', error);
      throw error;
    }
  }

  /**
   * Delete a check-in
   */
  async deleteCheckin(userId: string, checkinId: string): Promise<void> {
    try {
      // Verify user owns the check-in
      const checkin = await this.db.query(
        'SELECT user_id FROM checkins WHERE id = $1',
        [checkinId]
      );

      if (checkin.rows.length === 0) {
        throw new Error('Check-in not found');
      }

      if (checkin.rows[0].user_id !== userId) {
        throw new Error('Unauthorized to delete this check-in');
      }

      // Delete check-in (cascades to toasts and comments)
      await this.db.query('DELETE FROM checkins WHERE id = $1', [checkinId]);
    } catch (error) {
      console.error('Delete check-in error:', error);
      throw error;
    }
  }

  /**
   * Get check-ins with filters
   */
  async getCheckins(options: GetCheckinsOptions = {}): Promise<Checkin[]> {
    try {
      const { venueId, bandId, userId, page = 1, limit = 20 } = options;
      const offset = (page - 1) * limit;
      const params: any[] = [];
      let paramIndex = 1;

      let whereClause = 'WHERE 1=1';

      if (venueId) {
        whereClause += ` AND c.venue_id = $${paramIndex++}`;
        params.push(venueId);
      }

      if (bandId) {
        whereClause += ` AND c.band_id = $${paramIndex++}`;
        params.push(bandId);
      }

      if (userId) {
        whereClause += ` AND c.user_id = $${paramIndex++}`;
        params.push(userId);
      }

      const query = `
        SELECT
          c.*,
          u.id as user_id, u.username, u.profile_image_url,
          v.id as venue_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          b.id as band_id, b.name as band_name, b.genre as band_genre,
          b.image_url as band_image,
          COUNT(DISTINCT t.id) as toast_count,
          COUNT(DISTINCT cm.id) as comment_count
        FROM checkins c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN venues v ON c.venue_id = v.id
        LEFT JOIN bands b ON c.band_id = b.id
        LEFT JOIN toasts t ON c.id = t.checkin_id
        LEFT JOIN checkin_comments cm ON c.id = cm.checkin_id
        ${whereClause}
        GROUP BY c.id, u.id, v.id, b.id
        ORDER BY c.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      params.push(limit, offset);
      const result = await this.db.query(query, params);

      return result.rows.map((row: any) => this.mapDbCheckinToCheckin(row));
    } catch (error) {
      console.error('Get check-ins error:', error);
      throw error;
    }
  }

  /**
   * Get all vibe tags
   */
  async getVibeTags(): Promise<VibeTag[]> {
    try {
      const query = `
        SELECT id, name, icon, category
        FROM vibe_tags
        ORDER BY category, name
      `;

      const result = await this.db.query(query, []);

      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        category: row.category,
      }));
    } catch (error) {
      console.error('Get vibe tags error:', error);
      throw error;
    }
  }

  /**
   * Get toasts for a check-in
   */
  async getToasts(checkinId: string): Promise<Toast[]> {
    try {
      const query = `
        SELECT
          t.*,
          u.id as user_id, u.username, u.profile_image_url
        FROM toasts t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.checkin_id = $1
        ORDER BY t.created_at DESC
      `;

      const result = await this.db.query(query, [checkinId]);

      return result.rows.map((row: any) => ({
        id: row.id,
        checkinId: row.checkin_id,
        userId: row.user_id,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          username: row.username,
          profileImageUrl: row.profile_image_url,
        },
      }));
    } catch (error) {
      console.error('Get toasts error:', error);
      throw error;
    }
  }

  /**
   * Delete a comment
   */
  async deleteComment(userId: string, checkinId: string, commentId: string): Promise<void> {
    try {
      // Verify user owns the comment or the check-in
      const comment = await this.db.query(
        'SELECT user_id FROM checkin_comments WHERE id = $1 AND checkin_id = $2',
        [commentId, checkinId]
      );

      if (comment.rows.length === 0) {
        throw new Error('Comment not found');
      }

      const checkin = await this.db.query(
        'SELECT user_id FROM checkins WHERE id = $1',
        [checkinId]
      );

      if (!checkin.rows.length) {
        throw new Error('Checkin not found');
      }

      // Allow delete if user is comment author or check-in owner
      if (comment.rows[0].user_id !== userId && checkin.rows[0].user_id !== userId) {
        throw new Error('Unauthorized to delete this comment');
      }

      await this.db.query('DELETE FROM checkin_comments WHERE id = $1', [commentId]);
    } catch (error) {
      console.error('Delete comment error:', error);
      throw error;
    }
  }

  /**
   * Add vibe tags to a check-in
   */
  async addVibeTagsToCheckin(checkinId: string, vibeTagIds: string[]): Promise<void> {
    try {
      if (!vibeTagIds || vibeTagIds.length === 0) return;

      const values = vibeTagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
      const params = [checkinId, ...vibeTagIds];

      await this.db.query(
        `INSERT INTO checkin_vibes (checkin_id, vibe_tag_id) VALUES ${values}
         ON CONFLICT (checkin_id, vibe_tag_id) DO NOTHING`,
        params
      );
    } catch (error) {
      console.error('Add vibe tags error:', error);
      throw error;
    }
  }

  /**
   * Get vibe tags for a check-in
   */
  async getCheckinVibeTags(checkinId: string): Promise<VibeTag[]> {
    try {
      const query = `
        SELECT vt.id, vt.name, vt.icon, vt.category
        FROM vibe_tags vt
        INNER JOIN checkin_vibes cv ON vt.id = cv.vibe_tag_id
        WHERE cv.checkin_id = $1
      `;

      const result = await this.db.query(query, [checkinId]);

      return result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        category: row.category,
      }));
    } catch (error) {
      console.error('Get check-in vibe tags error:', error);
      throw error;
    }
  }

  /**
   * Get comment by ID
   */
  private async getCommentById(commentId: string): Promise<Comment> {
    const query = `
      SELECT
        c.*,
        u.id as user_id, u.username, u.profile_image_url
      FROM checkin_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = $1
    `;

    const result = await this.db.query(query, [commentId]);

    if (result.rows.length === 0) {
      throw new Error('Comment not found');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      checkinId: row.checkin_id,
      userId: row.user_id,
      content: row.content,
      createdAt: row.created_at,
      user: {
        id: row.user_id,
        username: row.username,
        profileImageUrl: row.profile_image_url,
      },
    };
  }

  /**
   * Map database check-in row to Checkin type
   */
  private mapDbCheckinToCheckin(row: any): Checkin {
    return {
      id: row.id,
      userId: row.user_id,
      venueId: row.venue_id,
      bandId: row.band_id,
      rating: parseFloat(row.rating) || 0,
      comment: row.comment,
      photoUrl: row.photo_url,
      eventDate: row.event_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      user: row.username ? {
        id: row.user_id,
        username: row.username,
        profileImageUrl: row.profile_image_url,
      } : undefined,
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
      toastCount: parseInt(row.toast_count || 0),
      commentCount: parseInt(row.comment_count || 0),
      hasUserToasted: row.has_user_toasted || false,
    };
  }
}
