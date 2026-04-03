import { VenueService } from '../../services/VenueService';
import Database from '../../config/database';

// Mock dependencies
jest.mock('../../config/database');

const mockDb = {
  query: jest.fn(),
  getClient: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('VenueService', () => {
  let venueService: VenueService;

  beforeEach(() => {
    venueService = new VenueService();
    jest.clearAllMocks();
  });

  describe('getVenueById', () => {
    it('should return venue with stats when found', async () => {
      const mockVenue = {
        id: 'venue-123',
        name: 'Test Venue',
        description: 'A great venue for concerts',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        country: 'USA',
        postal_code: '10001',
        latitude: '40.7128',
        longitude: '-74.0060',
        website_url: 'https://testvenue.com',
        phone: '555-1234',
        email: 'info@testvenue.com',
        capacity: 500,
        venue_type: 'concert_hall',
        image_url: 'https://example.com/venue.jpg',
        average_rating: '4.5',
        total_checkins: '150',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockVenue] });

      const result = await venueService.getVenueById('venue-123');

      expect(result).toEqual({
        id: 'venue-123',
        name: 'Test Venue',
        description: 'A great venue for concerts',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        country: 'USA',
        postalCode: '10001',
        latitude: 40.7128,
        longitude: -74.006,
        websiteUrl: 'https://testvenue.com',
        phone: '555-1234',
        email: 'info@testvenue.com',
        capacity: 500,
        venueType: 'concert_hall',
        imageUrl: 'https://example.com/venue.jpg',
        coverImageUrl: null,
        averageRating: 4.5,
        totalCheckins: 150,
        isActive: true,
        claimedByUserId: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['venue-123']
      );
    });

    it('should return null when venue not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await venueService.getVenueById('non-existent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(venueService.getVenueById('venue-123')).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('searchVenues', () => {
    it('should search venues with text query', async () => {
      const mockVenue = {
        id: 'venue-123',
        name: 'Madison Square Garden',
        description: 'Famous arena',
        address: '4 Pennsylvania Plaza',
        city: 'New York',
        state: 'NY',
        country: 'USA',
        postal_code: '10001',
        latitude: null,
        longitude: null,
        website_url: null,
        phone: null,
        email: null,
        capacity: 20000,
        venue_type: 'arena',
        image_url: null,
        average_rating: '4.8',
        total_checkins: '5000',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] }) // count query
        .mockResolvedValueOnce({ rows: [mockVenue] }); // main query

      const result = await venueService.searchVenues({ q: 'Madison', page: 1, limit: 20 });

      expect(result.venues).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.venues[0].name).toBe('Madison Square Garden');
    });

    it('should filter venues by city', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await venueService.searchVenues({ city: 'Los Angeles' });

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const [, params] = mockDb.query.mock.calls[1];
      expect(params).toContain('%Los Angeles%');
    });

    it('should filter venues by venue type', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await venueService.searchVenues({ venueType: 'club' });

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const [, params] = mockDb.query.mock.calls[1];
      expect(params).toContain('club');
    });

    it('should filter venues by minimum rating', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await venueService.searchVenues({ rating: 4.0 });

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const [, params] = mockDb.query.mock.calls[1];
      expect(params).toContain(4.0);
    });

    it('should handle pagination correctly', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await venueService.searchVenues({ page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.totalPages).toBe(10);
    });

    it('should use default sort by name ascending', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await venueService.searchVenues({});

      const [mainQuery] = mockDb.query.mock.calls[1];
      expect(mainQuery).toContain('ORDER BY name ASC');
    });

    it('should handle descending sort order', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await venueService.searchVenues({ sort: 'average_rating', order: 'desc' });

      const [mainQuery] = mockDb.query.mock.calls[1];
      expect(mainQuery).toContain('ORDER BY average_rating DESC');
    });

    it('should return empty array when no venues match', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await venueService.searchVenues({ q: 'NonExistentVenue' });

      expect(result.venues).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('createVenue', () => {
    it('should create a new venue successfully', async () => {
      const venueData = {
        name: 'The Fillmore',
        description: 'Historic music venue',
        address: '1805 Geary Blvd',
        city: 'San Francisco',
        state: 'CA',
        country: 'USA',
        postalCode: '94115',
        latitude: 37.784,
        longitude: -122.433,
        websiteUrl: 'https://thefillmore.com',
        phone: '415-346-6000',
        email: 'info@thefillmore.com',
        capacity: 1190,
        venueType: 'concert_hall' as const,
        imageUrl: 'https://example.com/fillmore.jpg',
      };

      const mockCreatedVenue = {
        id: 'venue-new',
        name: venueData.name,
        description: venueData.description,
        address: venueData.address,
        city: venueData.city,
        state: venueData.state,
        country: venueData.country,
        postal_code: venueData.postalCode,
        latitude: venueData.latitude.toString(),
        longitude: venueData.longitude.toString(),
        website_url: venueData.websiteUrl,
        phone: venueData.phone,
        email: venueData.email,
        capacity: venueData.capacity,
        venue_type: venueData.venueType,
        image_url: venueData.imageUrl,
        average_rating: '0',
        total_checkins: '0',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-20T00:00:00Z',
        updated_at: '2024-01-20T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockCreatedVenue] });

      const result = await venueService.createVenue(venueData);

      expect(result.id).toBe('venue-new');
      expect(result.name).toBe('The Fillmore');
      expect(result.averageRating).toBe(0);
      expect(result.totalCheckins).toBe(0);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO venues'),
        expect.arrayContaining([
          'The Fillmore',
          'Historic music venue',
          '1805 Geary Blvd',
          'San Francisco',
          'CA',
          'USA',
          '94115',
          37.784,
          -122.433,
          'https://thefillmore.com',
          '415-346-6000',
          'info@thefillmore.com',
          1190,
          'concert_hall',
          'https://example.com/fillmore.jpg',
        ])
      );
    });

    it('should handle optional fields as null', async () => {
      const venueData = {
        name: 'Simple Venue',
      };

      const mockCreatedVenue = {
        id: 'venue-simple',
        name: 'Simple Venue',
        description: null,
        address: null,
        city: null,
        state: null,
        country: null,
        postal_code: null,
        latitude: null,
        longitude: null,
        website_url: null,
        phone: null,
        email: null,
        capacity: null,
        venue_type: null,
        image_url: null,
        average_rating: '0',
        total_checkins: '0',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-20T00:00:00Z',
        updated_at: '2024-01-20T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockCreatedVenue] });

      const result = await venueService.createVenue(venueData);

      expect(result.name).toBe('Simple Venue');
      expect(result.description).toBeNull();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO venues'),
        expect.arrayContaining([
          'Simple Venue',
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ])
      );
    });

    it('should handle database errors during creation', async () => {
      const venueData = { name: 'Test Venue' };

      mockDb.query.mockRejectedValueOnce(new Error('Unique constraint violation'));

      await expect(venueService.createVenue(venueData)).rejects.toThrow(
        'Unique constraint violation'
      );
    });
  });

  describe('updateVenue', () => {
    it('should update venue with partial data', async () => {
      const updateData = {
        description: 'Updated description',
        capacity: 2000,
      };

      const mockUpdatedVenue = {
        id: 'venue-123',
        name: 'Test Venue',
        description: 'Updated description',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        country: 'USA',
        postal_code: '10001',
        latitude: null,
        longitude: null,
        website_url: null,
        phone: null,
        email: null,
        capacity: 2000,
        venue_type: null,
        image_url: null,
        average_rating: '4.5',
        total_checkins: '150',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-25T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockUpdatedVenue] });

      const result = await venueService.updateVenue('venue-123', updateData);

      expect(result.description).toBe('Updated description');
      expect(result.capacity).toBe(2000);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE venues'),
        expect.arrayContaining(['Updated description', 2000, 'venue-123'])
      );
    });

    it('should throw error when no valid fields to update', async () => {
      await expect(venueService.updateVenue('venue-123', {})).rejects.toThrow(
        'No valid fields to update'
      );
    });

    it('should throw error when venue not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        venueService.updateVenue('non-existent', { name: 'New Name' })
      ).rejects.toThrow('Venue not found or inactive');
    });

    it('should ignore undefined values in update data', async () => {
      const updateData = {
        name: 'New Name',
        description: undefined,
        capacity: undefined,
      };

      const mockUpdatedVenue = {
        id: 'venue-123',
        name: 'New Name',
        description: null,
        address: null,
        city: null,
        state: null,
        country: null,
        postal_code: null,
        latitude: null,
        longitude: null,
        website_url: null,
        phone: null,
        email: null,
        capacity: null,
        venue_type: null,
        image_url: null,
        average_rating: '4.5',
        total_checkins: '150',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-25T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockUpdatedVenue] });

      await venueService.updateVenue('venue-123', updateData);

      // Should only include 'name' in the update, not description or capacity
      const [query] = mockDb.query.mock.calls[0];
      expect(query).toContain('name = $1');
      expect(query).not.toContain('description = $2');
    });
  });

  describe('deleteVenue', () => {
    it('should soft delete venue successfully', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 }); // verification claims update

      await venueService.deleteVenue('venue-123');

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const [deleteQuery, deleteParams] = mockDb.query.mock.calls[0];
      expect(deleteQuery).toContain('UPDATE venues');
      expect(deleteQuery).toContain('is_active = false');
      expect(deleteParams).toEqual(['venue-123']);
    });

    it('should deny pending verification claims on delete', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      mockDb.query.mockResolvedValueOnce({ rowCount: 2 }); // 2 claims denied

      await venueService.deleteVenue('venue-123');

      expect(mockDb.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE verification_claims'),
        ['venue-123']
      );
    });

    it('should handle database errors during deletion', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(venueService.deleteVenue('venue-123')).rejects.toThrow('Delete failed');
    });
  });

  describe('getPopularVenues', () => {
    it('should return popular venues sorted by rating and checkins', async () => {
      const mockVenues = [
        {
          id: 'venue-1',
          name: 'Popular Venue 1',
          description: null,
          address: null,
          city: 'New York',
          state: 'NY',
          country: null,
          postal_code: null,
          latitude: null,
          longitude: null,
          website_url: null,
          phone: null,
          email: null,
          capacity: null,
          venue_type: null,
          image_url: null,
          average_rating: '4.9',
          total_checkins: '500',
          is_active: true,
          claimed_by_user_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'venue-2',
          name: 'Popular Venue 2',
          description: null,
          address: null,
          city: 'Los Angeles',
          state: 'CA',
          country: null,
          postal_code: null,
          latitude: null,
          longitude: null,
          website_url: null,
          phone: null,
          email: null,
          capacity: null,
          venue_type: null,
          image_url: null,
          average_rating: '4.7',
          total_checkins: '300',
          is_active: true,
          claimed_by_user_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockVenues });

      const result = await venueService.getPopularVenues(10);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Popular Venue 1');
      expect(result[0].averageRating).toBe(4.9);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('total_checkins >= 5'),
        [10]
      );
    });

    it('should use default limit of 10', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await venueService.getPopularVenues();

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [10]);
    });
  });

  describe('getVenuesNear', () => {
    it('should return venues near coordinates within radius', async () => {
      const mockVenue = {
        id: 'venue-nearby',
        name: 'Nearby Venue',
        description: null,
        address: 'Nearby St',
        city: 'New York',
        state: 'NY',
        country: null,
        postal_code: null,
        latitude: '40.71',
        longitude: '-74.01',
        website_url: null,
        phone: null,
        email: null,
        capacity: null,
        venue_type: null,
        image_url: null,
        average_rating: '4.0',
        total_checkins: '50',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockVenue] });

      const result = await venueService.getVenuesNear(40.7128, -74.006, 10, 20);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Nearby Venue');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('6371 * acos'),
        expect.arrayContaining([40.7128, -74.006, 10, 20])
      );
    });

    it('should use default radius of 50km', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await venueService.getVenuesNear(40.7128, -74.006);

      const [, params] = mockDb.query.mock.calls[0];
      expect(params[2]).toBe(50); // radiusKm
    });

    it('should calculate bounding box for pre-filter', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await venueService.getVenuesNear(40.7128, -74.006, 50);

      const [, params] = mockDb.query.mock.calls[0];
      // params: lat, lon, radius, limit, latMin, latMax, lonMin, lonMax
      expect(params).toHaveLength(8);
      expect(params[4]).toBeLessThan(40.7128); // latMin
      expect(params[5]).toBeGreaterThan(40.7128); // latMax
    });
  });

  describe('updateVenueRating', () => {
    it('should update venue rating based on checkins', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      await venueService.updateVenueRating('venue-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE venues'),
        ['venue-123']
      );
    });

    it('should handle database errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Update failed'));

      await expect(venueService.updateVenueRating('venue-123')).rejects.toThrow('Update failed');
    });
  });

  describe('isClaimedOwner', () => {
    it('should return true when user is claimed owner', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });

      const result = await venueService.isClaimedOwner('venue-123', 'user-456');

      expect(result).toBe(true);
    });

    it('should return false when user is not claimed owner', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await venueService.isClaimedOwner('venue-123', 'user-789');

      expect(result).toBe(false);
    });
  });

  describe('getVenueStats', () => {
    it('should return comprehensive venue stats', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ total_checkins: '100', unique_visitors: '75' }],
        }) // checkins
        .mockResolvedValueOnce({ rows: [{ avg_rating: '4.2' }] }) // rating
        .mockResolvedValueOnce({ rows: [{ upcoming_events: '5' }] }) // upcoming
        .mockResolvedValueOnce({
          rows: [
            { genre: 'Rock', event_count: '20' },
            { genre: 'Jazz', event_count: '10' },
          ],
        }); // genres

      const result = await venueService.getVenueStats('venue-123');

      expect(result.totalCheckins).toBe(100);
      expect(result.averageRating).toBe(4.2);
      expect(result.uniqueVisitors).toBe(75);
      expect(result.upcomingEventsCount).toBe(5);
      expect(result.popularGenres).toHaveLength(2);
      expect(result.popularGenres[0]).toEqual({ genre: 'Rock', count: 20 });
    });

    it('should handle venue with no activity', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total_checkins: '0', unique_visitors: '0' }] })
        .mockResolvedValueOnce({ rows: [{ avg_rating: '0' }] })
        .mockResolvedValueOnce({ rows: [{ upcoming_events: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await venueService.getVenueStats('venue-empty');

      expect(result.totalCheckins).toBe(0);
      expect(result.averageRating).toBe(0);
      expect(result.uniqueVisitors).toBe(0);
      expect(result.popularGenres).toEqual([]);
    });

    it('should query correct tables for stats', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total_checkins: '0', unique_visitors: '0' }] })
        .mockResolvedValueOnce({ rows: [{ avg_rating: '0' }] })
        .mockResolvedValueOnce({ rows: [{ upcoming_events: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await venueService.getVenueStats('venue-123');

      // Verify all 4 queries are made
      expect(mockDb.query).toHaveBeenCalledTimes(4);
    });
  });
});
