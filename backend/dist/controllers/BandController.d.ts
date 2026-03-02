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
    createBand: (req: Request, res: Response) => Promise<void>;
    /**
     * Get all bands with search and filters
     * GET /api/bands
     */
    getBands: (req: Request, res: Response) => Promise<void>;
    /**
     * Get band by ID
     * GET /api/bands/:id
     */
    getBandById: (req: Request, res: Response) => Promise<void>;
    /**
     * Update band
     * PUT /api/bands/:id
     * Authorized for admins and claimed owners (claimed_by_user_id match)
     */
    updateBand: (req: Request, res: Response) => Promise<void>;
    /**
     * Delete band
     * DELETE /api/bands/:id
     */
    deleteBand: (req: Request, res: Response) => Promise<void>;
    /**
     * Get popular bands
     * GET /api/bands/popular
     */
    getPopularBands: (req: Request, res: Response) => Promise<void>;
    /**
     * Get trending bands
     * GET /api/bands/trending
     */
    getTrendingBands: (req: Request, res: Response) => Promise<void>;
    /**
     * Get bands by genre
     * GET /api/bands/genre/:genre
     */
    getBandsByGenre: (req: Request, res: Response) => Promise<void>;
    /**
     * Get all genres
     * GET /api/bands/genres
     */
    getGenres: (req: Request, res: Response) => Promise<void>;
    /**
     * Import band from MusicBrainz
     * POST /api/bands/import
     * Body: { musicbrainz_id: string }
     */
    importBand: (req: Request, res: Response) => Promise<void>;
}
//# sourceMappingURL=BandController.d.ts.map