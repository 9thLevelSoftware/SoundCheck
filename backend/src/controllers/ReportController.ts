/**
 * ReportController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

/**
 * ReportController - HTTP Handlers for Report and Moderation Endpoints
 *
 * Handles report submission (with rate limiting) and admin moderation
 * queue operations (list pending, review items).
 *
 * Phase 9: Trust & Safety Foundation
 */

import { Request, Response } from 'express';
import { ReportService } from '../services/ReportService';
import { ModerationService } from '../services/ModerationService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, RateLimitError } from '../utils/errors';

export class ReportController {
  private reportService = new ReportService();
  private moderationService = new ModerationService();

  /**
   * Create a new content report.
   * POST /api/reports
   *
   * Rate limited to 10 reports per user per day.
   * Deduplication handled by ReportService (UNIQUE constraint).
   */
  createReport = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;

    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    // Check rate limit: max 10 reports per user per day
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const reportCount = await this.reportService.getUserReportCount(userId, twentyFourHoursAgo);

    if (reportCount >= 10) {
      throw new RateLimitError('Report limit reached. You can submit up to 10 reports per day.');
    }

    const { contentType, contentId, reason, description } = req.body;

    const report = await this.reportService.createReport(userId, {
      contentType,
      contentId,
      reason,
      description,
    });

    const response: ApiResponse = {
      success: true,
      data: report,
      message: 'Report submitted successfully. Our team will review it shortly.',
    };
    res.status(201).json(response);
  });

  /**
   * Get the moderation queue (admin only).
   * GET /api/admin/moderation
   *
   * Query params: page (default 1), limit (default 20)
   */
  getModerationQueue = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const result = await this.moderationService.getPendingItems(page, limit);

    const response: ApiResponse = {
      success: true,
      data: result.items,
      pagination: {
        limit,
        offset: (page - 1) * limit,
        hasMore: page * limit < result.total,
        total: result.total,
      },
    };
    res.status(200).json(response);
  });

  /**
   * Review a moderation item (admin only).
   * PATCH /api/admin/moderation/:itemId
   *
   * Body: { action: 'approved' | 'removed' | 'user_warned', notes?: string }
   */
  reviewModerationItem = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const adminId = req.user?.id;

    if (!adminId) {
      throw new UnauthorizedError('Authentication required');
    }

    const { itemId } = req.params;
    const { action } = req.body;

    const item = await this.moderationService.reviewItem(itemId, adminId, action);

    const response: ApiResponse = {
      success: true,
      data: item,
      message: `Content ${action} successfully`,
    };
    res.status(200).json(response);
  });
}
