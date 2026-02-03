import Database from '../config/database';
import { VenueService } from './VenueService';
import { BandService } from './BandService';
import { EventService } from './EventService';
import { r2Service } from './R2Service';
import { badgeEvalQueue } from '../jobs/badgeQueue';
import { cache } from '../utils/cache';
import { getRedis } from '../utils/redisRateLimiter';
import { notificationQueue } from '../jobs/notificationQueue';

// ============================================
// Interfaces
// ============================================

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
  // Optional: if eventId is present, delegate to createEventCheckin
  eventId?: string;
  locationLat?: number;
  locationLon?: number;
}

interface CreateEventCheckinRequest {
  userId: string;
  eventId: string;
  locationLat?: number;
  locationLon?: number;
  comment?: string;
  vibeTagIds?: string[];
}

interface AddRatingsRequest {
  bandRatings?: { bandId: string; rating: number }[];
  venueRating?: number;
}

interface BandRating {
  bandId: string;
  rating: number;
  bandName?: string;
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
  // New event-model fields (dual-write)
  eventId?: string;
  venueRating?: number;
  reviewText?: string;
  imageUrls?: string[];
  isVerified?: boolean;
  event?: { id: string; eventDate?: Date; eventName?: string };
  bandRatings?: BandRating[];
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

// ============================================
// Venue type radius mapping for location verification
// ============================================

const VENUE_TYPE_RADIUS_KM: Record<string, number> = {
  stadium: 2.0,
  arena: 2.0,
  outdoor: 1.5,
  concert_hall: 0.5,
  theater: 0.5,
  club: 0.3,
  bar: 0.3,
};

const DEFAULT_VENUE_RADIUS_KM = 1.0;

export class CheckinService {
  private db = Database.getInstance();
  private venueService = new VenueService();
  private bandService = new BandService();
  private eventService = new EventService();

  // ============================================
  // Event-first check-in creation (Phase 3)
  // ============================================

