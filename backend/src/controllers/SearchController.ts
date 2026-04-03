/**
 * SearchController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import { SearchService } from '../services/SearchService';
import { ApiResponse } from '../types';
import { asyncHandler } from '../utils/asyncHandler';
import { BadRequestError } from '../utils/errors';

/**
 * SearchController: HTTP handler for the unified search endpoint.
 *
 * GET /api/search?q=query&types=band,venue,event&limit=10
 *
 * Phase 11 Plan 03: Unified search with tsvector + fuzzy fallback.
 */
export class SearchController {
  private searchService = new SearchService();

  /**
   * Unified search across bands, venues, and events.
   *
   * Query params:
   *   q      - (required) Search query string
   *   types  - (optional) Comma-separated entity types: band,venue,event
   *   limit  - (optional) Max results per type (default 10, max 50)
   */
  search = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const q = req.query.q as string;

    if (!q || q.trim().length === 0) {
      throw new BadRequestError('q query parameter is required');
    }

    // Parse optional types filter
    const validTypes = ['band', 'venue', 'event', 'user'] as const;
    let types: ('band' | 'venue' | 'event' | 'user')[] | undefined;

    if (req.query.types) {
      const rawTypes = (req.query.types as string).split(',').map((t) => t.trim().toLowerCase());
      types = rawTypes.filter((t): t is 'band' | 'venue' | 'event' | 'user' =>
        validTypes.includes(t as any)
      );

      if (types.length === 0) {
        throw new BadRequestError(
          'Invalid types parameter. Valid values: band, venue, event, user'
        );
      }
    }

    // Parse optional limit (default 10, cap at 50)
    let limit = 10;
    if (req.query.limit) {
      const parsed = parseInt(req.query.limit as string);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 50);
      }
    }

    const results = await this.searchService.search(q.trim(), { types, limit });

    const response: ApiResponse = {
      success: true,
      data: results,
    };

    res.status(200).json(response);
  });
}
