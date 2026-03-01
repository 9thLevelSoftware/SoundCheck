/**
 * CheckinService -- Facade for check-in operations
 *
 * This service delegates to specialized sub-services:
 *   - CheckinQueryService: read operations (getCheckinById, getActivityFeed, etc.)
 *   - CheckinCreatorService: create/delete operations
 *   - CheckinRatingService: rating operations
 *   - CheckinToastService: toast and comment operations
 *
 * Additional functionality (photo upload) is handled directly here.
 */

import Database from '../config/database';
import { r2Service } from './R2Service';
import logger from '../utils/logger';
import {
  CheckinQueryService,
  CheckinCreatorService,
  CheckinRatingService,
  CheckinToastService,
  Checkin,
  VibeTag,
  Toast,
  Comment,
  CreateCheckinRequest,
  CreateEventCheckinRequest,
  AddRatingsRequest,
  GetCheckinsOptions,
} from './checkin';

export class CheckinService {
  private db = Database.getInstance();
  private queryService: CheckinQueryService;
  private creatorService: CheckinCreatorService;
  private ratingService: CheckinRatingService;
  private toastService: CheckinToastService;

  constructor() {
    // Initialize sub-services with getCheckinById callback to avoid circular dependencies
    const getCheckinByIdFn = (checkinId: string, userId?: string) =>
      this.getCheckinById(checkinId, userId);

    this.queryService = new CheckinQueryService();
    this.creatorService = new CheckinCreatorService(getCheckinByIdFn);
    this.ratingService = new CheckinRatingService(getCheckinByIdFn);
    this.toastService = new CheckinToastService();
  }

  // ============================================
  // Query operations (delegate to CheckinQueryService)
  // ============================================

  /**
   * Get check-in by ID with full details.
   */
  async getCheckinById(checkinId: string, currentUserId?: string): Promise<Checkin> {
    return this.queryService.getCheckinById(checkinId, currentUserId);
  }

  /**
   * Get activity feed.
   */
  async getActivityFeed(
    userId: string,
    filter: 'friends' | 'nearby' | 'global' = 'friends',
    options: { limit?: number; offset?: number; latitude?: number; longitude?: number } = {}
  ): Promise<Checkin[]> {
    return this.queryService.getActivityFeed(userId, filter, options);
  }

  /**
   * Get check-ins with filters.
   */
  async getCheckins(options: GetCheckinsOptions = {}): Promise<Checkin[]> {
    return this.queryService.getCheckins(options);
  }

  /**
   * Get all vibe tags.
   */
  async getVibeTags(): Promise<VibeTag[]> {
    return this.queryService.getVibeTags();
  }

  // ============================================
  // Create/Delete operations (delegate to CheckinCreatorService)
  // ============================================

  /**
   * Create an event-first check-in.
   */
  async createEventCheckin(data: CreateEventCheckinRequest): Promise<Checkin> {
    return this.creatorService.createEventCheckin(data);
  }

  /**
   * Create a new check-in (legacy format or event-based).
   */
  async createCheckin(data: CreateCheckinRequest): Promise<Checkin> {
    return this.creatorService.createCheckin(data);
  }

  /**
   * Delete a check-in.
   */
  async deleteCheckin(userId: string, checkinId: string): Promise<void> {
    return this.creatorService.deleteCheckin(userId, checkinId);
  }

  // ============================================
  // Rating operations (delegate to CheckinRatingService)
  // ============================================

  /**
   * Add ratings to an existing check-in.
   */
  async addRatings(checkinId: string, userId: string, ratings: AddRatingsRequest): Promise<Checkin> {
    return this.ratingService.addRatings(checkinId, userId, ratings);
  }

  // ============================================
  // Toast operations (delegate to CheckinToastService)
  // ============================================

  /**
   * Toast a check-in.
   */
  async toastCheckin(userId: string, checkinId: string): Promise<{ toastCount: number; ownerId: string }> {
    return this.toastService.toastCheckin(userId, checkinId);
  }

  /**
   * Untoast a check-in.
   */
  async untoastCheckin(userId: string, checkinId: string): Promise<void> {
    return this.toastService.untoastCheckin(userId, checkinId);
  }

  /**
   * Get toasts for a check-in.
   */
  async getToasts(checkinId: string): Promise<Toast[]> {
    return this.toastService.getToasts(checkinId);
  }

  /**
   * Add a comment to a check-in.
   */
  async addComment(userId: string, checkinId: string, content: string): Promise<Comment> {
    return this.toastService.addComment(userId, checkinId, content);
  }

  /**
   * Get comments for a check-in.
   */
  async getComments(checkinId: string): Promise<Comment[]> {
    return this.toastService.getComments(checkinId);
  }

  /**
   * Delete a comment.
   */
  async deleteComment(userId: string, checkinId: string, commentId: string): Promise<void> {
    return this.toastService.deleteComment(userId, checkinId, commentId);
  }

  // ============================================
  // Vibe tag operations (handled here for now)
  // ============================================

  /**
   * Add vibe tags to a check-in.
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
      logger.error('Add vibe tags error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Get vibe tags for a check-in.
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
      logger.error('Get check-in vibe tags error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  // ============================================
  // Photo upload management
  // ============================================

  /**
   * Request presigned upload URLs for photos.
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
      logger.error('Request photo upload URLs error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }

  /**
   * Confirm photo uploads and store their public URLs in the check-in.
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
      logger.error('Add photos error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      throw error;
    }
  }
}
