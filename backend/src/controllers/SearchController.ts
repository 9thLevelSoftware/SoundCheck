import { Request, Response } from 'express';
import { SearchService } from '../services/SearchService';
import { ApiResponse } from '../types';

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
  search = async (req: Request, res: Response): Promise<void> => {
    try {
      const q = req.query.q as string;

      if (!q || q.trim().length === 0) {
        const response: ApiResponse = {
          success: false,
          error: 'q query parameter is required',
        };
        res.status(400).json(response);
        return;
      }

      // Parse optional types filter
      const validTypes = ['band', 'venue', 'event'] as const;
      let types: ('band' | 'venue' | 'event')[] | undefined;

      if (req.query.types) {
        const rawTypes = (req.query.types as string).split(',').map(t => t.trim().toLowerCase());
        types = rawTypes.filter((t): t is 'band' | 'venue' | 'event' =>
          validTypes.includes(t as any)
        );

        if (types.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: 'Invalid types parameter. Valid values: band, venue, event',
          };
          res.status(400).json(response);
          return;
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
    } catch (error) {
      console.error('Search error:', error);

      const response: ApiResponse = {
        success: false,
        error: 'Failed to perform search',
      };

      res.status(500).json(response);
    }
  };
}
