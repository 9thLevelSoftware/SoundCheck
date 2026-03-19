import Database from '../config/database';
import * as dotenv from 'dotenv';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import logger from '../utils/logger';

// Load environment variables
dotenv.config();

const db = Database.getInstance();

// SEC-015: Read demo password from env or generate a random one.
// Never use a hardcoded password in seed scripts.
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || crypto.randomBytes(16).toString('base64url');
const SALT_ROUNDS = 12; // matches AuthUtils.hashPassword

interface DemoAccountConfig {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  bio: string;
}

const DEMO_ACCOUNTS: DemoAccountConfig[] = [
  {
    email: 'demo@soundcheck.app',
    username: 'demo_user',
    firstName: 'Demo',
    lastName: 'User',
    bio: 'Live music enthusiast. Catch me at a show near you!',
  },
  {
    email: 'demo2@soundcheck.app',
    username: 'indie_sam',
    firstName: 'Sam',
    lastName: 'Rivers',
    bio: 'Indie rock forever. 200+ shows and counting.',
  },
  {
    email: 'demo3@soundcheck.app',
    username: 'jazz_miles',
    firstName: 'Miles',
    lastName: 'Chen',
    bio: 'Jazz, blues, and everything in between.',
  },
  {
    email: 'demo4@soundcheck.app',
    username: 'metal_alex',
    firstName: 'Alex',
    lastName: 'Storm',
    bio: "If it's heavy, I'm there. Mosh pit regular.",
  },
  {
    email: 'demo5@soundcheck.app',
    username: 'festival_luna',
    firstName: 'Luna',
    lastName: 'Park',
    bio: 'Festival season is all year round for me.',
  },
];

/**
 * Seed a single demo account with events, check-ins, band ratings, and badges.
 * Returns the created user ID.
 */
async function seedAccount(
  config: DemoAccountConfig,
  passwordHash: string,
  venues: any[],
  bands: any[],
  accountIndex: number
): Promise<{ userId: string; eventIds: string[]; checkinIds: string[] }> {
  console.log(`\n--- Seeding account: ${config.username} (${config.email}) ---`);

  // Create or update user
  const userResult = await db.query(
    `INSERT INTO users (email, username, password_hash, first_name, last_name, bio, is_active, is_demo)
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
     RETURNING id`,
    [config.email, config.username, passwordHash, config.firstName, config.lastName, config.bio]
  );

  const userId = userResult.rows[0].id;
  console.log(`  User ID: ${userId}`);

  // Create events spread over the past 3 months (offset by account index for variety)
  const now = new Date();
  const baseOffset = accountIndex * 7; // stagger events across accounts

  const eventConfigs = [
    { venueIdx: accountIndex % venues.length, daysAgo: 75 + baseOffset, name: `${config.firstName}'s Rock Night` },
    { venueIdx: (accountIndex + 1) % venues.length, daysAgo: 60 + baseOffset, name: `${config.firstName}'s Sessions` },
    { venueIdx: (accountIndex + 2) % venues.length, daysAgo: 45 + baseOffset, name: 'Underground Show' },
    { venueIdx: (accountIndex + 3) % venues.length, daysAgo: 30 + baseOffset, name: 'Electric Beats Night' },
    { venueIdx: (accountIndex + 4) % venues.length, daysAgo: 20 + baseOffset, name: 'Jazz & Blues Evening' },
    { venueIdx: (accountIndex + 5) % venues.length, daysAgo: 10 + baseOffset, name: 'Metal Mayhem' },
    { venueIdx: (accountIndex + 6) % venues.length, daysAgo: 5 + baseOffset, name: 'Folk Festival' },
    { venueIdx: (accountIndex + 7) % venues.length, daysAgo: 3 + baseOffset, name: 'Late Night Showcase' },
  ];

  // Each account gets 5-8 events depending on account index
  const eventCount = 5 + (accountIndex % 4);
  const eventIds: string[] = [];

  for (let i = 0; i < eventCount && i < eventConfigs.length && i < venues.length; i++) {
    const ev = eventConfigs[i];
    const venueIdx = Math.min(ev.venueIdx, venues.length - 1);
    const eventDate = new Date(now);
    eventDate.setDate(eventDate.getDate() - ev.daysAgo);
    const dateStr = eventDate.toISOString().split('T')[0];

    const result = await db.query(
      `INSERT INTO events (venue_id, event_date, event_name, source, is_verified, created_by_user_id)
       VALUES ($1, $2, $3, 'user_created', true, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [venues[venueIdx].id, dateStr, ev.name, userId]
    );

    if (result.rows[0]) {
      eventIds.push(result.rows[0].id);
      console.log(`  + Event: ${ev.name} at ${venues[venueIdx].name} (${dateStr})`);

      // Add 1-3 bands to lineup
      const bandCount = Math.min(1 + (i % 3), bands.length);
      for (let b = 0; b < bandCount; b++) {
        const bandIdx = (accountIndex * 3 + i * 2 + b) % bands.length;
        await db.query(
          `INSERT INTO event_lineup (event_id, band_id, set_order, is_headliner)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [result.rows[0].id, bands[bandIdx].id, b + 1, b === 0]
        );
      }
    }
  }

  // Create check-ins for past events
  const checkinIds: string[] = [];
  for (let i = 0; i < eventIds.length; i++) {
    const ev = eventConfigs[i];
    if (!ev || ev.daysAgo <= 0) continue;

    const eventDate = new Date(now);
    eventDate.setDate(eventDate.getDate() - ev.daysAgo);

    const isVerified = i % 3 !== 2; // ~66% verified
    const venueRating = i % 2 === 0 ? (3.5 + (i % 4) * 0.5) : null;

    const result = await db.query(
      `INSERT INTO checkins (user_id, event_id, venue_rating, is_verified, event_date, rating)
       VALUES ($1, $2, $3, $4, $5, 0)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [userId, eventIds[i], venueRating, isVerified, eventDate.toISOString().split('T')[0]]
    );

    if (result.rows[0]) {
      checkinIds.push(result.rows[0].id);
    }
  }
  console.log(`  Check-ins: ${checkinIds.length}`);

  // Create band ratings for check-ins
  let ratingCount = 0;
  for (let i = 0; i < Math.min(6, checkinIds.length); i++) {
    const lineupResult = await db.query(
      `SELECT el.band_id FROM event_lineup el
       JOIN checkins c ON c.event_id = el.event_id
       WHERE c.id = $1
       ORDER BY el.set_order
       LIMIT 1`,
      [checkinIds[i]]
    );

    if (lineupResult.rows[0]) {
      const rating = 3.0 + (i % 5) * 0.5;
      await db.query(
        `INSERT INTO checkin_band_ratings (checkin_id, band_id, rating)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [checkinIds[i], lineupResult.rows[0].band_id, rating]
      );
      ratingCount++;
    }
  }
  console.log(`  Band ratings: ${ratingCount}`);

  // Award badges
  const badgeNames = ['first_show', 'genre_explorer', 'venue_collector'];
  const badgeSubset = badgeNames.slice(0, 2 + (accountIndex % 2)); // 2-3 badges per account
  let badgeCount = 0;

  for (const badgeName of badgeSubset) {
    const badgeResult = await db.query(
      'SELECT id FROM badges WHERE badge_type = $1 OR name ILIKE $2 LIMIT 1',
      [badgeName, `%${badgeName.replace('_', ' ')}%`]
    );

    if (badgeResult.rows[0]) {
      const checkinId = checkinIds.length > 0 ? checkinIds[badgeCount % checkinIds.length] : null;
      await db.query(
        `INSERT INTO user_badges (user_id, badge_id, earned_checkin_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, badge_id) DO NOTHING`,
        [userId, badgeResult.rows[0].id, checkinId]
      );
      badgeCount++;
    }
  }
  console.log(`  Badges: ${badgeCount}`);

  return { userId, eventIds, checkinIds };
}

