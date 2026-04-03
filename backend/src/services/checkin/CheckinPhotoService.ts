/**
 * CheckinPhotoService -- Photo upload management for check-ins
 *
 * Extracted from CheckinService as part of P1 service decomposition.
 * Handles:
 *   - Requesting presigned upload URLs for photos
 *   - Confirming photo uploads and storing public URLs
 *   - Photo validation and limits
 */

import Database from '../../config/database';
import { r2Service } from '../R2Service';
import logger from '../../utils/logger';

export interface PhotoUploadUrl {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
}

export interface PhotoUploadRequest {
  checkinId: string;
  userId: string;
  contentTypes: string[];
}

export interface PhotoConfirmationRequest {
  checkinId: string;
  userId: string;
  photoKeys: string[];
}

export class CheckinPhotoService {
  private db = Database.getInstance();

  /**
   * Maximum photos allowed per check-in
   */
  readonly MAX_PHOTOS_PER_CHECKIN = 4;

  /**
   * Request presigned upload URLs for photos.
   * Validates that the checkin belongs to the user and enforces max photo count.
   */
  async requestPhotoUploadUrls(
    checkinId: string,
    userId: string,
    contentTypes: string[]
  ): Promise<PhotoUploadUrl[]> {
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

      // Check existing photo count + requested count <= max
      const existingUrls: string[] = checkinResult.rows[0].image_urls || [];
      const totalAfter = existingUrls.length + contentTypes.length;
      if (totalAfter > this.MAX_PHOTOS_PER_CHECKIN) {
        const err = new Error(
          `Maximum ${this.MAX_PHOTOS_PER_CHECKIN} photos per check-in. Currently ${existingUrls.length}, requesting ${contentTypes.length}.`
        );
        (err as any).statusCode = 400;
        throw err;
      }

      // Generate presigned URLs for each content type
      const results = await Promise.all(
        contentTypes.map((ct) => r2Service.getPresignedUploadUrl(ct, `checkins/${checkinId}`))
      );

      return results.map((result) => ({
        uploadUrl: result.uploadUrl,
        objectKey: result.objectKey,
        publicUrl: result.publicUrl,
      }));
    } catch (error) {
      logger.error('[CheckinPhotoService] Request photo upload URLs error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Confirm photo uploads and store their public URLs in the check-in.
   * Combines existing URLs with new ones and enforces max photo count.
   */
  async addPhotos(
    checkinId: string,
    userId: string,
    photoKeys: string[]
  ): Promise<string[]> {
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

      // Combine existing URLs with new ones, enforce max
      const existingUrls: string[] = checkinResult.rows[0].image_urls || [];
      const publicUrlBase = process.env.R2_PUBLIC_URL || '';
      const newUrls = photoKeys.map((key) => `${publicUrlBase}/${key}`);
      const combinedUrls = [...existingUrls, ...newUrls];

      if (combinedUrls.length > this.MAX_PHOTOS_PER_CHECKIN) {
        const err = new Error(
          `Maximum ${this.MAX_PHOTOS_PER_CHECKIN} photos per check-in. Would have ${combinedUrls.length}.`
        );
        (err as any).statusCode = 400;
        throw err;
      }

      // Update the check-in with combined URLs
      await this.db.query(
        'UPDATE checkins SET image_urls = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [combinedUrls, checkinId]
      );

      return combinedUrls;
    } catch (error) {
      logger.error('[CheckinPhotoService] Add photos error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get photos for a check-in
   */
  async getPhotos(checkinId: string): Promise<string[]> {
    try {
      const result = await this.db.query(
        'SELECT image_urls FROM checkins WHERE id = $1',
        [checkinId]
      );

      if (result.rows.length === 0) {
        return [];
      }

      return result.rows[0].image_urls || [];
    } catch (error) {
      logger.error('[CheckinPhotoService] Get photos error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return [];
    }
  }

  /**
   * Delete photos from a check-in (admin/rollback function)
   */
  async deletePhotos(checkinId: string, userId: string, photoUrlsToRemove: string[]): Promise<string[]> {
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

      const existingUrls: string[] = checkinResult.rows[0].image_urls || [];
      const remainingUrls = existingUrls.filter((url) => !photoUrlsToRemove.includes(url));

      // Update the check-in with remaining URLs
      await this.db.query(
        'UPDATE checkins SET image_urls = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [remainingUrls, checkinId]
      );

      return remainingUrls;
    } catch (error) {
      logger.error('[CheckinPhotoService] Delete photos error', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Check how many photos can still be added to a check-in
   */
  async getRemainingPhotoSlots(checkinId: string): Promise<number> {
    try {
      const result = await this.db.query(
        'SELECT image_urls FROM checkins WHERE id = $1',
        [checkinId]
      );

      if (result.rows.length === 0) {
        return 0;
      }

      const existingUrls: string[] = result.rows[0].image_urls || [];
      return Math.max(0, this.MAX_PHOTOS_PER_CHECKIN - existingUrls.length);
    } catch (error) {
      logger.error('[CheckinPhotoService] Get remaining slots error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}
