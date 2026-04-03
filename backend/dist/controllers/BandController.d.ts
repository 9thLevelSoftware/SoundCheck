/**
 * BandController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */
import { Request, Response } from 'express';
export declare class BandController {
    private bandService;
    private musicBrainzService;
    private discoveryService;
    private eventService;
    /**
     * Create a new band
     * POST /api/bands
     */
    createBand: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get all bands with search and filters
     * GET /api/bands
     */
    getBands: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get band by ID
     * GET /api/bands/:id
     */
    getBandById: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Update band
     * PUT /api/bands/:id
     * Authorized for admins and claimed owners (claimed_by_user_id match)
     */
    updateBand: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Delete band
     * DELETE /api/bands/:id
     * Authorized for admins and claimed owners (claimed_by_user_id match)
     */
    deleteBand: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get popular bands
     * GET /api/bands/popular
     */
    getPopularBands: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get trending bands
     * GET /api/bands/trending
     */
    getTrendingBands: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get bands by genre
     * GET /api/bands/genre/:genre
     */
    getBandsByGenre: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get all genres
     * GET /api/bands/genres
     */
    getGenres: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Import band from MusicBrainz
     * POST /api/bands/import
     * Body: { musicbrainz_id: string }
     */
    importBand: (req: Request, res: Response, next: import("express").NextFunction) => void;
}
//# sourceMappingURL=BandController.d.ts.map