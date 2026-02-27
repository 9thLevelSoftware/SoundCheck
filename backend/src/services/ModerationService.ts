/**
 * ModerationService - Moderation Queue Management
 *
 * Manages the admin moderation queue: creating moderation items,
 * auto-hiding flagged content, paginated queue retrieval, and
 * admin review actions (approve, remove, warn).
 *
 * Phase 9: Trust & Safety Foundation
 */

import Database from '../config/database';
import { ModerationItem, ContentType } from '../types';
import { mapDbRowToModerationItem } from '../utils/dbMappers';
import { logInfo, logWarn } from '../utils/logger';

export class ModerationService {
  private db: Database;

  constructor(db?: Database) {
    this.db = db || Database.getInstance();
  }

  /**
   * Create a new moderation queue item.
   * Called when content is auto-flagged by SafeSearch or manually reported.
   */
  async createModerationItem(data: {
    contentType: ContentType;
    contentId: string;
    source: 'user_report' | 'auto_safesearch';
    reportId?: string;
    safesearchResults?: Record<string, string>;
  }): Promise<ModerationItem> {
    const result = await this.db.query(
      `INSERT INTO moderation_items (content_type, content_id, source, report_id, safesearch_results)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.contentType,
        data.contentId,
        data.source,
        data.reportId || null,
        data.safesearchResults ? JSON.stringify(data.safesearchResults) : null,
      ]
    );

    const item = mapDbRowToModerationItem(result.rows[0]);

    logInfo(`Moderation item created`, {
      itemId: item.id,
      contentType: data.contentType,
      contentId: data.contentId,
      source: data.source,
    });

    return item;
  }

  /**
   * Auto-hide content that has been flagged by SafeSearch or admin action.
   * Sets is_hidden = true on the appropriate table.
   */
  async autoHideContent(contentType: ContentType, contentId: string): Promise<void> {
    switch (contentType) {
      case 'checkin':
      case 'photo':
        // Photos are stored on checkins table
        await this.db.query(
          `UPDATE checkins SET is_hidden = true WHERE id = $1`,
          [contentId]
        );
        break;
      case 'comment':
        await this.db.query(
          `UPDATE checkin_comments SET is_hidden = true WHERE id = $1`,
          [contentId]
        );
        break;
      case 'user':
        // User hiding is handled differently (deactivation), not via is_hidden
        logWarn(`autoHideContent called for user type - skipping`, { contentId });
        return;
      default:
        logWarn(`autoHideContent: unknown content type ${contentType}`, { contentId });
        return;
    }

    logInfo(`Content auto-hidden`, { contentType, contentId });
  }

  /**
   * Unhide content (used when admin approves content).
   */
  private async unhideContent(contentType: ContentType, contentId: string): Promise<void> {
    switch (contentType) {
      case 'checkin':
      case 'photo':
        await this.db.query(
          `UPDATE checkins SET is_hidden = false WHERE id = $1`,
          [contentId]
        );
        break;
      case 'comment':
        await this.db.query(
          `UPDATE checkin_comments SET is_hidden = false WHERE id = $1`,
          [contentId]
        );
        break;
      default:
        break;
    }

    logInfo(`Content unhidden`, { contentType, contentId });
  }

  /**
   * Get pending moderation items with pagination.
   * Returns items ordered by creation date (oldest first).
   */
  async getPendingItems(
    page: number,
    limit: number
  ): Promise<{ items: ModerationItem[]; total: number }> {
    const offset = (page - 1) * limit;

    const [itemsResult, countResult] = await Promise.all([
      this.db.query(
        `SELECT * FROM moderation_items
         WHERE status = 'pending_review'
         ORDER BY created_at ASC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      this.db.query(
        `SELECT COUNT(*) FROM moderation_items WHERE status = 'pending_review'`
      ),
    ]);

    return {
      items: itemsResult.rows.map(mapDbRowToModerationItem),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  /**
   * Admin reviews a moderation item.
   * - 'approved': unhide the content, mark as reviewed
   * - 'removed': keep hidden, update related reports to 'actioned'
   * - 'user_warned': keep hidden, mark as reviewed
   */
  async reviewItem(
    itemId: string,
    adminId: string,
    action: 'approved' | 'removed' | 'user_warned'
  ): Promise<ModerationItem> {
    // Fetch the item first
    const existing = await this.getItemById(itemId);
    if (!existing) {
      throw Object.assign(
        new Error(`Moderation item not found: ${itemId}`),
        { statusCode: 404 }
      );
    }

    // Update the moderation item
    const result = await this.db.query(
      `UPDATE moderation_items
       SET reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP,
           action_taken = $2, status = 'reviewed'
       WHERE id = $3
       RETURNING *`,
      [adminId, action, itemId]
    );

    const item = mapDbRowToModerationItem(result.rows[0]);

    // Handle the action
    if (action === 'approved') {
      // Unhide the content
      await this.unhideContent(item.contentType, item.contentId);
    } else if (action === 'removed') {
      // Content stays hidden; update related reports to 'actioned'
      await this.db.query(
        `UPDATE reports SET status = 'actioned'
         WHERE content_type = $1 AND content_id = $2 AND status = 'pending'`,
        [item.contentType, item.contentId]
      );
    }

    logInfo(`Moderation item reviewed`, {
      itemId: item.id,
      adminId,
      action,
      contentType: item.contentType,
      contentId: item.contentId,
    });

    return item;
  }

  /**
   * Fetch a single moderation item by ID.
   */
  async getItemById(itemId: string): Promise<ModerationItem | null> {
    const result = await this.db.query(
      `SELECT * FROM moderation_items WHERE id = $1`,
      [itemId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapDbRowToModerationItem(result.rows[0]);
  }
}
