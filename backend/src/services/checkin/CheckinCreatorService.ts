/**
 * CheckinCreatorService -- Check-in creation and deletion
 *
 * Extracted from CheckinService as part of v1-launch tech debt cleanup.
 * Handles:
 *   - createCheckin() -- legacy format (bandId + venueId)
 *   - createEventCheckin() -- event-first format
 *   - deleteCheckin()
 *   - Location verification helpers
 *   - Time window validation
 */

import Database from '../../config/database';
import { VenueService } from '../VenueService';
import { BandService } from '../BandService';
import { EventService } from '../EventService';
import { badgeEvalQueue } from '../../jobs/badgeQueue';
import { cache, CacheKeys } from '../../utils/cache';
import { getRedis } from '../../utils/redisRateLimiter';
import { notificationQueue } from '../../jobs/notificationQueue';
import {
  Checkin,
  CreateCheckinRequest,
  CreateEventCheckinRequest,
  mapDbCheckinToCheckin,
} from './types';
import logger from '../../utils/logger';

// Venue type radius mapping for location verification
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

export class CheckinCreatorService {
  private db = Database.getInstance();
  private venueService = new VenueService();
  private bandService = new BandService();
  private eventService = new EventService();

  // Callback to get check-in by ID (injected by facade to avoid circular dependency)
  private getCheckinByIdFn: (checkinId: string, userId?: string) => Promise<Checkin>;

  constructor(getCheckinByIdFn: (checkinId: string, userId?: string) => Promise<Checkin>) {
    this.getCheckinByIdFn = getCheckinByIdFn;
  }

  // ============================================
  // Event-first check-in creation
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
        logger.debug('Warning: could not check organic verification', { error: err instanceof Error ? err.message : String(err) });
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
          logger.debug('Warning: failed to enqueue badge evaluation', { error: err instanceof Error ? err.message : String(err) });
          // Non-fatal -- check-in succeeds even if badge queue fails
        }
      }

      // Fire-and-forget: invalidate feed caches for followers and event
      this.invalidateFeedCachesForCheckin(userId, eventId).catch((err) =>
        logger.debug('Warning: feed cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
      );

      // Fire-and-forget: invalidate concert cred stats cache
      cache.del(`stats:concert-cred:${userId}`).catch((err) =>
        logger.debug('Warning: stats cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
      );

      // Fire-and-forget: invalidate recommendation cache (new check-in changes genre affinity + excludes event)
      cache.del(CacheKeys.recommendations(userId)).catch((err) =>
        logger.debug('Warning: recommendations cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
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
        logger.debug('Warning: Pub/Sub publish or notification enqueue failed', { error: err instanceof Error ? err.message : String(err) })
      );

      // Return full check-in with details
      return this.getCheckinByIdFn(checkinId, userId);
    } catch (error) {
      logger.error('Create event check-in error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
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
        logger.debug('Warning: could not find/create event for checkin', { error: err instanceof Error ? err.message : String(err) });
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
        logger.debug('Warning: could not write checkin_band_rating', { error: err instanceof Error ? err.message : String(err) });
      }

      // Add vibe tags if provided
      if (vibeTagIds && vibeTagIds.length > 0) {
        await this.addVibeTagsToCheckin(checkinId, vibeTagIds);
      }

      // Update venue and band ratings asynchronously (triggers handle stats)
      this.venueService.updateVenueRating(venueId).catch(err =>
        logger.debug('Error updating venue rating', { error: err instanceof Error ? err.message : String(err) })
      );
      this.bandService.updateBandRating(bandId).catch(err =>
        logger.debug('Error updating band rating', { error: err instanceof Error ? err.message : String(err) })
      );

      // Fire-and-forget: invalidate feed caches for followers and event
      this.invalidateFeedCachesForCheckin(userId, eventId).catch((err) =>
        logger.debug('Warning: feed cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
      );

      // Fire-and-forget: invalidate concert cred stats cache
      cache.del(`stats:concert-cred:${userId}`).catch((err) =>
        logger.debug('Warning: stats cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
      );

      // Fire-and-forget: invalidate recommendation cache (new check-in changes genre affinity + excludes event)
      cache.del(CacheKeys.recommendations(userId)).catch((err) =>
        logger.debug('Warning: recommendations cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
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
          logger.debug('Warning: Pub/Sub publish or notification enqueue failed', { error: err instanceof Error ? err.message : String(err) })
        );
      }

      // Return full check-in with details
      return this.getCheckinByIdFn(checkinId, userId);
    } catch (error) {
      logger.error('Create check-in error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  // ============================================
  // Delete check-in
  // ============================================

  /**
   * Delete a check-in
   */
  async deleteCheckin(userId: string, checkinId: string): Promise<void> {
    try {
      // Verify user owns the check-in and get venue/band info for cache invalidation
      const checkin = await this.db.query(
        'SELECT user_id, venue_id FROM checkins WHERE id = $1',
        [checkinId]
      );

      if (checkin.rows.length === 0) {
        throw new Error('Check-in not found');
      }

      if (checkin.rows[0].user_id !== userId) {
        throw new Error('Unauthorized to delete this check-in');
      }

      const venueId = checkin.rows[0].venue_id;

      // Get band IDs from band ratings for cache invalidation before deletion
      const bandRatingsResult = await this.db.query(
        'SELECT DISTINCT band_id FROM checkin_band_ratings WHERE checkin_id = $1',
        [checkinId]
      );
      const bandIds: string[] = bandRatingsResult.rows.map((r: any) => r.band_id);

      // Delete check-in (cascades to toasts and comments)
      await this.db.query('DELETE FROM checkins WHERE id = $1', [checkinId]);

      // Fire-and-forget: invalidate concert cred stats cache
      cache.del(`stats:concert-cred:${userId}`).catch((err) =>
        logger.debug('Warning: stats cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
      );

      // Fire-and-forget: invalidate recommendation cache (deleted check-in changes genre affinity)
      cache.del(CacheKeys.recommendations(userId)).catch((err) =>
        logger.debug('Warning: recommendations cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
      );

      // Fire-and-forget: invalidate band aggregate caches
      for (const bandId of bandIds) {
        cache.del(CacheKeys.bandAggregate(bandId)).catch((err) =>
          logger.debug('Warning: band aggregate cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
        );
      }

      // Fire-and-forget: invalidate venue aggregate cache
      if (venueId) {
        cache.del(CacheKeys.venueAggregate(venueId)).catch((err) =>
          logger.debug('Warning: venue aggregate cache invalidation failed', { error: err instanceof Error ? err.message : String(err) })
        );
      }
    } catch (error) {
      logger.error('Delete check-in error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
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
      logger.debug('Time window validation error, allowing check-in', { error: error instanceof Error ? error.message : String(error) });
      return true;
    }
  }

  // ============================================
  // Helper methods
  // ============================================

  /**
   * Add vibe tags to a check-in
   */
  private async addVibeTagsToCheckin(checkinId: string, vibeTagIds: string[]): Promise<void> {
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
      logger.error('Add vibe tags error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

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
      logger.error('Feed cache invalidation error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      // Non-fatal: do not rethrow
    }
  }

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
          logger.debug(`Warning: notification enqueue failed for follower ${followerId}`, { error: err instanceof Error ? err.message : String(err) });
        }
      }
    } catch (error) {
      logger.error('Pub/Sub publish + notification enqueue error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      // Non-fatal: do not rethrow
    }
  }
}
