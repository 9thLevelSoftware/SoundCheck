import Database from '../config/database';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config();

const db = Database.getInstance();

const DEMO_EMAIL = 'demo@soundcheck.app';
const DEMO_USERNAME = 'demo_user';
const DEMO_PASSWORD = 'SoundCheck2026!';
const SALT_ROUNDS = 12; // matches AuthUtils.hashPassword

async function seedDemoAccount() {
  console.log('Starting demo account seed...\n');

  try {
    // Check database connection
    const isHealthy = await db.healthCheck();
    if (!isHealthy) {
      throw new Error('Database connection failed');
    }
    console.log('Database connection successful\n');

    // Step 1: Add is_demo column guard
    console.log('Step 1: Ensuring is_demo column exists...');
    await db.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false
    `);
    console.log('  is_demo column ready\n');

    // Step 2: Create or update demo user
    console.log('Step 2: Creating demo user...');
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

    const userResult = await db.query(`
      INSERT INTO users (email, username, password_hash, first_name, last_name, bio, is_active, is_demo)
      VALUES ($1, $2, $3, $4, $5, $6, true, true)
      ON CONFLICT (email) DO UPDATE SET
        username = EXCLUDED.username,
        password_hash = EXCLUDED.password_hash,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        bio = EXCLUDED.bio,
        is_active = true,
        is_demo = true,
        updated_at = NOW()
      RETURNING id
    `, [
      DEMO_EMAIL,
      DEMO_USERNAME,
      passwordHash,
      'Demo',
      'User',
      'Live music enthusiast. Catch me at a show near you!',
    ]);

    const demoUserId = userResult.rows[0].id;
    console.log(`  Demo user ID: ${demoUserId}\n`);

    // Step 3: Fetch existing seed venues and bands
    console.log('Step 3: Fetching existing venues and bands...');
    const venuesResult = await db.query(
      'SELECT id, name, city FROM venues ORDER BY name LIMIT 8'
    );
    const bandsResult = await db.query(
      'SELECT id, name, genre FROM bands ORDER BY name LIMIT 12'
    );

    const venues = venuesResult.rows;
    const bands = bandsResult.rows;

    if (venues.length === 0 || bands.length === 0) {
      console.log('  WARNING: No seed venues/bands found. Run "npm run seed" first.');
      console.log('  Skipping events, check-ins, and ratings.\n');
      process.exit(0);
    }

    console.log(`  Found ${venues.length} venues and ${bands.length} bands\n`);

    // Step 4: Create events spread over the past 3 months
    console.log('Step 4: Creating demo events...');
    const eventIds: string[] = [];
    const now = new Date();

    const eventData = [
      { venueIdx: 0, daysAgo: 75, name: 'Rock Night' },
      { venueIdx: 1, daysAgo: 60, name: 'Summer Sessions' },
      { venueIdx: 2, daysAgo: 45, name: 'Indie Underground' },
      { venueIdx: 3, daysAgo: 30, name: 'Electric Beats' },
      { venueIdx: 4, daysAgo: 20, name: 'Jazz & Blues Evening' },
      { venueIdx: 0, daysAgo: 10, name: 'Metal Mayhem' },
      { venueIdx: 5, daysAgo: 5, name: 'Folk Festival' },
      { venueIdx: 1, daysAgo: -7, name: 'Upcoming Showcase' },
      { venueIdx: 2, daysAgo: -14, name: 'New Year Bash' },
      { venueIdx: 3, daysAgo: -21, name: 'Spring Opener' },
    ];

    for (let i = 0; i < eventData.length && i < venues.length; i++) {
      const ev = eventData[i];
      const venueIdx = Math.min(ev.venueIdx, venues.length - 1);
      const eventDate = new Date(now);
      eventDate.setDate(eventDate.getDate() - ev.daysAgo);
      const dateStr = eventDate.toISOString().split('T')[0];

      const result = await db.query(`
        INSERT INTO events (venue_id, event_date, event_name, source, is_verified, created_by_user_id)
        VALUES ($1, $2, $3, 'user_created', true, $4)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [venues[venueIdx].id, dateStr, ev.name, demoUserId]);

      if (result.rows[0]) {
        eventIds.push(result.rows[0].id);
        console.log(`  + ${ev.name} at ${venues[venueIdx].name} (${dateStr})`);

        // Add 1-3 bands to lineup
        const bandCount = Math.min(1 + (i % 3), bands.length);
        for (let b = 0; b < bandCount; b++) {
          const bandIdx = (i * 2 + b) % bands.length;
          await db.query(`
            INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
          `, [result.rows[0].id, bands[bandIdx].id, b + 1, b === 0]);
        }
      }
    }
    console.log(`  Created ${eventIds.length} events\n`);

    // Step 5: Create check-ins for past events
    console.log('Step 5: Creating check-ins...');
    const checkinIds: string[] = [];

    // Only create check-ins for past events (positive daysAgo values)
    const pastEventCount = Math.min(8, eventIds.length);
    for (let i = 0; i < pastEventCount; i++) {
      const venueIdx = Math.min(eventData[i].venueIdx, venues.length - 1);
      const eventDate = new Date(now);
      eventDate.setDate(eventDate.getDate() - eventData[i].daysAgo);

      // Skip future events
      if (eventData[i].daysAgo <= 0) continue;

      const locationVerified = i % 3 !== 2; // ~66% verified
      const venueRating = i % 2 === 0 ? (3.5 + (i % 4) * 0.5) : null; // Some with ratings

      const result = await db.query(`
        INSERT INTO checkins (user_id, event_id, venue_rating, location_verified, event_date, rating)
        VALUES ($1, $2, $3, $4, $5, 0)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [
        demoUserId,
        eventIds[i],
        venueRating,
        locationVerified,
        eventDate.toISOString().split('T')[0],
      ]);

      if (result.rows[0]) {
        checkinIds.push(result.rows[0].id);
        console.log(`  + Check-in at ${venues[venueIdx].name} (verified: ${locationVerified})`);
      }
    }
    console.log(`  Created ${checkinIds.length} check-ins\n`);

    // Step 6: Create band ratings for check-ins
    console.log('Step 6: Creating band ratings...');
    let ratingCount = 0;
    for (let i = 0; i < Math.min(6, checkinIds.length); i++) {
      // Get the first band from this event's lineup
      const lineupResult = await db.query(`
        SELECT el.band_id FROM event_lineup el
        JOIN checkins c ON c.event_id = el.event_id
        WHERE c.id = $1
        ORDER BY el.set_order
        LIMIT 1
      `, [checkinIds[i]]);

      if (lineupResult.rows[0]) {
        const rating = 3.0 + (i % 5) * 0.5; // Ratings 3.0-5.0
        await db.query(`
          INSERT INTO checkin_band_ratings (checkin_id, band_id, rating)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [checkinIds[i], lineupResult.rows[0].band_id, rating]);
        ratingCount++;
      }
    }
    console.log(`  Created ${ratingCount} band ratings\n`);

    // Step 7: Create follow relationships
    console.log('Step 7: Creating follow relationships...');
    const otherUsers = await db.query(
      'SELECT id FROM users WHERE id != $1 AND is_active = true LIMIT 3',
      [demoUserId]
    );

    let followCount = 0;
    for (const user of otherUsers.rows) {
      await db.query(`
        INSERT INTO user_followers (follower_id, following_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [demoUserId, user.id]);
      followCount++;
    }
    console.log(`  Created ${followCount} follow relationships\n`);

    // Step 8: Award badges to demo user
    console.log('Step 8: Awarding badges...');
    const badgeNames = ['first_show', 'genre_explorer', 'venue_collector'];
    let badgeCount = 0;

    for (const badgeName of badgeNames) {
      // Try to find badge by badge_type or name
      const badgeResult = await db.query(
        'SELECT id FROM badges WHERE badge_type = $1 OR name ILIKE $2 LIMIT 1',
        [badgeName, `%${badgeName.replace('_', ' ')}%`]
      );

      if (badgeResult.rows[0]) {
        const checkinId = checkinIds.length > 0 ? checkinIds[badgeCount % checkinIds.length] : null;
        await db.query(`
          INSERT INTO user_badges (user_id, badge_id, earned_checkin_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, badge_id) DO NOTHING
        `, [demoUserId, badgeResult.rows[0].id, checkinId]);
        badgeCount++;
        console.log(`  + Awarded: ${badgeName}`);
      } else {
        console.log(`  - Badge not found: ${badgeName} (skip)`);
      }
    }
    console.log(`  Awarded ${badgeCount} badges\n`);

    // Summary
    console.log('Demo account seed completed successfully!\n');
    console.log('Summary:');
    console.log(`  Email: ${DEMO_EMAIL}`);
    console.log(`  Password: ${DEMO_PASSWORD}`);
    console.log(`  Events: ${eventIds.length}`);
    console.log(`  Check-ins: ${checkinIds.length}`);
    console.log(`  Band ratings: ${ratingCount}`);
    console.log(`  Follows: ${followCount}`);
    console.log(`  Badges: ${badgeCount}`);
    console.log(`\nUse these credentials in App Store Review Notes.\n`);

    process.exit(0);
  } catch (error) {
    console.error('Error seeding demo account:', error);
    process.exit(1);
  }
}

// Run the seed function
seedDemoAccount();