  /**
   * Create an event-first check-in.
   * Requires eventId. Performs location verification (non-blocking)
   * and time window validation (with venue timezone).
   * Enforces one check-in per user per event via unique constraint.
   */
  async createEventCheckin(data: CreateEventCheckinRequest): Promise<Checkin> {
    try {
      const { userId, eventId, locationLat, locationLon, comment, vibeTagIds } = data;

      // Validate event exists and is not cancelled, get venue info
      const eventResult = await this.db.query(
        `SELECT e.*, v.latitude as venue_lat, v.longitude as venue_lon,
                v.venue_type, v.timezone, v.id as v_id
         FROM events e
         JOIN venues v ON e.venue_id = v.id
         WHERE e.id = $1 AND e.is_cancelled = FALSE`,
        [eventId]
      );

      if (eventResult.rows.length === 0) {
        const err = new Error('Event not found or cancelled');
        (err as any).statusCode = 404;
        throw err;
      }

      const event = eventResult.rows[0];

      // Validate time window using venue timezone
      if (!this.isWithinTimeWindow(event)) {
        throw new Error('Check-in is not within the event time window');
      }

      // Non-blocking location verification
      const isVerified = this.verifyLocation(
        locationLat,
        locationLon,
        event.venue_lat ? parseFloat(event.venue_lat) : null,
        event.venue_lon ? parseFloat(event.venue_lon) : null,
        event.venue_type
      );

      // Get headliner band_id from event_lineup for backward compat
      const headlinerResult = await this.db.query(
        `SELECT band_id FROM event_lineup
         WHERE event_id = $1
         ORDER BY is_headliner DESC, set_order ASC
         LIMIT 1`,
        [eventId]
      );
      const headlinerBandId = headlinerResult.rows.length > 0
        ? headlinerResult.rows[0].band_id
        : null;

      // INSERT the check-in
      const insertQuery = `
        INSERT INTO checkins (
          user_id, event_id, venue_id, band_id,
          is_verified, review_text, checkin_latitude, checkin_longitude,
          event_date, rating, comment
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      let result;
      try {
        result = await this.db.query(insertQuery, [
          userId,
          eventId,
          event.venue_id,
          headlinerBandId,
          isVerified,
          comment || null,
          locationLat || null,
          locationLon || null,
          event.event_date,
          0,                      // rating starts at 0, set via PATCH /ratings
          comment || null,
        ]);
      } catch (error: any) {
        // Catch unique constraint violation for user+event
        if (error.code === '23505' && error.constraint && error.constraint.includes('user_event')) {
          const dupErr = new Error('You have already checked in to this event');
          (dupErr as any).statusCode = 409;
          throw dupErr;
        }
        throw error;
      }

      const checkinId = result.rows[0].id;

      // Add vibe tags if provided
      if (vibeTagIds && vibeTagIds.length > 0) {
        await this.addVibeTagsToCheckin(checkinId, vibeTagIds);
      }

      // Promote user-created events if organic verification threshold met
      try {
        await this.eventService.promoteIfVerified(eventId);
      } catch (err) {
        console.error('Warning: could not check organic verification:', err);
      }

      // Enqueue async badge evaluation (30-second delay for anti-farming)
      if (badgeEvalQueue) {
        try {
          await badgeEvalQueue.add(
            'evaluate',
            { userId, checkinId },
            {
              delay: 30000,
              jobId: `badge-eval-${userId}-${checkinId}`,
            }
          );
        } catch (err) {
          console.error('Warning: failed to enqueue badge evaluation:', err);
          // Non-fatal -- check-in succeeds even if badge queue fails
        }
      }

      // Fire-and-forget: invalidate feed caches for followers and event
      this.invalidateFeedCachesForCheckin(userId, eventId).catch((err) =>
        console.error('Warning: feed cache invalidation failed:', err)
      );

      // Fire-and-forget: invalidate concert cred stats cache
      cache.del(`stats:concert-cred:${userId}`).catch((err) =>
        console.error('Warning: stats cache invalidation failed:', err)
      );

      // Fire-and-forget: publish to Redis Pub/Sub for WebSocket fan-out
      // and enqueue batched push notifications for followers
      this.publishCheckinAndNotify(
        checkinId,
        userId,
        eventId,
        event.event_name || '',
        event.venue_id,
        result.rows[0].created_at
      ).catch((err) =>
        console.error('Warning: Pub/Sub publish or notification enqueue failed:', err)
      );

      // TODO: Badge-earned push notifications should be triggered from the badge
      // eval worker completion (badgeWorker.ts 'completed' event), not here,
      // since badge evaluation is async with a 30s delay.

      // Return full check-in with details
      return this.getCheckinById(checkinId, userId);
    } catch (error) {
      console.error('Create event check-in error:', error);
      throw error;
    }
  }

  // ============================================
  // Location verification (non-blocking helper)
  // ============================================

  /**
   * Verify user is near the venue using Haversine formula.
   * Returns boolean. Never throws -- non-blocking.
   * Radius varies by venue type (stadiums get larger radius).
   */
  private verifyLocation(
    userLat: number | undefined | null,
    userLon: number | undefined | null,
    venueLat: number | null,
    venueLon: number | null,
    venueType: string | null
  ): boolean {
    // If user didn't share location, can't verify
    if (userLat == null || userLon == null) return false;
    // If venue has no coordinates, can't verify
    if (venueLat == null || venueLon == null) return false;

    const radiusKm = venueType
      ? (VENUE_TYPE_RADIUS_KM[venueType] || DEFAULT_VENUE_RADIUS_KM)
      : DEFAULT_VENUE_RADIUS_KM;

    const distanceKm = this.haversineDistance(userLat, userLon, venueLat, venueLon);
    return distanceKm <= radiusKm;
  }

  /**
   * Haversine distance in kilometers between two lat/lon points.
   * Same formula used by VenueService.getVenuesNear().
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ============================================
  // Time window validation
  // ============================================

  /**
   * Check if current time is within the event's check-in window.
   * Uses venue timezone when available for correct local-time comparison.
   *
   * Window logic:
   *   start: doors_time or (start_time - 2h) or 16:00 (default)
   *   end: (end_time + 1h buffer) or (start_time + 6h) or 23:59
   *
   * If no timezone: allow all day on event_date (generous fallback).
   * If no times at all: allow all day on event_date.
   */
  private isWithinTimeWindow(event: any): boolean {
    try {
      const eventDate = event.event_date; // DATE type from Postgres
      if (!eventDate) return false;

      // Normalize event_date to YYYY-MM-DD string
      const eventDateStr = typeof eventDate === 'string'
        ? eventDate.substring(0, 10)
        : new Date(eventDate).toISOString().substring(0, 10);

      const timezone = event.timezone;

      // Get "now" in the venue's timezone (or UTC if no timezone)
      let nowLocal: Date;
      let todayStr: string;

      if (timezone) {
        try {
          const nowInTz = new Date().toLocaleString('en-US', { timeZone: timezone });
          nowLocal = new Date(nowInTz);
          // Get today's date string in venue timezone
          const parts = new Date().toLocaleDateString('en-CA', { timeZone: timezone }).split('-');
          todayStr = parts.join('-');
        } catch {
          // Invalid timezone -- fall back to UTC
          nowLocal = new Date();
          todayStr = nowLocal.toISOString().substring(0, 10);
        }
      } else {
        nowLocal = new Date();
        todayStr = nowLocal.toISOString().substring(0, 10);
      }

      // If today's date doesn't match event date, disallow
      if (todayStr !== eventDateStr) return false;

      // If no time information at all, allow all-day window
      const doorsTime = event.doors_time;
      const startTime = event.start_time;
      const endTime = event.end_time;

      if (!doorsTime && !startTime && !endTime) {
        return true; // All-day window
      }

      // Parse time helper: converts "HH:MM:SS" or "HH:MM" to minutes since midnight
      const parseTimeToMinutes = (timeStr: string): number => {
        const parts = timeStr.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
      };

      // Current time in minutes since midnight (in venue timezone)
      const nowMinutes = nowLocal.getHours() * 60 + nowLocal.getMinutes();

      // Calculate window start
      let windowStartMinutes: number;
      if (doorsTime) {
        windowStartMinutes = parseTimeToMinutes(doorsTime);
      } else if (startTime) {
        windowStartMinutes = Math.max(0, parseTimeToMinutes(startTime) - 120); // 2 hours before
      } else {
        windowStartMinutes = 16 * 60; // 4:00 PM default
      }

      // Calculate window end
      let windowEndMinutes: number;
      if (endTime) {
        windowEndMinutes = Math.min(24 * 60 - 1, parseTimeToMinutes(endTime) + 60); // 1 hour after
      } else if (startTime) {
        windowEndMinutes = Math.min(24 * 60 - 1, parseTimeToMinutes(startTime) + 360); // 6 hours after
      } else {
        windowEndMinutes = 23 * 60 + 59; // 11:59 PM
      }

      return nowMinutes >= windowStartMinutes && nowMinutes <= windowEndMinutes;
    } catch (error) {
      // On any error, be permissive -- allow the check-in
      console.error('Time window validation error, allowing check-in:', error);
      return true;
    }
  }

  // ============================================
  // Per-set band ratings + venue rating (Phase 3)
  // ============================================

  /**
   * Add ratings to an existing check-in.
   * Supports per-set band ratings and venue rating independently.
   * Ratings must be 0.5-5.0 in 0.5 steps.
   */
  async addRatings(checkinId: string, userId: string, ratings: AddRatingsRequest): Promise<Checkin> {
    try {
      // Verify checkin belongs to userId
      const checkinResult = await this.db.query(
        'SELECT user_id, event_id FROM checkins WHERE id = $1',
        [checkinId]
      );

      if (checkinResult.rows.length === 0) {
        throw new Error('Check-in not found');
      }

      if (checkinResult.rows[0].user_id !== userId) {
        throw new Error('Unauthorized to rate this check-in');
      }

      const eventId = checkinResult.rows[0].event_id;

      // Handle venue rating
      if (ratings.venueRating !== undefined) {
        this.validateRating(ratings.venueRating);
        await this.db.query(
          'UPDATE checkins SET venue_rating = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [ratings.venueRating, checkinId]
        );
      }

      // Handle per-set band ratings
      if (ratings.bandRatings && ratings.bandRatings.length > 0) {
        for (const br of ratings.bandRatings) {
          this.validateRating(br.rating);

          // Verify band is in event lineup (if event-based check-in)
          if (eventId) {
            const lineupCheck = await this.db.query(
              'SELECT 1 FROM event_lineup WHERE event_id = $1 AND band_id = $2',
              [eventId, br.bandId]
            );
            if (lineupCheck.rows.length === 0) {
              throw new Error(`Band ${br.bandId} is not in the event lineup`);
            }
          }

          // Upsert band rating
          await this.db.query(
            `INSERT INTO checkin_band_ratings (checkin_id, band_id, rating)
             VALUES ($1, $2, $3)
             ON CONFLICT (checkin_id, band_id) DO UPDATE SET rating = $3`,
            [checkinId, br.bandId, br.rating]
          );
        }

        // Update the legacy rating column to average of all band ratings for backward compat
        const avgResult = await this.db.query(
          `SELECT AVG(rating) as avg_rating FROM checkin_band_ratings WHERE checkin_id = $1`,
          [checkinId]
        );
        const avgRating = avgResult.rows[0]?.avg_rating
          ? parseFloat(avgResult.rows[0].avg_rating)
          : 0;
        await this.db.query(
          'UPDATE checkins SET rating = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [avgRating, checkinId]
        );
      }

      return this.getCheckinById(checkinId, userId);
    } catch (error) {
      console.error('Add ratings error:', error);
      throw error;
    }
  }

  /**
   * Validate a rating value: must be 0.5-5.0 in 0.5 steps.
   */
  private validateRating(rating: number): void {
    if (rating < 0.5 || rating > 5.0) {
      throw new Error('Rating must be between 0.5 and 5.0');
    }
    if (rating % 0.5 !== 0) {
      throw new Error('Rating must be in 0.5 increments');
    }
  }

  // ============================================
  // Legacy check-in creation (backward compatibility)
  // ============================================

  /**
   * Create a new check-in (legacy format: bandId + venueId).
   * If eventId is present in the request, delegates to createEventCheckin.
   *
   * Dual-write: populates BOTH old columns (band_id, venue_id, rating, comment,
   * photo_url, event_date) AND new columns (event_id, venue_rating, review_text,
   * image_urls, is_verified) in a single INSERT.
   * Also writes to checkin_band_ratings for per-band rating tracking.
   */
  async createCheckin(data: CreateCheckinRequest): Promise<Checkin> {
    try {
      // If eventId is present, delegate to event-first flow
      if (data.eventId) {
        return this.createEventCheckin({
          userId: data.userId,
          eventId: data.eventId,
          locationLat: data.locationLat ?? data.checkinLatitude,
          locationLon: data.locationLon ?? data.checkinLongitude,
          comment: data.comment,
          vibeTagIds: data.vibeTagIds,
        });
      }

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

      // Find or create the event for this venue+band+date (for event_id)
      const resolvedEventDate = eventDate || new Date();
      let eventId: string | null = null;
      try {
        eventId = await this.eventService.findOrCreateEvent(venueId, bandId, resolvedEventDate);
      } catch (err) {
        // Non-fatal: if event creation fails, still create the checkin without event_id
        console.error('Warning: could not find/create event for checkin:', err);
      }

      // Dual-write: populate both old AND new columns
      const insertQuery = `
        INSERT INTO checkins (
          user_id, band_id, venue_id, rating, comment, photo_url,
          event_date, checkin_latitude, checkin_longitude,
          event_id, venue_rating, review_text, image_urls, is_verified
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `;

      const result = await this.db.query(insertQuery, [
        userId,
        bandId,
        venueId,
        rating,
        comment || null,
        photoUrl || null,
        resolvedEventDate,
        checkinLatitude || null,
        checkinLongitude || null,
        eventId,                                    // event_id (new)
        rating,                                     // venue_rating = same as rating (new)
        comment || null,                            // review_text = same as comment (new)
        photoUrl ? [photoUrl] : null,               // image_urls = array of photo (new)
        false,                                      // is_verified = false (new, Phase 3)
      ]);

      const checkinId = result.rows[0].id;

      // Write to checkin_band_ratings for per-band rating tracking
      try {
        await this.db.query(
          `INSERT INTO checkin_band_ratings (checkin_id, band_id, rating)
           VALUES ($1, $2, $3)
           ON CONFLICT (checkin_id, band_id) DO NOTHING`,
          [checkinId, bandId, rating]
        );
      } catch (err) {
        // Non-fatal: band rating write failure should not block checkin creation
        console.error('Warning: could not write checkin_band_rating:', err);
      }

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

      // Fire-and-forget: invalidate feed caches for followers and event
      this.invalidateFeedCachesForCheckin(userId, eventId).catch((err) =>
        console.error('Warning: feed cache invalidation failed:', err)
      );

      // Fire-and-forget: invalidate concert cred stats cache
      cache.del(`stats:concert-cred:${userId}`).catch((err) =>
        console.error('Warning: stats cache invalidation failed:', err)
      );

      // Fire-and-forget: publish to Redis Pub/Sub for WebSocket fan-out (legacy path)
      // and enqueue batched push notifications for followers
      if (eventId) {
        this.publishCheckinAndNotify(
          checkinId,
          userId,
          eventId,
          '', // event name not readily available in legacy path
          venueId,
          result.rows[0].created_at
        ).catch((err) =>
          console.error('Warning: Pub/Sub publish or notification enqueue failed:', err)
        );
      }

      // Return full check-in with details
      return this.getCheckinById(checkinId, userId);
    } catch (error) {
      console.error('Create check-in error:', error);
      throw error;
    }
  }

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
        LEFT JOIN events ev ON c.event_id = ev.id
        LEFT JOIN toasts t ON c.id = t.checkin_id
        LEFT JOIN checkin_comments cm ON c.id = cm.checkin_id
        WHERE c.id = $1
        GROUP BY c.id, u.id, v.id, b.id, ev.id
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

      const checkin = this.mapDbCheckinToCheckin(result.rows[0]);
      checkin.bandRatings = bandRatings.length > 0 ? bandRatings : undefined;

      return checkin;
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
        LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
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

      // Fire-and-forget: invalidate concert cred stats cache
      cache.del(`stats:concert-cred:${userId}`).catch((err) =>
        console.error('Warning: stats cache invalidation failed:', err)
      );
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

  // ============================================
  // Photo upload management (Phase 3, Plan 3)
  // ============================================

  /**
   * Request presigned upload URLs for photos.
   * Client uses these to PUT directly to R2 (never proxied through Railway).
   *
   * @param checkinId - Check-in to attach photos to
   * @param userId - Must match check-in owner
   * @param contentTypes - Array of MIME types for each photo
   * @returns Array of { uploadUrl, objectKey, publicUrl }
   */
  async requestPhotoUploadUrls(
    checkinId: string,
    userId: string,
    contentTypes: string[]
  ): Promise<{ uploadUrl: string; objectKey: string; publicUrl: string }[]> {
    try {
      // Verify checkin belongs to user
      const checkinResult = await this.db.query(
        'SELECT user_id, image_urls FROM checkins WHERE id = $1',
        [checkinId]
      );

      if (checkinResult.rows.length === 0) {
        const err = new Error('Check-in not found');
        (err as any).statusCode = 404;
        throw err;
      }

      if (checkinResult.rows[0].user_id !== userId) {
        const err = new Error('Unauthorized to modify this check-in');
        (err as any).statusCode = 403;
        throw err;
      }

      // Check existing photo count + requested count <= 4
      const existingUrls: string[] = checkinResult.rows[0].image_urls || [];
      const totalAfter = existingUrls.length + contentTypes.length;
      if (totalAfter > 4) {
        const err = new Error(
          `Maximum 4 photos per check-in. Currently ${existingUrls.length}, requesting ${contentTypes.length}.`
        );
        (err as any).statusCode = 400;
        throw err;
      }

      // Generate presigned URLs for each content type
      const results = await Promise.all(
        contentTypes.map((ct) =>
          r2Service.getPresignedUploadUrl(ct, `checkins/${checkinId}`)
        )
      );

      return results;
    } catch (error) {
      console.error('Request photo upload URLs error:', error);
      throw error;
    }
  }

  /**
   * Confirm photo uploads and store their public URLs in the check-in.
   * Called after client has successfully PUT files to R2 via presigned URLs.
   *
   * @param checkinId - Check-in to attach photos to
   * @param userId - Must match check-in owner
   * @param photoKeys - Array of R2 object keys that were uploaded
   * @returns Updated check-in
   */
  async addPhotos(
    checkinId: string,
    userId: string,
    photoKeys: string[]
  ): Promise<Checkin> {
    try {
      // Verify checkin belongs to user
      const checkinResult = await this.db.query(
        'SELECT user_id, image_urls FROM checkins WHERE id = $1',
        [checkinId]
      );

      if (checkinResult.rows.length === 0) {
        const err = new Error('Check-in not found');
        (err as any).statusCode = 404;
        throw err;
      }

      if (checkinResult.rows[0].user_id !== userId) {
        const err = new Error('Unauthorized to modify this check-in');
        (err as any).statusCode = 403;
        throw err;
      }

      // Combine existing URLs with new ones, enforce max 4
      const existingUrls: string[] = checkinResult.rows[0].image_urls || [];
      const publicUrl = process.env.R2_PUBLIC_URL || '';
      const newUrls = photoKeys.map((key) => `${publicUrl}/${key}`);
      const combinedUrls = [...existingUrls, ...newUrls];

      if (combinedUrls.length > 4) {
        const err = new Error(
          `Maximum 4 photos per check-in. Would have ${combinedUrls.length}.`
        );
        (err as any).statusCode = 400;
        throw err;
      }

      // Update the check-in with combined URLs
      await this.db.query(
        'UPDATE checkins SET image_urls = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [combinedUrls, checkinId]
      );

      return this.getCheckinById(checkinId, userId);
    } catch (error) {
      console.error('Add photos error:', error);
      throw error;
    }
  }

  // ============================================
  // Real-time Pub/Sub publish + notification enqueue (Phase 5, Plan 2)
  // ============================================

  /**
   * Publish a new check-in event to Redis Pub/Sub for WebSocket fan-out
   * AND enqueue batched push notifications for each follower.
   *
   * Queries follower IDs once, then:
   * 1. Publishes structured payload to 'checkin:new' Pub/Sub channel
   * 2. For each follower, RPUSHes to their notification batch Redis list
   *    and enqueues a delayed BullMQ job (2-minute batching window)
   *
   * Fire-and-forget: errors are logged but never block check-in response.
   */
  private async publishCheckinAndNotify(
    checkinId: string,
    userId: string,
    eventId: string,
    eventName: string,
    venueId: string,
    createdAt: string
  ): Promise<void> {
    try {
      const redis = getRedis();
      if (!redis) return;

      // Query follower IDs and user info in parallel
      const [followerResult, userResult, venueResult] = await Promise.all([
        this.db.query(
          'SELECT follower_id FROM user_followers WHERE following_id = $1',
          [userId]
        ),
        this.db.query(
          'SELECT username, profile_image_url FROM users WHERE id = $1',
          [userId]
        ),
        this.db.query(
          'SELECT name FROM venues WHERE id = $1',
          [venueId]
        ),
      ]);

      const followerIds = followerResult.rows.map((r: any) => r.follower_id);
      if (followerIds.length === 0) return;

      const username = userResult.rows[0]?.username || '';
      const userAvatarUrl = userResult.rows[0]?.profile_image_url || null;
      const venueName = venueResult.rows[0]?.name || '';

      // 1. Publish to Redis Pub/Sub for WebSocket fan-out
      const pubSubPayload = {
        type: 'new_checkin',
        checkin: {
          id: checkinId,
          checkinId,
          userId,
          username,
          userAvatarUrl,
          eventId,
          eventName: eventName || '',
          venueName,
          photoUrl: null,
          createdAt,
          hasBadgeEarned: false,
          toastCount: 0,
          commentCount: 0,
          hasUserToasted: false,
        },
        followerIds,
        eventId,
      };

      await redis.publish('checkin:new', JSON.stringify(pubSubPayload));

      // 2. Enqueue batched push notifications for each follower
      const notifData = JSON.stringify({
        username: username || 'Someone',
        eventName: eventName || 'a show',
        venueName: venueName || '',
      });

      for (const followerId of followerIds) {
        try {
          const listKey = `notif:batch:${followerId}`;
          await redis.rpush(listKey, notifData);
          await redis.expire(listKey, 300); // 5-minute safety TTL

          // Enqueue delayed job with dedup (one per user per batching window)
          if (notificationQueue) {
            await notificationQueue.add('send-batch', { userId: followerId }, {
              delay: 120_000, // 2-minute batching window
              jobId: `notif-batch:${followerId}`, // dedup: one job per user per window
            });
          }
        } catch (err) {
          // Non-fatal per follower -- continue with others
          console.error(`Warning: notification enqueue failed for follower ${followerId}:`, err);
        }
      }
    } catch (error) {
      console.error('Pub/Sub publish + notification enqueue error:', error);
      // Non-fatal: do not rethrow
    }
  }

  // ============================================
  // Feed cache invalidation (Phase 5)
  // ============================================

  /**
   * Invalidate feed caches after a check-in is created.
   * Clears friends feed cache for all followers of the creator,
   * event feed cache, and happening-now cache.
   * Fire-and-forget: errors are logged but never block check-in response.
   */
  private async invalidateFeedCachesForCheckin(userId: string, eventId: string | null): Promise<void> {
    try {
      // Get follower IDs of the check-in creator
      const followerResult = await this.db.query(
        'SELECT follower_id FROM user_followers WHERE following_id = $1',
        [userId]
      );

      const followerIds: string[] = followerResult.rows.map((r: any) => r.follower_id);

      // Invalidate friends feed + happening_now cache for each follower
      const invalidations: Promise<void>[] = [];
      for (const followerId of followerIds) {
        invalidations.push(cache.delPattern(`feed:friends:${followerId}:*`));
        invalidations.push(cache.del(`feed:happening:${followerId}`));
      }

      // Invalidate event feed cache
      if (eventId) {
        invalidations.push(cache.delPattern(`feed:event:${eventId}:*`));
      }

      // Invalidate the creator's own caches (they may see their own check-in in event feed)
      invalidations.push(cache.delPattern(`feed:friends:${userId}:*`));
      invalidations.push(cache.del(`feed:happening:${userId}`));

      await Promise.all(invalidations);
    } catch (error) {
      console.error('Feed cache invalidation error:', error);
      // Non-fatal: do not rethrow
    }
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
      // New event-model fields
      eventId: row.event_id || undefined,
      venueRating: row.venue_rating ? parseFloat(row.venue_rating) : undefined,
      reviewText: row.review_text || undefined,
      imageUrls: row.image_urls || undefined,
      isVerified: row.is_verified || false,
      event: row.event_id ? {
        id: row.event_id,
        eventDate: row.ev_event_date,
        eventName: row.ev_event_name,
      } : undefined,
    };
  }
}
