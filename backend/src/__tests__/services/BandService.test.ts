import { BandService } from '../../services/BandService';
import Database from '../../config/database';

// Mock dependencies
jest.mock('../../config/database');

const mockDb = {
  query: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('BandService', () => {
  let bandService: BandService;

  beforeEach(() => {
    bandService = new BandService();
    jest.clearAllMocks();
  });

  describe('getBandById', () => {
    it('should return band with stats when found', async () => {
      const mockBand = {
        id: 'band-123',
        name: 'The Test Band',
        description: 'An amazing rock band',
        genre: 'Rock',
        formed_year: 2005,
        website_url: 'https://testband.com',
        spotify_url: 'https://spotify.com/testband',
        instagram_url: 'https://instagram.com/testband',
        facebook_url: 'https://facebook.com/testband',
        image_url: 'https://example.com/band.jpg',
        hometown: 'New York, NY',
        average_rating: '4.7',
        total_checkins: '250',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockBand] });

      const result = await bandService.getBandById('band-123');

      expect(result).toEqual({
        id: 'band-123',
        name: 'The Test Band',
        description: 'An amazing rock band',
        genre: 'Rock',
        formedYear: 2005,
        websiteUrl: 'https://testband.com',
        spotifyUrl: 'https://spotify.com/testband',
        instagramUrl: 'https://instagram.com/testband',
        facebookUrl: 'https://facebook.com/testband',
        imageUrl: 'https://example.com/band.jpg',
        hometown: 'New York, NY',
        averageRating: 4.7,
        totalCheckins: 250,
        isActive: true,
        claimedByUserId: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['band-123']
      );
    });

    it('should return null when band not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await bandService.getBandById('non-existent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(bandService.getBandById('band-123')).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('searchBands', () => {
    it('should search bands with text query', async () => {
      const mockBand = {
        id: 'band-456',
        name: 'Rock Legends',
        description: 'Legendary rock band',
        genre: 'Rock',
        formed_year: 1990,
        website_url: null,
        spotify_url: null,
        instagram_url: null,
        facebook_url: null,
        image_url: null,
        hometown: 'Los Angeles, CA',
        average_rating: '4.8',
        total_checkins: '500',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T00:00:00Z',
      };

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] }) // count query
        .mockResolvedValueOnce({ rows: [mockBand] }); // main query

      const result = await bandService.searchBands({ q: 'Rock', page: 1, limit: 20 });

      expect(result.bands).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(result.bands[0].name).toBe('Rock Legends');
    });

    it('should filter bands by genre', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await bandService.searchBands({ genre: 'Jazz' });

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const [, params] = mockDb.query.mock.calls[1];
      expect(params).toContain('Jazz');
    });

    it('should filter bands by minimum rating', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await bandService.searchBands({ rating: 4.0 });

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const [, params] = mockDb.query.mock.calls[1];
      expect(params).toContain(4.0);
    });

    it('should handle pagination correctly', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '100' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await bandService.searchBands({ page: 3, limit: 10 });

      expect(result.page).toBe(3);
      expect(result.totalPages).toBe(10);
    });

    it('should use default sort by name ascending', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await bandService.searchBands({});

      const [mainQuery] = mockDb.query.mock.calls[1];
      expect(mainQuery).toContain('ORDER BY name ASC');
    });

    it('should handle descending sort order', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await bandService.searchBands({ sort: 'average_rating', order: 'desc' });

      const [mainQuery] = mockDb.query.mock.calls[1];
      expect(mainQuery).toContain('ORDER BY average_rating DESC');
    });

    it('should use full-text search for text queries', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await bandService.searchBands({ q: 'alternative rock' });

      const [countQuery] = mockDb.query.mock.calls[0];
      expect(countQuery).toContain('search_vector');
      expect(countQuery).toContain('websearch_to_tsquery');
    });

    it('should return empty array when no bands match', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await bandService.searchBands({ q: 'NonExistentBand' });

      expect(result.bands).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('createBand', () => {
    it('should create a new band successfully', async () => {
      const bandData = {
        name: 'New Band',
        description: 'A fresh new sound',
        genre: 'Indie',
        formedYear: 2020,
        websiteUrl: 'https://newband.com',
        spotifyUrl: 'https://spotify.com/newband',
        instagramUrl: 'https://instagram.com/newband',
        facebookUrl: 'https://facebook.com/newband',
        imageUrl: 'https://example.com/newband.jpg',
        hometown: 'Austin, TX',
      };

      const mockCreatedBand = {
        id: 'band-new',
        name: bandData.name,
        description: bandData.description,
        genre: bandData.genre,
        formed_year: bandData.formedYear,
        website_url: bandData.websiteUrl,
        spotify_url: bandData.spotifyUrl,
        instagram_url: bandData.instagramUrl,
        facebook_url: bandData.facebookUrl,
        image_url: bandData.imageUrl,
        hometown: bandData.hometown,
        average_rating: '0',
        total_checkins: '0',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-20T00:00:00Z',
        updated_at: '2024-01-20T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockCreatedBand] });

      const result = await bandService.createBand(bandData);

      expect(result.id).toBe('band-new');
      expect(result.name).toBe('New Band');
      expect(result.averageRating).toBe(0);
      expect(result.totalCheckins).toBe(0);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bands'),
        expect.arrayContaining([
          'New Band',
          'A fresh new sound',
          'Indie',
          2020,
          'https://newband.com',
          'https://spotify.com/newband',
          'https://instagram.com/newband',
          'https://facebook.com/newband',
          'https://example.com/newband.jpg',
          'Austin, TX',
        ])
      );
    });

    it('should handle optional fields as null', async () => {
      const bandData = {
        name: 'Simple Band',
      };

      const mockCreatedBand = {
        id: 'band-simple',
        name: 'Simple Band',
        description: null,
        genre: null,
        formed_year: null,
        website_url: null,
        spotify_url: null,
        instagram_url: null,
        facebook_url: null,
        image_url: null,
        hometown: null,
        average_rating: '0',
        total_checkins: '0',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-20T00:00:00Z',
        updated_at: '2024-01-20T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockCreatedBand] });

      const result = await bandService.createBand(bandData);

      expect(result.name).toBe('Simple Band');
      expect(result.description).toBeNull();
    });

    it('should handle database errors during creation', async () => {
      const bandData = { name: 'Test Band' };

      mockDb.query.mockRejectedValueOnce(new Error('Duplicate band name'));

      await expect(bandService.createBand(bandData)).rejects.toThrow(
        'Duplicate band name'
      );
    });
  });

  describe('updateBand', () => {
    it('should update band with partial data', async () => {
      const updateData = {
        description: 'Updated description',
        genre: 'Alternative Rock',
      };

      const mockUpdatedBand = {
        id: 'band-123',
        name: 'Test Band',
        description: 'Updated description',
        genre: 'Alternative Rock',
        formed_year: 2005,
        website_url: null,
        spotify_url: null,
        instagram_url: null,
        facebook_url: null,
        image_url: null,
        hometown: null,
        average_rating: '4.5',
        total_checkins: '100',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-25T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockUpdatedBand] });

      const result = await bandService.updateBand('band-123', updateData);

      expect(result.description).toBe('Updated description');
      expect(result.genre).toBe('Alternative Rock');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE bands'),
        expect.arrayContaining(['Updated description', 'Alternative Rock', 'band-123'])
      );
    });

    it('should throw error when no valid fields to update', async () => {
      await expect(bandService.updateBand('band-123', {})).rejects.toThrow(
        'No valid fields to update'
      );
    });

    it('should throw error when band not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        bandService.updateBand('non-existent', { name: 'New Name' })
      ).rejects.toThrow('Band not found or inactive');
    });

    it('should ignore undefined values in update data', async () => {
      const updateData = {
        name: 'New Band Name',
        description: undefined,
        genre: undefined,
      };

      const mockUpdatedBand = {
        id: 'band-123',
        name: 'New Band Name',
        description: null,
        genre: null,
        formed_year: null,
        website_url: null,
        spotify_url: null,
        instagram_url: null,
        facebook_url: null,
        image_url: null,
        hometown: null,
        average_rating: '4.5',
        total_checkins: '100',
        is_active: true,
        claimed_by_user_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-25T00:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockUpdatedBand] });

      await bandService.updateBand('band-123', updateData);

      // Should only include 'name' in the update
      const [query] = mockDb.query.mock.calls[0];
      expect(query).toContain('name = $1');
      expect(query).not.toContain('description = $2');
    });
  });

  describe('deleteBand', () => {
    it('should soft delete band successfully', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 }); // verification claims update

      await bandService.deleteBand('band-123');

      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const [deleteQuery] = mockDb.query.mock.calls[0];
      expect(deleteQuery).toContain('UPDATE bands');
      expect(deleteQuery).toContain('is_active = false');
      expect(mockDb.query.mock.calls[0][1]).toEqual(['band-123']);
    });

    it('should deny pending verification claims on delete', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      mockDb.query.mockResolvedValueOnce({ rowCount: 2 }); // 2 claims denied

      await bandService.deleteBand('band-123');

      expect(mockDb.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE verification_claims'),
        ['band-123']
      );
    });

    it('should handle database errors during deletion', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(bandService.deleteBand('band-123')).rejects.toThrow('Delete failed');
    });
  });

  describe('getPopularBands', () => {
    it('should return popular bands sorted by rating and review count', async () => {
      const mockBands = [
        {
          id: 'band-1',
          name: 'Popular Band 1',
          description: null,
          genre: 'Rock',
          formed_year: 2000,
          website_url: null,
          spotify_url: null,
          instagram_url: null,
          facebook_url: null,
          image_url: null,
          hometown: 'New York',
          average_rating: '4.9',
          total_checkins: '500',
          is_active: true,
          claimed_by_user_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'band-2',
          name: 'Popular Band 2',
          description: null,
          genre: 'Jazz',
          formed_year: 1995,
          website_url: null,
          spotify_url: null,
          instagram_url: null,
          facebook_url: null,
          image_url: null,
          hometown: 'Chicago',
          average_rating: '4.7',
          total_checkins: '300',
          is_active: true,
          claimed_by_user_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockBands });

      const result = await bandService.getPopularBands(10);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Popular Band 1');
      expect(result[0].averageRating).toBe(4.9);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('checkin_band_ratings'),
        [10]
      );
    });

    it('should use default limit of 10', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await bandService.getPopularBands();

      expect(mockDb.query).toHaveBeenCalledWith(expect.any(String), [10]);
    });
  });

  describe('getBandsByGenre', () => {
    it('should return bands filtered by genre', async () => {
      const mockBands = [
        {
          id: 'band-jazz-1',
          name: 'Jazz Quartet',
          description: null,
          genre: 'Jazz',
          formed_year: 2010,
          website_url: null,
          spotify_url: null,
          instagram_url: null,
          facebook_url: null,
          image_url: null,
          hometown: 'New Orleans',
          average_rating: '4.5',
          total_checkins: '50',
          is_active: true,
          claimed_by_user_id: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockBands });

      const result = await bandService.getBandsByGenre('Jazz', 20);

      expect(result).toHaveLength(1);
      expect(result[0].genre).toBe('Jazz');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('$1 = ANY(genres)'),
        ['Jazz', 20]
      );
    });
  });

  describe('getTrendingBands', () => {
    it('should return recently added bands with good ratings', async () => {
      const mockBands = [
        {
          id: 'band-new',
          name: 'Hot New Band',
          description: null,
          genre: 'Indie',
          formed_year: 2023,
          website_url: null,
          spotify_url: null,
          instagram_url: null,
          facebook_url: null,
          image_url: null,
          hometown: 'Seattle',
          average_rating: '4.8',
          total_checkins: '10',
          is_active: true,
          claimed_by_user_id: null,
          created_at: '2024-03-01T00:00:00Z',
          updated_at: '2024-03-01T00:00:00Z',
        },
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockBands });

      const result = await bandService.getTrendingBands(10);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Hot New Band');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('created_at >= CURRENT_DATE - INTERVAL'),
        [10]
      );
    });
  });

  describe('getGenres', () => {
    it('should return unique genres sorted alphabetically', async () => {
      const mockGenres = [
        { genre: 'Blues' },
        { genre: 'Jazz' },
        { genre: 'Rock' },
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockGenres });

      const result = await bandService.getGenres();

      expect(result).toEqual(['Blues', 'Jazz', 'Rock']);
      const [query] = mockDb.query.mock.calls[0];
      expect(query).toContain('SELECT DISTINCT genre');
      expect(query).toContain('ORDER BY genre');
    });

    it('should filter out null and empty genres', async () => {
      const mockGenres = [{ genre: 'Rock' }];

      mockDb.query.mockResolvedValueOnce({ rows: mockGenres });

      await bandService.getGenres();

      const [query] = mockDb.query.mock.calls[0];
      expect(query).toContain('genre IS NOT NULL');
      expect(query).toContain("genre != ''");
    });
  });

  describe('updateBandRating', () => {
    it('should update band rating based on checkin_band_ratings', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      await bandService.updateBandRating('band-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE bands'),
        ['band-123']
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('checkin_band_ratings'),
        ['band-123']
      );
    });

    it('should handle database errors', async () => {
      mockDb.query.mockRejectedValueOnce(new Error('Update failed'));

      await expect(bandService.updateBandRating('band-123')).rejects.toThrow('Update failed');
    });
  });

  describe('isClaimedOwner', () => {
    it('should return true when user is claimed owner', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ 1: 1 }] });

      const result = await bandService.isClaimedOwner('band-123', 'user-456');

      expect(result).toBe(true);
    });

    it('should return false when user is not claimed owner', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await bandService.isClaimedOwner('band-123', 'user-789');

      expect(result).toBe(false);
    });
  });

  describe('getBandStats', () => {
    it('should return comprehensive band stats', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ total_checkins: '150', unique_fans: '120' }],
        }) // checkins
        .mockResolvedValueOnce({ rows: [{ avg_rating: '4.6' }] }) // rating
        .mockResolvedValueOnce({ rows: [{ recent_events: '8' }] }) // recent events
        .mockResolvedValueOnce({
          rows: [
            { venue_id: 'venue-1', venue_name: 'Madison Square Garden', checkin_count: '50' },
            { venue_id: 'venue-2', venue_name: 'The Fillmore', checkin_count: '30' },
          ],
        }); // top venues

      const result = await bandService.getBandStats('band-123');

      expect(result.totalCheckins).toBe(150);
      expect(result.averageRating).toBe(4.6);
      expect(result.uniqueFans).toBe(120);
      expect(result.recentEventsCount).toBe(8);
      expect(result.topVenues).toHaveLength(2);
      expect(result.topVenues[0]).toEqual({
        venueId: 'venue-1',
        venueName: 'Madison Square Garden',
        checkinCount: 50,
      });
    });

    it('should handle band with no activity', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total_checkins: '0', unique_fans: '0' }] })
        .mockResolvedValueOnce({ rows: [{ avg_rating: '0' }] })
        .mockResolvedValueOnce({ rows: [{ recent_events: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await bandService.getBandStats('band-empty');

      expect(result.totalCheckins).toBe(0);
      expect(result.averageRating).toBe(0);
      expect(result.uniqueFans).toBe(0);
      expect(result.topVenues).toEqual([]);
    });

    it('should query correct tables for stats', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ total_checkins: '0', unique_fans: '0' }] })
        .mockResolvedValueOnce({ rows: [{ avg_rating: '0' }] })
        .mockResolvedValueOnce({ rows: [{ recent_events: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await bandService.getBandStats('band-123');

      // Verify all 4 queries are made
      expect(mockDb.query).toHaveBeenCalledTimes(4);
    });
  });
});
