/**
 * CheckinService -- Facade for check-in operations
 *
 * This service delegates to specialized sub-services:
 *   - CheckinQueryService: read operations (getCheckinById, getActivityFeed, etc.)
 *   - CheckinCreatorService: create/delete operations
 *   - CheckinRatingService: rating operations
 *   - CheckinToastService: toast and comment operations
 *   - CheckinPhotoService: photo upload management
 *
 * @deprecated Use the individual services from './checkin/' directly. This class is maintained
 * for backward compatibility and delegates to the decomposed services.
 */

import {
  CheckinQueryService,
  CheckinCreatorService,
  CheckinRatingService,
  CheckinToastService,
  CheckinPhotoService,
  Checkin,
  VibeTag,
  Toast,
  Comment,
  CreateEventCheckinRequest,
  CreateManualCheckinRequest,
  AddRatingsRequest,
  GetCheckinsOptions,
} from './checkin';

export class CheckinService {
  private queryService: CheckinQueryService;
  private creatorService: CheckinCreatorService;
  private ratingService: CheckinRatingService;
  private toastService: CheckinToastService;
  private photoService: CheckinPhotoService;

  constructor() {
    // Initialize sub-services with getCheckinById callback to avoid circular dependencies
    const getCheckinByIdFn = (checkinId: string, userId?: string) =>
      this.getCheckinById(checkinId, userId);

    this.queryService = new CheckinQueryService();
    this.creatorService = new CheckinCreatorService(getCheckinByIdFn);
    this.ratingService = new CheckinRatingService(getCheckinByIdFn);
    this.toastService = new CheckinToastService();
    this.photoService = new CheckinPhotoService();
  }

  // ============================================
  // Query operations (delegate to CheckinQueryService)
  // ============================================

  /**
   * Get check-in by ID with full details.
   * @deprecated Use CheckinQueryService.getCheckinById() directly
   */
  async getCheckinById(checkinId: string, currentUserId?: string): Promise<Checkin> {
    return this.queryService.getCheckinById(checkinId, currentUserId);
  }

  /**
   * Get activity feed.
   * @deprecated Use CheckinQueryService.getActivityFeed() directly
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
   * @deprecated Use CheckinQueryService.getCheckins() directly
   */
  async getCheckins(options: GetCheckinsOptions = {}): Promise<Checkin[]> {
    return this.queryService.getCheckins(options);
  }

  /**
   * Get all vibe tags.
   * @deprecated Use CheckinQueryService.getVibeTags() directly
   */
  async getVibeTags(): Promise<VibeTag[]> {
    return this.queryService.getVibeTags();
  }

  // ============================================
  // Create/Delete operations (delegate to CheckinCreatorService)
  // ============================================

  /**
   * Create an event-first check-in.
   * @deprecated Use CheckinCreatorService.createEventCheckin() directly
   */
  async createEventCheckin(data: CreateEventCheckinRequest): Promise<Checkin> {
    return this.creatorService.createEventCheckin(data);
  }

  /**
   * Create a manual check-in (band + venue, no event required).
   * Fallback path when user can't find their show in nearby events.
   * @deprecated Use CheckinCreatorService.createManualCheckin() directly
   */
  async createManualCheckin(data: CreateManualCheckinRequest): Promise<Checkin> {
    return this.creatorService.createManualCheckin(data);
  }

  /**
   * Delete a check-in.
   * @deprecated Use CheckinCreatorService.deleteCheckin() directly
   */
  async deleteCheckin(userId: string, checkinId: string): Promise<void> {
    return this.creatorService.deleteCheckin(userId, checkinId);
  }

  // ============================================
  // Rating operations (delegate to CheckinRatingService)
  // ============================================

  /**
   * Add ratings to an existing check-in.
   * @deprecated Use CheckinRatingService.addRatings() directly
   */
  async addRatings(
    checkinId: string,
    userId: string,
    ratings: AddRatingsRequest
  ): Promise<Checkin> {
    return this.ratingService.addRatings(checkinId, userId, ratings);
  }

  // ============================================
  // Toast operations (delegate to CheckinToastService)
  // ============================================

  /**
   * Toast a check-in.
   * @deprecated Use CheckinToastService.toastCheckin() directly
   */
  async toastCheckin(
    userId: string,
    checkinId: string
  ): Promise<{ toastCount: number; ownerId: string }> {
    return this.toastService.toastCheckin(userId, checkinId);
  }

  /**
   * Untoast a check-in.
   * @deprecated Use CheckinToastService.untoastCheckin() directly
   */
  async untoastCheckin(userId: string, checkinId: string): Promise<void> {
    return this.toastService.untoastCheckin(userId, checkinId);
  }

  /**
   * Get toasts for a check-in.
   * @deprecated Use CheckinToastService.getToasts() directly
   */
  async getToasts(checkinId: string): Promise<Toast[]> {
    return this.toastService.getToasts(checkinId);
  }

  /**
   * Add a comment to a check-in.
   * @deprecated Use CheckinToastService.addComment() directly
   */
  async addComment(userId: string, checkinId: string, content: string): Promise<Comment> {
    return this.toastService.addComment(userId, checkinId, content);
  }

  /**
   * Get comments for a check-in.
   * @deprecated Use CheckinToastService.getComments() directly
   */
  async getComments(checkinId: string): Promise<Comment[]> {
    return this.toastService.getComments(checkinId);
  }

  /**
   * Delete a comment.
   * @deprecated Use CheckinToastService.deleteComment() directly
   */
  async deleteComment(userId: string, checkinId: string, commentId: string): Promise<void> {
    return this.toastService.deleteComment(userId, checkinId, commentId);
  }

  // ============================================
  // Vibe tag operations (delegate to CheckinCreatorService via internal call)
  // ============================================

  /**
   * Add vibe tags to a check-in.
   * @deprecated This method is internal - tags are added during checkin creation
   */
  async addVibeTagsToCheckin(_checkinId: string, _vibeTagIds: string[]): Promise<void> {
    // This is now handled internally by CheckinCreatorService
    // Keeping for backward compatibility - no-op
    return Promise.resolve();
  }

  /**
   * Get vibe tags for a check-in.
   * @deprecated Use CheckinQueryService methods that include vibe tags in results
   */
  async getCheckinVibeTags(checkinId: string): Promise<VibeTag[]> {
    // Return from the full checkin query
    const checkin = await this.getCheckinById(checkinId);
    return checkin.vibeTags || [];
  }

  // ============================================
  // Photo upload management (delegate to CheckinPhotoService)
  // ============================================

  /**
   * Request presigned upload URLs for photos.
   * @deprecated Use CheckinPhotoService.requestPhotoUploadUrls() directly
   */
  async requestPhotoUploadUrls(
    checkinId: string,
    userId: string,
    contentTypes: string[]
  ): Promise<{ uploadUrl: string; objectKey: string; publicUrl: string }[]> {
    return this.photoService.requestPhotoUploadUrls(checkinId, userId, contentTypes);
  }

  /**
   * Confirm photo uploads and store their public URLs in the check-in.
   * @deprecated Use CheckinPhotoService.addPhotos() directly, then fetch checkin separately
   */
  async addPhotos(checkinId: string, userId: string, photoKeys: string[]): Promise<Checkin> {
    await this.photoService.addPhotos(checkinId, userId, photoKeys);
    return this.getCheckinById(checkinId, userId);
  }
}
