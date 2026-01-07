import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import Database from '../../config/database';
import { CheckinService } from '../../services/CheckinService';

/**
 * Integration tests for CheckinService
 *
 * These tests verify the CheckinService works correctly with the actual database schema.
 * They test the checkins, toasts, checkin_comments, and checkin_vibes tables.
 *
 * Key schema validations:
 * - checkins table uses venue_id and band_id (not event_id)
 * - toasts table (not checkin_toasts)
 * - checkin_comments.content column (not comment_text)
 * - vibe_tags.icon column (not emoji)
 *
 * Prerequisites:
 * - PostgreSQL database must be running
 * - Database schema must be applied
 * - Test environment variables must be set
 */

// Skip these tests if not in integration test mode
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIntegration = runIntegrationTests ? describe : describe.skip;

describeIntegration('CheckinService Integration Tests', () => {
  let db: ReturnType<typeof Database.getInstance>;
  let checkinService: CheckinService;
  let testUserId: string;
  let testVenueId: string;
  let testBandId: string;
  let testVibeTagId: string;
  let createdCheckinIds: string[] = [];

  beforeAll(async () => {
    db = Database.getInstance();
    checkinService = new CheckinService();

    // Create test user
    const userResult = await db.query(`
      INSERT INTO users (email, password_hash, username, first_name, last_name)
      VALUES ('checkin-test@example.com', 'hashedpassword123', 'checkintestuser', 'Checkin', 'TestUser')
      RETURNING id
    `);
    testUserId = userResult.rows[0].id;

    // Create test venue
    const venueResult = await db.query(`
      INSERT INTO venues (name, city, venue_type)
      VALUES ('Test Checkin Venue', 'Test City', 'club')
      RETURNING id
    `);
    testVenueId = venueResult.rows[0].id;

    // Create test band
    const bandResult = await db.query(`
      INSERT INTO bands (name, genre)
      VALUES ('Test Checkin Band', 'Rock')
      RETURNING id
    `);
    testBandId = bandResult.rows[0].id;

    // Get a vibe tag for testing
    const vibeTagResult = await db.query(`
      SELECT id FROM vibe_tags LIMIT 1
    `);
    if (vibeTagResult.rows.length > 0) {
      testVibeTagId = vibeTagResult.rows[0].id;
    }
  });

  afterAll(async () => {
    // Clean up test data in reverse order of dependencies
    if (createdCheckinIds.length > 0) {
      await db.query('DELETE FROM checkin_vibes WHERE checkin_id = ANY($1)', [createdCheckinIds]);
      await db.query('DELETE FROM checkin_comments WHERE checkin_id = ANY($1)', [createdCheckinIds]);
      await db.query('DELETE FROM toasts WHERE checkin_id = ANY($1)', [createdCheckinIds]);
      await db.query('DELETE FROM checkins WHERE id = ANY($1)', [createdCheckinIds]);
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
    createdCheckinIds = [];
  });

  afterEach(async () => {
    // Clean up checkins created during each test
    if (createdCheckinIds.length > 0) {
      await db.query('DELETE FROM checkin_vibes WHERE checkin_id = ANY($1)', [createdCheckinIds]);
      await db.query('DELETE FROM checkin_comments WHERE checkin_id = ANY($1)', [createdCheckinIds]);
      await db.query('DELETE FROM toasts WHERE checkin_id = ANY($1)', [createdCheckinIds]);
      await db.query('DELETE FROM checkins WHERE id = ANY($1)', [createdCheckinIds]);
      createdCheckinIds = [];
    }
  });

  describe('Database Schema Verification', () => {
    it('should have checkins table with venue_id and band_id columns (not event_id)', async () => {
      const result = await db.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'checkins'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map((row: any) => row.column_name);

      // Verify correct columns exist
      expect(columns).toContain('id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('venue_id');
      expect(columns).toContain('band_id');
      expect(columns).toContain('rating');
      expect(columns).toContain('comment');
      expect(columns).toContain('photo_url');
      expect(columns).toContain('event_date');
      expect(columns).toContain('checkin_latitude');
      expect(columns).toContain('checkin_longitude');
      expect(columns).toContain('toast_count');
      expect(columns).toContain('comment_count');
      expect(columns).toContain('created_at');
      expect(columns).toContain('updated_at');

      // Verify event_id does NOT exist (schema mismatch fix)
      expect(columns).not.toContain('event_id');
    });

    it('should have toasts table (not checkin_toasts)', async () => {
      // Verify toasts table exists
      const toastsResult = await db.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'toasts'
      `);
      expect(toastsResult.rows.length).toBeGreaterThan(0);

      const toastColumns = toastsResult.rows.map((row: any) => row.column_name);
      expect(toastColumns).toContain('id');
      expect(toastColumns).toContain('user_id');
      expect(toastColumns).toContain('checkin_id');
      expect(toastColumns).toContain('created_at');

      // Verify checkin_toasts table does NOT exist
      const checkinToastsResult = await db.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'checkin_toasts'
      `);
      expect(checkinToastsResult.rows.length).toBe(0);
    });

    it('should have checkin_comments with content column (not comment_text)', async () => {
      const result = await db.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'checkin_comments'
      `);

      const columns = result.rows.map((row: any) => row.column_name);

      // Verify correct column exists
      expect(columns).toContain('content');

      // Verify incorrect column does NOT exist
      expect(columns).not.toContain('comment_text');
    });

    it('should have vibe_tags with icon column (not emoji)', async () => {
      const result = await db.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'vibe_tags'
      `);

      const columns = result.rows.map((row: any) => row.column_name);

      // Verify correct column exists
      expect(columns).toContain('icon');

      // Verify incorrect column does NOT exist
      expect(columns).not.toContain('emoji');
    });

    it('should have shows table (not events)', async () => {
      // Verify shows table exists
      const showsResult = await db.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'shows'
      `);
      expect(showsResult.rows.length).toBeGreaterThan(0);

      const showColumns = showsResult.rows.map((row: any) => row.column_name);
      expect(showColumns).toContain('id');
      expect(showColumns).toContain('venue_id');
      expect(showColumns).toContain('band_id');
      expect(showColumns).toContain('show_date');

      // Verify events table does NOT exist (or is empty)
      const eventsResult = await db.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'events'
      `);
      expect(eventsResult.rows.length).toBe(0);
    });

    it('should enforce rating constraint (0-5)', async () => {
      // Test rating below minimum
      await expect(
        db.query(`
          INSERT INTO checkins (user_id, venue_id, band_id, rating)
          VALUES ($1, $2, $3, -1)
        `, [testUserId, testVenueId, testBandId])
      ).rejects.toThrow();

      // Test rating above maximum
      await expect(
        db.query(`
          INSERT INTO checkins (user_id, venue_id, band_id, rating)
          VALUES ($1, $2, $3, 6)
        `, [testUserId, testVenueId, testBandId])
      ).rejects.toThrow();
    });
  });

  describe('Checkin CRUD Operations', () => {
    it('should create a checkin with venue_id and band_id', async () => {
      const result = await db.query(`
        INSERT INTO checkins (user_id, venue_id, band_id, rating, comment, event_date)
        VALUES ($1, $2, $3, 4.5, 'Great show!', CURRENT_DATE)
        RETURNING *
      `, [testUserId, testVenueId, testBandId]);

      createdCheckinIds.push(result.rows[0].id);

      expect(result.rows[0].user_id).toBe(testUserId);
      expect(result.rows[0].venue_id).toBe(testVenueId);
      expect(result.rows[0].band_id).toBe(testBandId);
      expect(parseFloat(result.rows[0].rating)).toBe(4.5);
      expect(result.rows[0].comment).toBe('Great show!');
      expect(result.rows[0].toast_count).toBe(0);
      expect(result.rows[0].comment_count).toBe(0);
    });

    it('should read a checkin with venue and band joins', async () => {
      // Create a checkin first
      const insertResult = await db.query(`
        INSERT INTO checkins (user_id, venue_id, band_id, rating, comment)
        VALUES ($1, $2, $3, 4, 'Test checkin')
        RETURNING id
      `, [testUserId, testVenueId, testBandId]);

      createdCheckinIds.push(insertResult.rows[0].id);

      // Read with joins (this is what the service does)
      const result = await db.query(`
        SELECT c.*, u.username, v.name as venue_name, b.name as band_name
        FROM checkins c
        LEFT JOIN users u ON c.user_id = u.id
        LEFT JOIN venues v ON c.venue_id = v.id
        LEFT JOIN bands b ON c.band_id = b.id
        WHERE c.id = $1
      `, [insertResult.rows[0].id]);

      expect(result.rows[0].username).toBe('checkintestuser');
      expect(result.rows[0].venue_name).toBe('Test Checkin Venue');
      expect(result.rows[0].band_name).toBe('Test Checkin Band');
    });

    it('should delete a checkin', async () => {
      // Create a checkin first
      const insertResult = await db.query(`
        INSERT INTO checkins (user_id, venue_id, band_id, rating)
        VALUES ($1, $2, $3, 4)
        RETURNING id
      `, [testUserId, testVenueId, testBandId]);

      const checkinId = insertResult.rows[0].id;

      // Delete the checkin
      await db.query('DELETE FROM checkins WHERE id = $1', [checkinId]);

      // Verify deletion
      const checkResult = await db.query('SELECT * FROM checkins WHERE id = $1', [checkinId]);
      expect(checkResult.rows.length).toBe(0);
    });
  });

  describe('Toasts (using toasts table)', () => {
    let checkinId: string;
    let toasterUserId: string;

    beforeEach(async () => {
      // Create a checkin
      const checkinResult = await db.query(`
        INSERT INTO checkins (user_id, venue_id, band_id, rating)
        VALUES ($1, $2, $3, 4)
        RETURNING id
      `, [testUserId, testVenueId, testBandId]);
      checkinId = checkinResult.rows[0].id;
      createdCheckinIds.push(checkinId);

      // Create a toaster user
      const toasterResult = await db.query(`
        INSERT INTO users (email, password_hash, username)
        VALUES ('toaster@example.com', 'hashedpassword', 'toasteruser')
        RETURNING id
      `);
      toasterUserId = toasterResult.rows[0].id;
    });

    afterEach(async () => {
      if (toasterUserId) {
        await db.query('DELETE FROM users WHERE id = $1', [toasterUserId]);
      }
    });

    it('should create a toast in toasts table', async () => {
      const result = await db.query(`
        INSERT INTO toasts (checkin_id, user_id)
        VALUES ($1, $2)
        RETURNING *
      `, [checkinId, toasterUserId]);

      expect(result.rows[0].checkin_id).toBe(checkinId);
      expect(result.rows[0].user_id).toBe(toasterUserId);
    });

    it('should prevent duplicate toasts', async () => {
      // First toast
      await db.query(`
        INSERT INTO toasts (checkin_id, user_id)
        VALUES ($1, $2)
      `, [checkinId, toasterUserId]);

      // Duplicate toast should fail
      await expect(
        db.query(`
          INSERT INTO toasts (checkin_id, user_id)
          VALUES ($1, $2)
        `, [checkinId, toasterUserId])
      ).rejects.toThrow();
    });

    it('should cascade delete toasts when checkin is deleted', async () => {
      // Create toast
      await db.query(`
        INSERT INTO toasts (checkin_id, user_id)
        VALUES ($1, $2)
      `, [checkinId, toasterUserId]);

      // Delete checkin
      await db.query('DELETE FROM checkins WHERE id = $1', [checkinId]);
      createdCheckinIds = createdCheckinIds.filter(id => id !== checkinId);

      // Verify toast is also deleted
      const result = await db.query(
        'SELECT * FROM toasts WHERE checkin_id = $1',
        [checkinId]
      );
      expect(result.rows.length).toBe(0);
    });
  });

  describe('Comments (using content column)', () => {
    let checkinId: string;
    let commenterUserId: string;

    beforeEach(async () => {
      // Create a checkin
      const checkinResult = await db.query(`
        INSERT INTO checkins (user_id, venue_id, band_id, rating)
        VALUES ($1, $2, $3, 4)
        RETURNING id
      `, [testUserId, testVenueId, testBandId]);
      checkinId = checkinResult.rows[0].id;
      createdCheckinIds.push(checkinId);

      // Create a commenter user
      const commenterResult = await db.query(`
        INSERT INTO users (email, password_hash, username)
        VALUES ('commenter@example.com', 'hashedpassword', 'commenteruser')
        RETURNING id
      `);
      commenterUserId = commenterResult.rows[0].id;
    });

    afterEach(async () => {
      if (commenterUserId) {
        await db.query('DELETE FROM users WHERE id = $1', [commenterUserId]);
      }
    });

    it('should create a comment with content column', async () => {
      const result = await db.query(`
        INSERT INTO checkin_comments (checkin_id, user_id, content)
        VALUES ($1, $2, 'Great review!')
        RETURNING *
      `, [checkinId, commenterUserId]);

      expect(result.rows[0].checkin_id).toBe(checkinId);
      expect(result.rows[0].user_id).toBe(commenterUserId);
      expect(result.rows[0].content).toBe('Great review!');
    });

    it('should cascade delete comments when checkin is deleted', async () => {
      // Create comment
      await db.query(`
        INSERT INTO checkin_comments (checkin_id, user_id, content)
        VALUES ($1, $2, 'Test comment')
      `, [checkinId, commenterUserId]);

      // Delete checkin
      await db.query('DELETE FROM checkins WHERE id = $1', [checkinId]);
      createdCheckinIds = createdCheckinIds.filter(id => id !== checkinId);

      // Verify comment is also deleted
      const result = await db.query(
        'SELECT * FROM checkin_comments WHERE checkin_id = $1',
        [checkinId]
      );
      expect(result.rows.length).toBe(0);
    });
  });

  describe('Vibe Tags (using icon column)', () => {
    it('should read vibe tags with icon column', async () => {
      const result = await db.query(`
        SELECT id, name, icon, category
        FROM vibe_tags
        LIMIT 5
      `);

      // Verify we can read vibe tags with icon column
      if (result.rows.length > 0) {
        expect(result.rows[0]).toHaveProperty('icon');
        expect(result.rows[0]).toHaveProperty('name');
        expect(result.rows[0]).toHaveProperty('category');
      }
    });

    it('should associate vibe tags with checkins', async () => {
      if (!testVibeTagId) {
        console.log('Skipping vibe tag test - no vibe tags in database');
        return;
      }

      // Create a checkin
      const checkinResult = await db.query(`
        INSERT INTO checkins (user_id, venue_id, band_id, rating)
        VALUES ($1, $2, $3, 4)
        RETURNING id
      `, [testUserId, testVenueId, testBandId]);
      const checkinId = checkinResult.rows[0].id;
      createdCheckinIds.push(checkinId);

      // Associate vibe tag
      await db.query(`
        INSERT INTO checkin_vibes (checkin_id, vibe_tag_id)
        VALUES ($1, $2)
      `, [checkinId, testVibeTagId]);

      // Read back with join
      const result = await db.query(`
        SELECT vt.id, vt.name, vt.icon, vt.category
        FROM vibe_tags vt
        INNER JOIN checkin_vibes cv ON vt.id = cv.vibe_tag_id
        WHERE cv.checkin_id = $1
      `, [checkinId]);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]).toHaveProperty('icon');
    });
  });

  describe('CheckinService Methods', () => {
    it('should create checkin via service', async () => {
      const checkin = await checkinService.createCheckin({
        userId: testUserId,
        venueId: testVenueId,
        bandId: testBandId,
        rating: 4.5,
        comment: 'Service test checkin',
        eventDate: new Date(),
      });

      createdCheckinIds.push(checkin.id);

      expect(checkin.userId).toBe(testUserId);
      expect(checkin.venueId).toBe(testVenueId);
      expect(checkin.bandId).toBe(testBandId);
      expect(checkin.rating).toBe(4.5);
      expect(checkin.comment).toBe('Service test checkin');
    });

    it('should get checkin by ID via service', async () => {
      // Create checkin directly
      const insertResult = await db.query(`
        INSERT INTO checkins (user_id, venue_id, band_id, rating, comment)
        VALUES ($1, $2, $3, 4, 'Test for getById')
        RETURNING id
      `, [testUserId, testVenueId, testBandId]);
      const checkinId = insertResult.rows[0].id;
      createdCheckinIds.push(checkinId);

      // Get via service
      const checkin = await checkinService.getCheckinById(checkinId);

      expect(checkin.id).toBe(checkinId);
      expect(checkin.venueId).toBe(testVenueId);
      expect(checkin.bandId).toBe(testBandId);
    });

    it('should get vibe tags via service', async () => {
      const vibeTags = await checkinService.getVibeTags();

      // Should return array (may be empty in test db)
      expect(Array.isArray(vibeTags)).toBe(true);

      // If there are vibe tags, verify structure
      if (vibeTags.length > 0) {
        expect(vibeTags[0]).toHaveProperty('id');
        expect(vibeTags[0]).toHaveProperty('name');
        expect(vibeTags[0]).toHaveProperty('icon');
        expect(vibeTags[0]).toHaveProperty('category');
      }
    });
  });
});
