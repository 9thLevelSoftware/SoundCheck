import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 018: Seed badge definitions
 *
 * Removes old review-based badge definitions (review_count, venue_explorer,
 * music_lover, event_attendance, helpful_count) and seeds ~37 new badge
 * definitions across 6 categories:
 *
 *   1. checkin_count (7 badges) -- milestone check-in counts
 *   2. genre_explorer (18 badges) -- 6 genres x 3 tiers
 *   3. unique_venues (3 badges) -- venue collector
 *   4. superfan (3 badges) -- same band seen N times
 *   5. festival_warrior (2 badges) -- multiple shows in one day
 *   6. road_warrior (4 badges) -- unique cities/states
 *
 * Each badge has a JSONB criteria column for data-driven evaluation.
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  // 1. Clean old review-based badge data
  pgm.sql('DELETE FROM user_badges;');
  pgm.sql('DELETE FROM badges;');

  // 2. Seed checkin_count badges (7)
  pgm.sql(`
    INSERT INTO badges (id, name, description, badge_type, requirement_value, criteria, color, icon_url) VALUES
    (gen_random_uuid(), 'First Check-in', 'Checked in to your first show', 'checkin_count', 1, '{"type":"checkin_count","threshold":1}', '#4CAF50', null),
    (gen_random_uuid(), 'Regular', '10 shows attended', 'checkin_count', 10, '{"type":"checkin_count","threshold":10}', '#66BB6A', null),
    (gen_random_uuid(), 'Dedicated', '25 shows attended', 'checkin_count', 25, '{"type":"checkin_count","threshold":25}', '#43A047', null),
    (gen_random_uuid(), 'Veteran', '50 shows attended', 'checkin_count', 50, '{"type":"checkin_count","threshold":50}', '#2E7D32', null),
    (gen_random_uuid(), 'Centurion', '100 shows attended', 'checkin_count', 100, '{"type":"checkin_count","threshold":100}', '#1B5E20', null),
    (gen_random_uuid(), 'Legend', '250 shows attended', 'checkin_count', 250, '{"type":"checkin_count","threshold":250}', '#FFD700', null),
    (gen_random_uuid(), 'Hall of Fame', '500 shows attended', 'checkin_count', 500, '{"type":"checkin_count","threshold":500}', '#FF6F00', null);
  `);

  // 3. Seed genre_explorer badges (6 genres x 3 tiers = 18)
  // Rock
  pgm.sql(`
    INSERT INTO badges (id, name, description, badge_type, requirement_value, criteria, color, icon_url) VALUES
    (gen_random_uuid(), 'Rock Novice', '5 rock shows attended', 'genre_explorer', 5, '{"type":"genre_explorer","genre":"rock","threshold":5}', '#E53935', null),
    (gen_random_uuid(), 'Rock Enthusiast', '10 rock shows attended', 'genre_explorer', 10, '{"type":"genre_explorer","genre":"rock","threshold":10}', '#E53935', null),
    (gen_random_uuid(), 'Rock Devotee', '25 rock shows attended', 'genre_explorer', 25, '{"type":"genre_explorer","genre":"rock","threshold":25}', '#E53935', null);
  `);
  // Metal
  pgm.sql(`
    INSERT INTO badges (id, name, description, badge_type, requirement_value, criteria, color, icon_url) VALUES
    (gen_random_uuid(), 'Metal Novice', '5 metal shows attended', 'genre_explorer', 5, '{"type":"genre_explorer","genre":"metal","threshold":5}', '#424242', null),
    (gen_random_uuid(), 'Metal Enthusiast', '10 metal shows attended', 'genre_explorer', 10, '{"type":"genre_explorer","genre":"metal","threshold":10}', '#424242', null),
    (gen_random_uuid(), 'Metal Devotee', '25 metal shows attended', 'genre_explorer', 25, '{"type":"genre_explorer","genre":"metal","threshold":25}', '#424242', null);
  `);
  // Jazz
  pgm.sql(`
    INSERT INTO badges (id, name, description, badge_type, requirement_value, criteria, color, icon_url) VALUES
    (gen_random_uuid(), 'Jazz Novice', '5 jazz shows attended', 'genre_explorer', 5, '{"type":"genre_explorer","genre":"jazz","threshold":5}', '#5C6BC0', null),
    (gen_random_uuid(), 'Jazz Enthusiast', '10 jazz shows attended', 'genre_explorer', 10, '{"type":"genre_explorer","genre":"jazz","threshold":10}', '#5C6BC0', null),
    (gen_random_uuid(), 'Jazz Devotee', '25 jazz shows attended', 'genre_explorer', 25, '{"type":"genre_explorer","genre":"jazz","threshold":25}', '#5C6BC0', null);
  `);
  // Electronic
  pgm.sql(`
    INSERT INTO badges (id, name, description, badge_type, requirement_value, criteria, color, icon_url) VALUES
    (gen_random_uuid(), 'Electronic Novice', '5 electronic shows attended', 'genre_explorer', 5, '{"type":"genre_explorer","genre":"electronic","threshold":5}', '#00ACC1', null),
    (gen_random_uuid(), 'Electronic Enthusiast', '10 electronic shows attended', 'genre_explorer', 10, '{"type":"genre_explorer","genre":"electronic","threshold":10}', '#00ACC1', null),
    (gen_random_uuid(), 'Electronic Devotee', '25 electronic shows attended', 'genre_explorer', 25, '{"type":"genre_explorer","genre":"electronic","threshold":25}', '#00ACC1', null);
  `);
  // Hip Hop
  pgm.sql(`
    INSERT INTO badges (id, name, description, badge_type, requirement_value, criteria, color, icon_url) VALUES
    (gen_random_uuid(), 'Hip Hop Novice', '5 hip hop shows attended', 'genre_explorer', 5, '{"type":"genre_explorer","genre":"hip hop","threshold":5}', '#8E24AA', null),
    (gen_random_uuid(), 'Hip Hop Enthusiast', '10 hip hop shows attended', 'genre_explorer', 10, '{"type":"genre_explorer","genre":"hip hop","threshold":10}', '#8E24AA', null),
    (gen_random_uuid(), 'Hip Hop Devotee', '25 hip hop shows attended', 'genre_explorer', 25, '{"type":"genre_explorer","genre":"hip hop","threshold":25}', '#8E24AA', null);
  `);
  // Folk
  pgm.sql(`
    INSERT INTO badges (id, name, description, badge_type, requirement_value, criteria, color, icon_url) VALUES
    (gen_random_uuid(), 'Folk Novice', '5 folk shows attended', 'genre_explorer', 5, '{"type":"genre_explorer","genre":"folk","threshold":5}', '#8D6E63', null),
    (gen_random_uuid(), 'Folk Enthusiast', '10 folk shows attended', 'genre_explorer', 10, '{"type":"genre_explorer","genre":"folk","threshold":10}', '#8D6E63', null),
    (gen_random_uuid(), 'Folk Devotee', '25 folk shows attended', 'genre_explorer', 25, '{"type":"genre_explorer","genre":"folk","threshold":25}', '#8D6E63', null);
  `);

  // 4. Seed unique_venues badges (3)
  pgm.sql(`
    INSERT INTO badges (id, name, description, badge_type, requirement_value, criteria, color, icon_url) VALUES
    (gen_random_uuid(), 'Venue Hopper', '10 unique venues', 'unique_venues', 10, '{"type":"unique_venues","threshold":10}', '#FF7043', null),
    (gen_random_uuid(), 'Venue Explorer', '25 unique venues', 'unique_venues', 25, '{"type":"unique_venues","threshold":25}', '#F4511E', null),
    (gen_random_uuid(), 'Venue Collector', '50 unique venues', 'unique_venues', 50, '{"type":"unique_venues","threshold":50}', '#BF360C', null);
  `);

  // 5. Seed superfan badges (3)
  pgm.sql(`
    INSERT INTO badges (id, name, description, badge_type, requirement_value, criteria, color, icon_url) VALUES
    (gen_random_uuid(), 'Repeat Offender', 'Seen the same band 3 times', 'superfan', 3, '{"type":"superfan","threshold":3}', '#AB47BC', null),
    (gen_random_uuid(), 'Superfan', 'Seen the same band 5 times', 'superfan', 5, '{"type":"superfan","threshold":5}', '#8E24AA', null),
    (gen_random_uuid(), 'Groupie', 'Seen the same band 10 times', 'superfan', 10, '{"type":"superfan","threshold":10}', '#6A1B9A', null);
  `);

  // 6. Seed festival_warrior badges (2)
  pgm.sql(`
    INSERT INTO badges (id, name, description, badge_type, requirement_value, criteria, color, icon_url) VALUES
    (gen_random_uuid(), 'Festival Goer', '3 shows in one day', 'festival_warrior', 3, '{"type":"festival_warrior","threshold":3}', '#FFA726', null),
    (gen_random_uuid(), 'Festival Warrior', '5 shows in one day', 'festival_warrior', 5, '{"type":"festival_warrior","threshold":5}', '#EF6C00', null);
  `);

  // 7. Seed road_warrior badges (4)
  pgm.sql(`
    INSERT INTO badges (id, name, description, badge_type, requirement_value, criteria, color, icon_url) VALUES
    (gen_random_uuid(), 'City Explorer', '5 unique cities', 'road_warrior', 5, '{"type":"road_warrior","field":"city","threshold":5}', '#26A69A', null),
    (gen_random_uuid(), 'City Conqueror', '10 unique cities', 'road_warrior', 10, '{"type":"road_warrior","field":"city","threshold":10}', '#00897B', null),
    (gen_random_uuid(), 'State Hopper', '5 unique states', 'road_warrior', 5, '{"type":"road_warrior","field":"state","threshold":5}', '#00796B', null),
    (gen_random_uuid(), 'Interstate Nomad', '10 unique states', 'road_warrior', 10, '{"type":"road_warrior","field":"state","threshold":10}', '#004D40', null);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Destructive but acceptable for seed data
  pgm.sql('DELETE FROM user_badges;');
  pgm.sql('DELETE FROM badges;');
}
