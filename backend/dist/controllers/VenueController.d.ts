/**
 * VenueController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */
import { Request, Response } from 'express';
export declare class VenueController {
    private venueService;
    private setlistFmService;
    private discoveryService;
    private eventService;
    /**
     * Create a new venue
     * POST /api/venues
     */
    createVenue: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get all venues with search and filters
     * GET /api/venues
     */
    getVenues: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get venue by ID
     * GET /api/venues/:id
     */
    getVenueById: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Update venue
     * PUT /api/venues/:id
     * Authorized for admins and claimed owners (claimed_by_user_id match)
     */
    updateVenue: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Delete venue
     * DELETE /api/venues/:id
     * Authorized for admins and claimed owners (claimed_by_user_id match)
     */
    deleteVenue: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get popular venues
     * GET /api/venues/popular
     */
    getPopularVenues: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Get venues near location
     * GET /api/venues/near
     */
    getVenuesNear: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Import venue from setlist.fm
     * POST /api/venues/import
     * Body: { setlistfm_venue_id: string }
     */
    importVenue: (req: Request, res: Response, next: import("express").NextFunction) => void;
}
//# sourceMappingURL=VenueController.d.ts.map