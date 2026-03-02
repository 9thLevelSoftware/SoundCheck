import { Venue, CreateVenueRequest, SearchQuery } from '../types';
export declare class VenueService {
    private db;
    /**
     * Create a new venue
     */
    createVenue(venueData: CreateVenueRequest): Promise<Venue>;
    /**
     * Get venue by ID
     */
    getVenueById(venueId: string): Promise<Venue | null>;
    /**
     * Search venues with filters and pagination
     */
    searchVenues(searchQuery: SearchQuery): Promise<{
        venues: Venue[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    /**
     * Update venue
     */
    updateVenue(venueId: string, updateData: Partial<CreateVenueRequest>): Promise<Venue>;
    /**
     * Delete venue (soft delete)
     */
    deleteVenue(venueId: string): Promise<void>;
    /**
     * Get popular venues (by average rating and review count)
     */
    getPopularVenues(limit?: number): Promise<Venue[]>;
    /**
     * Get venues near coordinates
     */
    getVenuesNear(latitude: number, longitude: number, radiusKm?: number, limit?: number): Promise<Venue[]>;
    /**
     * Update venue rating after review
     */
    updateVenueRating(venueId: string): Promise<void>;
    /**
     * Check if a user is the claimed owner of a venue.
     */
    isClaimedOwner(venueId: string, userId: string): Promise<boolean>;
    /**
     * Get aggregate stats for a claimed venue owner.
     * Returns check-in totals, average rating, unique visitors, upcoming events, and popular genres.
     */
    getVenueStats(venueId: string): Promise<{
        totalCheckins: number;
        averageRating: number;
        uniqueVisitors: number;
        upcomingEventsCount: number;
        popularGenres: Array<{
            genre: string;
            count: number;
        }>;
    }>;
    /**
     * Map database venue row to Venue type
     */
    private mapDbVenueToVenue;
    /**
     * Convert camelCase to snake_case
     */
    private camelToSnakeCase;
}
//# sourceMappingURL=VenueService.d.ts.map