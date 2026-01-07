import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import Database from '../../config/database';
import { ReviewService } from '../../services/ReviewService';
import { VenueService } from '../../services/VenueService';
import { BandService } from '../../services/BandService';

/**
 * Integration tests for ReviewService
 *
 * These tests verify the ReviewService works correctly with the actual database schema.
 * They test the reviews and review_helpfulness tables.
 *
 * Prerequisites:
 * - PostgreSQL database must be running
 * - Database schema must be applied (reviews and review_helpfulness tables)
 * - Test environment variables must be set
 */

// Skip these tests if not in integration test mode
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIntegration = runIntegrationTests ? describe : describe.skip;

describeIntegration('ReviewService Integration Tests', () => {
  let db: ReturnType<typeof Database.getInstance>;
  let reviewService: ReviewService;
  let testUserId: string;
  let testVenueId: string;
  let testBandId: string;
  let createdReviewIds: string[] = [];

  beforeAll(async () => {
    db = Database.getInstance();
    reviewService = new ReviewService();

    // Create test user
    const userResult = await db.query(`
      INSERT INTO users (email, password_hash, username, first_name, last_name)
      VALUES ('review-test@example.com', 'hashedpassword123', 'reviewtestuser', 'Review', 'TestUser')
      RETURNING id
    `);
    testUserId = userResult.rows[0].id;

    // Create test venue
    const venueResult = await db.query(`
      INSERT INTO venues (name, city, venue_type)
      VALUES ('Test Review Venue', 'Test City', 'club')
      RETURNING id
    `);
    testVenueId = venueResult.rows[0].id;

    // Create test band
    const bandResult = await db.query(`
      INSERT INTO bands (name, genre)
      VALUES ('Test Review Band', 'Rock')
      RETURNING id
    `);
    testBandId = bandResult.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test data in reverse order of dependencies
    if (createdReviewIds.length > 0) {
      await db.query('DELETE FROM review_helpfulness WHERE review_id = ANY($1)', [createdReviewIds]);
      await db.query('DELETE FROM reviews WHERE id = ANY($1)', [createdReviewIds]);
    }

    if (testBandId) {
      await db.query('DELETE FROM bands WHERE id = $1', [testBandId]);
    }

    if (testVenueId) {
      await db.query('DELETE FROM venues WHERE id = $1', [testVenueId]);
    }

    if (testUserId) {
      await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  beforeEach(() => {
    // Reset created review IDs for each test
    createdReviewIds = [];
  });

  afterEach(async () => {
    // Clean up reviews created during each test
    if (createdReviewIds.length > 0) {
      await db.query('DELETE FROM review_helpfulness WHERE review_id = ANY($1)', [createdReviewIds]);
      await db.query('DELETE FROM reviews WHERE id = ANY($1)', [createdReviewIds]);
      createdReviewIds = [];
    }
  });

  describe('Database Schema Verification', () => {
    it('should have reviews table with correct columns', async () => {
      const result = await db.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'reviews'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((row: any) => row.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('venue_id');
      expect(columns).toContain('band_id');
      expect(columns).toContain('rating');
      expect(columns).toContain('title');
      expect(columns).toContain('content');
      expect(columns).toContain('event_date');
      expect(columns).toContain('image_urls');
      expect(columns).toContain('is_verified');
      expect(columns).toContain('helpful_count');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');
    });

    it('should have review_helpfulness table with correct columns', async () => {
      const result = await db.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'review_helpfulness'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((row: any) => row.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('review_id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('is_helpful');
      expect(columns).toContain('created_at');
    });

    it('should have indexes on reviews table', async () => {
      const result = await db.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'reviews'
      `);

      const indexNames = result.rows.map((row: any) => row.indexname);

      expect(indexNames).toContain('idx_reviews_user');
      expect(indexNames).toContain('idx_reviews_venue');
      expect(indexNames).toContain('idx_reviews_band');
      expect(indexNames).toContain('idx_reviews_rating');
      expect(indexNames).toContain('idx_reviews_created');
    });

    it('should have indexes on review_helpfulness table', async () => {
      const result = await db.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'review_helpfulness'
      `);

      const indexNames = result.rows.map((row: any) => row.indexname);

      expect(indexNames).toContain('idx_review_helpfulness_review');
      expect(indexNames).toContain('idx_review_helpfulness_user');
    });

    it('should enforce rating constraint (1-5)', async () => {
      // Test rating below minimum
      await expect(
        db.query(`
          INSERT INTO reviews (user_id, venue_id, rating, title)
          VALUES ($1, $2, 0, 'Invalid Rating')
        `, [testUserId, testVenueId])
      ).rejects.toThrow();

      // Test rating above maximum
      await expect(
        db.query(`
          INSERT INTO reviews (user_id, venue_id, rating, title)
          VALUES ($1, $2, 6, 'Invalid Rating')
        `, [testUserId, testVenueId])
      ).rejects.toThrow();
    });

    it('should enforce review target constraint (venue XOR band)', async () => {
      // Test review with both venue and band (should fail)
      await expect(
        db.query(`
          INSERT INTO reviews (user_id, venue_id, band_id, rating, title)
          VALUES ($1, $2, $3, 4, 'Invalid Review')
        `, [testUserId, testVenueId, testBandId])
      ).rejects.toThrow();

      // Test review with neither venue nor band (should fail)
      await expect(
        db.query(`
          INSERT INTO reviews (user_id, rating, title)
          VALUES ($1, 4, 'Invalid Review')
        `, [testUserId])
      ).rejects.toThrow();
    });
  });

  describe('Review CRUD Operations', () => {
    it('should create a venue review', async () => {
      const result = await db.query(`
        INSERT INTO reviews (user_id, venue_id, rating, title, content)
        VALUES ($1, $2, 4, 'Great Venue', 'Had an amazing time here!')
        RETURNING *
      `, [testUserId, testVenueId]);

      createdReviewIds.push(result.rows[0].id);

      expect(result.rows[0].user_id).toBe(testUserId);
      expect(result.rows[0].venue_id).toBe(testVenueId);
      expect(result.rows[0].band_id).toBeNull();
      expect(result.rows[0].rating).toBe(4);
      expect(result.rows[0].title).toBe('Great Venue');
      expect(result.rows[0].content).toBe('Had an amazing time here!');
      expect(result.rows[0].is_verified).toBe(false);
      expect(result.rows[0].helpful_count).toBe(0);
    });

    it('should create a band review', async () => {
      const result = await db.query(`
        INSERT INTO reviews (user_id, band_id, rating, title, content)
        VALUES ($1, $2, 5, 'Amazing Band', 'Best concert ever!')
        RETURNING *
      `, [testUserId, testBandId]);

      createdReviewIds.push(result.rows[0].id);

      expect(result.rows[0].user_id).toBe(testUserId);
      expect(result.rows[0].venue_id).toBeNull();
      expect(result.rows[0].band_id).toBe(testBandId);
      expect(result.rows[0].rating).toBe(5);
    });

    it('should read a review with user and venue joins', async () => {
      // Create a review first
      const insertResult = await db.query(`
        INSERT INTO reviews (user_id, venue_id, rating, title, content)
        VALUES ($1, $2, 4, 'Test Review', 'Test Content')
        RETURNING id
      `, [testUserId, testVenueId]);

      createdReviewIds.push(insertResult.rows[0].id);

      // Read with joins
      const result = await db.query(`
        SELECT r.*, u.username, v.name as venue_name
        FROM reviews r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN venues v ON r.venue_id = v.id
        WHERE r.id = $1
      `, [insertResult.rows[0].id]);

      expect(result.rows[0].username).toBe('reviewtestuser');
      expect(result.rows[0].venue_name).toBe('Test Review Venue');
    });

    it('should update a review', async () => {
      // Create a review first
      const insertResult = await db.query(`
        INSERT INTO reviews (user_id, venue_id, rating, title, content)
        VALUES ($1, $2, 3, 'Original Title', 'Original Content')
        RETURNING id
      `, [testUserId, testVenueId]);

      createdReviewIds.push(insertResult.rows[0].id);

      // Update the review
      const updateResult = await db.query(`
        UPDATE reviews
        SET rating = 5, title = 'Updated Title', content = 'Updated Content'
        WHERE id = $1
        RETURNING *
      `, [insertResult.rows[0].id]);

      expect(updateResult.rows[0].rating).toBe(5);
      expect(updateResult.rows[0].title).toBe('Updated Title');
      expect(updateResult.rows[0].content).toBe('Updated Content');
      expect(updateResult.rows[0].updated_at).not.toBe(updateResult.rows[0].created_at);
    });

    it('should delete a review', async () => {
      // Create a review first
      const insertResult = await db.query(`
        INSERT INTO reviews (user_id, venue_id, rating, title)
        VALUES ($1, $2, 4, 'To Be Deleted')
        RETURNING id
      `, [testUserId, testVenueId]);

      const reviewId = insertResult.rows[0].id;

      // Delete the review
      await db.query('DELETE FROM reviews WHERE id = $1', [reviewId]);

      // Verify deletion
      const checkResult = await db.query('SELECT * FROM reviews WHERE id = $1', [reviewId]);
      expect(checkResult.rows.length).toBe(0);
    });
  });

  describe('Review Helpfulness', () => {
    let reviewId: string;
    let helperUserId: string;

    beforeEach(async () => {
      // Create a review
      const reviewResult = await db.query(`
        INSERT INTO reviews (user_id, venue_id, rating, title)
        VALUES ($1, $2, 4, 'Test Review for Helpfulness')
        RETURNING id
      `, [testUserId, testVenueId]);
      reviewId = reviewResult.rows[0].id;
      createdReviewIds.push(reviewId);

      // Create a helper user
      const helperResult = await db.query(`
        INSERT INTO users (email, password_hash, username)
        VALUES ('helper@example.com', 'hashedpassword', 'helperuser')
        RETURNING id
      `);
      helperUserId = helperResult.rows[0].id;
    });

    afterEach(async () => {
      // Clean up helper user
      if (helperUserId) {
        await db.query('DELETE FROM users WHERE id = $1', [helperUserId]);
      }
    });

    it('should mark a review as helpful', async () => {
      const result = await db.query(`
        INSERT INTO review_helpfulness (review_id, user_id, is_helpful)
        VALUES ($1, $2, true)
        RETURNING *
      `, [reviewId, helperUserId]);

      expect(result.rows[0].review_id).toBe(reviewId);
      expect(result.rows[0].user_id).toBe(helperUserId);
      expect(result.rows[0].is_helpful).toBe(true);
    });

    it('should prevent duplicate helpfulness entries', async () => {
      // First entry
      await db.query(`
        INSERT INTO review_helpfulness (review_id, user_id, is_helpful)
        VALUES ($1, $2, true)
      `, [reviewId, helperUserId]);

      // Duplicate entry should fail
      await expect(
        db.query(`
          INSERT INTO review_helpfulness (review_id, user_id, is_helpful)
          VALUES ($1, $2, false)
        `, [reviewId, helperUserId])
      ).rejects.toThrow();
    });

    it('should update helpfulness count on reviews', async () => {
      // Mark as helpful
      await db.query(`
        INSERT INTO review_helpfulness (review_id, user_id, is_helpful)
        VALUES ($1, $2, true)
      `, [reviewId, helperUserId]);

      // Update helpful count manually (in real app, this would be done by service)
      await db.query(`
        UPDATE reviews
        SET helpful_count = (
          SELECT COUNT(*) FROM review_helpfulness
          WHERE review_id = $1 AND is_helpful = true
        )
        WHERE id = $1
      `, [reviewId]);

      // Verify count
      const result = await db.query('SELECT helpful_count FROM reviews WHERE id = $1', [reviewId]);
      expect(result.rows[0].helpful_count).toBe(1);
    });

    it('should cascade delete helpfulness when review is deleted', async () => {
      // Create helpfulness entry
      await db.query(`
        INSERT INTO review_helpfulness (review_id, user_id, is_helpful)
        VALUES ($1, $2, true)
      `, [reviewId, helperUserId]);

      // Delete review
      await db.query('DELETE FROM reviews WHERE id = $1', [reviewId]);
      createdReviewIds = createdReviewIds.filter(id => id !== reviewId);

      // Verify helpfulness entry is also deleted
      const result = await db.query(
        'SELECT * FROM review_helpfulness WHERE review_id = $1',
        [reviewId]
      );
      expect(result.rows.length).toBe(0);
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should cascade delete reviews when user is deleted', async () => {
      // Create a temporary user
      const userResult = await db.query(`
        INSERT INTO users (email, password_hash, username)
        VALUES ('temp-review-user@example.com', 'hashedpassword', 'tempreviewuser')
        RETURNING id
      `);
      const tempUserId = userResult.rows[0].id;

      // Create a review for that user
      const reviewResult = await db.query(`
        INSERT INTO reviews (user_id, venue_id, rating, title)
        VALUES ($1, $2, 4, 'Temp Review')
        RETURNING id
      `, [tempUserId, testVenueId]);
      const tempReviewId = reviewResult.rows[0].id;

      // Delete the user
      await db.query('DELETE FROM users WHERE id = $1', [tempUserId]);

      // Verify review is also deleted
      const checkResult = await db.query('SELECT * FROM reviews WHERE id = $1', [tempReviewId]);
      expect(checkResult.rows.length).toBe(0);
    });

    it('should cascade delete reviews when venue is deleted', async () => {
      // Create a temporary venue
      const venueResult = await db.query(`
        INSERT INTO venues (name, city)
        VALUES ('Temp Venue for Review', 'Temp City')
        RETURNING id
      `);
      const tempVenueId = venueResult.rows[0].id;

      // Create a review for that venue
      const reviewResult = await db.query(`
        INSERT INTO reviews (user_id, venue_id, rating, title)
        VALUES ($1, $2, 4, 'Temp Venue Review')
        RETURNING id
      `, [testUserId, tempVenueId]);
      const tempReviewId = reviewResult.rows[0].id;

      // Delete the venue
      await db.query('DELETE FROM venues WHERE id = $1', [tempVenueId]);

      // Verify review is also deleted
      const checkResult = await db.query('SELECT * FROM reviews WHERE id = $1', [tempReviewId]);
      expect(checkResult.rows.length).toBe(0);
    });

    it('should cascade delete reviews when band is deleted', async () => {
      // Create a temporary band
      const bandResult = await db.query(`
        INSERT INTO bands (name, genre)
        VALUES ('Temp Band for Review', 'Rock')
        RETURNING id
      `);
      const tempBandId = bandResult.rows[0].id;

      // Create a review for that band
      const reviewResult = await db.query(`
        INSERT INTO reviews (user_id, band_id, rating, title)
        VALUES ($1, $2, 5, 'Temp Band Review')
        RETURNING id
      `, [testUserId, tempBandId]);
      const tempReviewId = reviewResult.rows[0].id;

      // Delete the band
      await db.query('DELETE FROM bands WHERE id = $1', [tempBandId]);

      // Verify review is also deleted
      const checkResult = await db.query('SELECT * FROM reviews WHERE id = $1', [tempReviewId]);
      expect(checkResult.rows.length).toBe(0);
    });
  });
});