async function seedAllDemoAccounts() {
  console.log('Starting multi-account demo seed...\n');

  try {
    // Check database connection
    const isHealthy = await db.healthCheck();
    if (!isHealthy) {
      throw new Error('Database connection failed');
    }
    console.log('Database connection successful\n');

    // Ensure is_demo column exists
    console.log('Ensuring is_demo column exists...');
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false`);
    console.log('  is_demo column ready\n');

    // Hash password once (shared across all accounts)
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

    // Fetch existing seed venues and bands
    console.log('Fetching existing venues and bands...');
    const venuesResult = await db.query('SELECT id, name, city FROM venues ORDER BY name LIMIT 10');
    const bandsResult = await db.query('SELECT id, name, genre FROM bands ORDER BY name LIMIT 15');

    const venues = venuesResult.rows;
    const bands = bandsResult.rows;

    if (venues.length === 0 || bands.length === 0) {
      console.log('  WARNING: No seed venues/bands found. Run "npm run seed" first.');
      console.log('  Skipping events, check-ins, and ratings.\n');
      process.exit(0);
    }

    console.log(`  Found ${venues.length} venues and ${bands.length} bands\n`);

    // Seed all demo accounts
    const accountResults: { userId: string; eventIds: string[]; checkinIds: string[] }[] = [];

    for (let i = 0; i < DEMO_ACCOUNTS.length; i++) {
      const result = await seedAccount(DEMO_ACCOUNTS[i], passwordHash, venues, bands, i);
      accountResults.push(result);
    }

    // Create cross-follow relationships between demo accounts
    console.log('\n--- Creating cross-follow relationships ---');
    let followCount = 0;

    for (let i = 0; i < accountResults.length; i++) {
      // Each account follows 2-4 other demo accounts
      const followTargets: number[] = [];
      for (let j = 1; j <= 4 && followTargets.length < 2 + (i % 3); j++) {
        const targetIdx = (i + j) % accountResults.length;
        if (targetIdx !== i) {
          followTargets.push(targetIdx);
        }
      }

      for (const targetIdx of followTargets) {
        await db.query(
          `INSERT INTO user_followers (follower_id, following_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [accountResults[i].userId, accountResults[targetIdx].userId]
        );
        followCount++;
      }
    }

    // Also follow any existing non-demo users
    for (const account of accountResults) {
      const otherUsers = await db.query(
        'SELECT id FROM users WHERE id != $1 AND is_active = true AND (is_demo IS NOT TRUE) LIMIT 2',
        [account.userId]
      );
      for (const user of otherUsers.rows) {
        await db.query(
          `INSERT INTO user_followers (follower_id, following_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [account.userId, user.id]
        );
        followCount++;
      }
    }

    console.log(`  Created ${followCount} follow relationships\n`);

    // Summary
    console.log('=== Demo Account Seed Complete ===\n');
    console.log('Accounts created:');
    for (let i = 0; i < DEMO_ACCOUNTS.length; i++) {
      const acc = DEMO_ACCOUNTS[i];
      const res = accountResults[i];
      console.log(`  ${acc.username} (${acc.email})`);
      console.log(`    Events: ${res.eventIds.length} | Check-ins: ${res.checkinIds.length}`);
    }
    console.log(`\nShared password: ${DEMO_PASSWORD}`);
    console.log(`Total follows: ${followCount}`);
    console.log('\nUse these credentials in App Store Review Notes.\n');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding demo accounts:', error);
    process.exit(1);
  }
}

// Run the seed function
seedAllDemoAccounts();
