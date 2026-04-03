/**
 * CheckinQueryService -- Read-only check-in queries
 *
 * Extracted from CheckinService as part of Phase 4 refactoring.
 * Handles all read operations:
 *   - getActivityFeed() - legacy offset pagination
 *   - getActivityFeedWithCursor() - cursor pagination (v2)
 *   - getCheckinById()
 *   - getCheckins() - legacy offset pagination
 *   - getCheckinsWithCursor() - cursor pagination (v2)
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

// ============================================
// Cursor Types
// ============================================

interface CheckinCursor {
  createdAt: string;
  id: string;
}

export interface CursorPaginatedCheckins {
  data: Checkin[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface GetCheckinsCursorOptions {
  venueId?: string;
  bandId?: string;
  userId?: string;
  cursor?: string;
  limit: number;
  currentUserId?: string;
}

export interface ActivityFeedCursorOptions {
  filter: 'friends' | 'nearby' | 'global';
  cursor?: string;
  limit: number;
  latitude?: number;
  longitude?: number;
}

// ============================================
// Cursor Helpers
// ============================================

function encodeCursor(cursor: CheckinCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(encoded: string): CheckinCursor | null {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (parsed.createdAt && parsed.id) return parsed;
    return null;
  } catch {
    return null;
  }
}

// ============================================
// Service
// ============================================

export class CheckinQueryService {
  private db = Database.getInstance();
  private blockService = new BlockService();

  /**
   * Get check-in by ID with full details.
   * Uses single query with json_agg to avoid N+1 query pattern for band ratings.
   */
  async getCheckinById(checkinId: string, currentUserId?: string): Promise<Checkin> {
    try {
      const hasUserToastedSQL = currentUserId
        ? `, EXISTS(
            SELECT 1 FROM toasts
            WHERE checkin_id = c.id AND user_id = $2
          ) as has_user_toasted`
        : '';

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
          ${hasUserToastedSQL},
          COALESCE(
            json_agg(
              json_build_object(
                'band_id', cbr.band_id,
                'rating', cbr.rating,
                'band_name', br.name
              ) ORDER BY br.name
            ) FILTER (WHERE cbr.band_id IS NOT NULL),
            '[]'::json
          ) as band_ratings
        FROM checkins c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN venues v ON c.venue_id = v.id
        LEFT JOIN bands b ON c.band_id = b.id
        LEFT JOIN events ev ON c.event_id = ev.id
        LEFT JOIN checkin_band_ratings cbr ON cbr.checkin_id = c.id
        LEFT JOIN bands br ON br.id = cbr.band_id
        WHERE c.id = $1
          AND (c.is_hidden IS NOT TRUE)
        GROUP BY c.id, u.id, u.username, u.profile_image_url,
          v.id, v.name, v.city, v.state, v.image_url,
          b.id, b.name, b.genre, b.image_url,
          ev.event_date, ev.event_name
      `;

      const params = currentUserId ? [checkinId, currentUserId] : [checkinId];
      const result = await this.db.query(query, params);

      if (result.rows.length === 0) {
        throw new Error('Check-in not found');
      }

      // Parse band_ratings from json_agg
      const row = result.rows[0];
      const bandRatings: BandRating[] = (row.band_ratings || []).map((r: any) => ({
        bandId: r.band_id,
        rating: parseFloat(r.rating),
        bandName: r.band_name,
      }));

      const checkin = mapDbCheckinToCheckin(row);
      checkin.bandRatings = bandRatings.length > 0 ? bandRatings : undefined;

      return checkin;
    } catch (error) {
      logger.error('Get check-in error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get check-ins with cursor pagination (v2 API)
   * Replaces offset-based getCheckins for better performance at scale
   */
  async getCheckinsWithCursor(
    options: GetCheckinsCursorOptions
  ): Promise<CursorPaginatedCheckins> {
    try {
      const { venueId, bandId, userId, cursor, limit = 20, currentUserId } = options;
      const effectiveLimit = Math.min(limit, 100);

      // Parse cursor
      const cursorData = cursor ? decodeCursor(cursor) : null;

      const paramMap: Record<string, number> = {};

      // Build WHERE clause
      let whereClause = 'WHERE 1=1';

      let paramIndex = 1;
      if (venueId) {
        whereClause += ` AND c.venue_id = $${paramIndex}`;
        paramMap.venueId = paramIndex++;
      }

      if (bandId) {
        whereClause += ` AND c.band_id = $${paramIndex}`;
        paramMap.bandId = paramIndex++;
      }

      if (userId) {
        whereClause += ` AND c.user_id = $${paramIndex}`;
        paramMap.userId = paramIndex++;
      }

      // Build cursor parameters
      if (cursorData) {
        paramMap.cursorCreatedAt = paramIndex++;
        paramMap.cursorId = paramIndex++;
      }

      // Has user toasted param
      if (currentUserId) {
        paramMap.currentUserId = paramIndex++;
      }

      const limitParam = paramIndex++;

      const hasUserToastedSQL = currentUserId
        ? `, EXISTS(
            SELECT 1 FROM toasts
            WHERE checkin_id = c.id AND user_id = $${paramMap.currentUserId}
          ) as has_user_toasted`
        : '';

      const cursorClause = cursorData
        ? `AND (c.created_at, c.id) < ($${paramMap.cursorCreatedAt}::timestamptz, $${paramMap.cursorId}::uuid)`
        : '';

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
          ${hasUserToastedSQL}
        FROM checkins c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN venues v ON c.venue_id = v.id
        LEFT JOIN bands b ON c.band_id = b.id
        ${whereClause}
        AND (c.is_hidden IS NOT TRUE)
        ${cursorClause}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $${limitParam}
      `;

      // Build param array
      const queryParams: any[] = [];
      if (venueId) queryParams.push(venueId);
      if (bandId) queryParams.push(bandId);
      if (userId) queryParams.push(userId);
      if (cursorData) {
        queryParams.push(cursorData.createdAt);
        queryParams.push(cursorData.id);
      }
      if (currentUserId) queryParams.push(currentUserId);
      queryParams.push(effectiveLimit + 1); // Get one extra to check if there are more

      const result = await this.db.query(query, queryParams);
      const rows = result.rows;

      const hasMore = rows.length > effectiveLimit;
      if (hasMore) rows.pop();

      const data = rows.map((row: any) => mapDbCheckinToCheckin(row));

      // Generate next cursor
      const nextCursor =
        hasMore && data.length > 0
          ? encodeCursor({
              createdAt:
                rows[rows.length - 1].created_at instanceof Date
                  ? rows[rows.length - 1].created_at.toISOString()
                  : rows[rows.length - 1].created_at,
              id: rows[rows.length - 1].id,
            })
          : null;

      return {
        data,
        nextCursor,
        hasMore,
      };
    } catch (error) {
      logger.error('Get check-ins with cursor error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        options,
      });
      throw error;
    }
  }

  /**
   * Get activity feed with cursor pagination (v2 API)
   * Filters: 'friends', 'nearby', 'global'
   */
  async getActivityFeedWithCursor(
    userId: string,
    options: ActivityFeedCursorOptions
  ): Promise<CursorPaginatedCheckins> {
    try {
      const { filter = 'friends', cursor, limit = 50, latitude, longitude } = options;
      const effectiveLimit = Math.min(limit, 100);

      // Parse cursor
      const cursorData = cursor ? decodeCursor(cursor) : null;

      let whereClause = '';
      const params: any[] = [userId];
      let paramIndex = 2;

      if (filter === 'friends') {
        whereClause = `
          AND c.user_id IN (
            SELECT following_id FROM user_followers WHERE follower_id = $1
          )
        `;
      } else if (filter === 'nearby') {
        if (latitude !== undefined && longitude !== undefined) {
          whereClause = `
            AND v.latitude IS NOT NULL
              AND v.longitude IS NOT NULL
              AND (
              6371 * acos(LEAST(GREATEST(
                cos(radians($${paramIndex})) * cos(radians(v.latitude)) *
                cos(radians(v.longitude) - radians($${paramIndex + 1})) +
                sin(radians($${paramIndex})) * sin(radians(v.latitude))
              , -1), 1))
            ) <= 64.4
          `;
          params.push(latitude, longitude);
          paramIndex += 2;
        }
      }

      // Cursor params
      if (cursorData) {
        params.push(cursorData.createdAt, cursorData.id);
        paramIndex += 2;
      }

      const limitParam = paramIndex++;

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
        WHERE (c.is_hidden IS NOT TRUE)
        ${whereClause}
        ${this.blockService.getBlockFilterSQL(userId, 'c.user_id')}
        ${cursorData ? `AND (c.created_at, c.id) < ($${limitParam - 2}::timestamptz, $${limitParam - 1}::uuid)` : ''}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $${limitParam}
      `;

      params.push(effectiveLimit + 1);

      const result = await this.db.query(query, params);
      const rows = result.rows;

      const hasMore = rows.length > effectiveLimit;
      if (hasMore) rows.pop();

      const data = rows.map((row: any) => mapDbCheckinToCheckin(row));

      // Generate next cursor
      const nextCursor =
        hasMore && data.length > 0
          ? encodeCursor({
              createdAt:
                rows[rows.length - 1].created_at instanceof Date
                  ? rows[rows.length - 1].created_at.toISOString()
                  : rows[rows.length - 1].created_at,
              id: rows[rows.length - 1].id,
            })
          : null;

      return {
        data,
        nextCursor,
        hasMore,
      };
    } catch (error) {
      logger.error('Get activity feed with cursor error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        options,
      });
      throw error;
    }
  }

  // ============================================
  // Legacy Offset Pagination (deprecated, kept for backward compatibility)
  // ============================================

  /**
   * Get activity feed (LEGACY - use getActivityFeedWithCursor instead)
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
            WHERE v.latitude IS NOT NULL
              AND v.longitude IS NOT NULL
              AND (
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
      logger.error('Get activity feed error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get check-ins with filters (LEGACY - use getCheckinsWithCursor instead)
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
      logger.error('Get check-ins error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
      logger.error('Get vibe tags error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
