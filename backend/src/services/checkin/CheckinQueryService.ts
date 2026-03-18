/**
 * CheckinQueryService -- Read-only check-in queries
 *
 * Extracted from CheckinService as part of Phase 4 refactoring.
 * Handles all read operations:
 *   - getActivityFeed()
 *   - getCheckinById()
 *   - getCheckins() with filters
 *   - getVibeTags()
 */

import Database from '../../config/database';
import { BlockService } from '../BlockService';
import {
  Checkin,
  BandRating,
  VibeTag,
  GetCheckinsOptions,
  ActivityFeedOptions,
  mapDbCheckinToCheckin,
} from './types';
import logger from '../../utils/logger';

export class CheckinQueryService {
  private db = Database.getInstance();
  private blockService = new BlockService();

  /**
   * Get check-in by ID with full details.
   * Also fetches per-band ratings from checkin_band_ratings.
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
          ev.event_date as ev_event_date, ev.event_name as ev_event_name,
          c.toast_count,
          c.comment_count
          ${currentUserId ? `, EXISTS(
            SELECT 1 FROM toasts
            WHERE checkin_id = c.id AND user_id = $2
          ) as has_user_toasted` : ''}
        FROM checkins c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN venues v ON c.venue_id = v.id
        LEFT JOIN bands b ON c.band_id = b.id
        LEFT JOIN events ev ON c.event_id = ev.id
        WHERE c.id = $1
          AND (c.is_hidden IS NOT TRUE)
      `;

      const params = currentUserId ? [checkinId, currentUserId] : [checkinId];
      const result = await this.db.query(query, params);

      if (result.rows.length === 0) {
        throw new Error('Check-in not found');
      }

      // Fetch per-band ratings for this check-in
      const bandRatingsResult = await this.db.query(
        `SELECT cbr.band_id, cbr.rating, b.name as band_name
         FROM checkin_band_ratings cbr
         JOIN bands b ON cbr.band_id = b.id
         WHERE cbr.checkin_id = $1`,
        [checkinId]
      );

      const bandRatings: BandRating[] = bandRatingsResult.rows.map((r: any) => ({
        bandId: r.band_id,
        rating: parseFloat(r.rating),
        bandName: r.band_name,
      }));

      const checkin = mapDbCheckinToCheckin(result.rows[0]);
      checkin.bandRatings = bandRatings.length > 0 ? bandRatings : undefined;

      return checkin;
    } catch (error) {
      logger.error('Get check-in error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
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
    options: ActivityFeedOptions = {}
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
              6371 * acos(LEAST(GREATEST(
                cos(radians($2)) * cos(radians(v.latitude)) *
                cos(radians(v.longitude) - radians($3)) +
                sin(radians($2)) * sin(radians(v.latitude))
              , -1), 1))
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

      // Calculate dynamic parameter indexes for LIMIT and OFFSET
      const limitParamIdx = params.length + 1;
      const offsetParamIdx = params.length + 2;

      const query = `
        SELECT
          c.*,
          u.id as user_id, u.username, u.profile_image_url,
          v.id as venue_id, v.name as venue_name, v.city as venue_city,
          v.state as venue_state, v.image_url as venue_image,
          b.id as band_id, b.name as band_name, b.genre as band_genre,
          b.image_url as band_image,
          c.toast_count,
          c.comment_count,
          EXISTS(
            SELECT 1 FROM toasts
            WHERE checkin_id = c.id AND user_id = $1
          ) as has_user_toasted
        FROM checkins c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN venues v ON c.venue_id = v.id
        LEFT JOIN bands b ON c.band_id = b.id
        ${whereClause}
        AND (c.is_hidden IS NOT TRUE)
        ${this.blockService.getBlockFilterSQL(userId, 'c.user_id')}
        ORDER BY c.created_at DESC
        LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
      `;

      params.push(limit, offset);
      const result = await this.db.query(query, params);

      return result.rows.map((row: any) => mapDbCheckinToCheckin(row));
    } catch (error) {
      logger.error('Get activity feed error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
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
          c.toast_count,
          c.comment_count
        FROM checkins c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN venues v ON c.venue_id = v.id
        LEFT JOIN bands b ON c.band_id = b.id
        ${whereClause}
        AND (c.is_hidden IS NOT TRUE)
        ORDER BY c.created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      params.push(limit, offset);
      const result = await this.db.query(query, params);

      return result.rows.map((row: any) => mapDbCheckinToCheckin(row));
    } catch (error) {
      logger.error('Get check-ins error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
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
      logger.error('Get vibe tags error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }
}
