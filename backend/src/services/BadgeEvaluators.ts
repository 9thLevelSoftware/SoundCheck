/**
 * Badge Evaluator Registry
 *
 * Data-driven badge evaluation engine. Each evaluator is a parameterized
 * function that queries the database to determine if a user has met the
 * criteria for a specific badge type.
 *
 * Evaluators are registered by criteria.type (from badges.criteria JSONB).
 * BadgeService dispatches to the correct evaluator via evaluatorRegistry.get(type).
 *
 * 6 evaluator types:
 *   - checkin_count: Total check-ins
 *   - genre_explorer: Events attended for a specific genre
 *   - unique_venues: Distinct venues checked into
 *   - superfan: Most-seen band across events
 *   - festival_warrior: Max check-ins in a single day
 *   - road_warrior: Distinct cities or states visited
 */

import Database from '../config/database';

// ============================================
// Types
// ============================================

export interface EvalResult {
  current: number;
  target: number;
  earned: boolean;
  metadata?: Record<string, any>;
}

export type BadgeEvaluator = (userId: string, criteria: Record<string, any>) => Promise<EvalResult>;

// ============================================
// Registry
// ============================================

export const evaluatorRegistry: Map<string, BadgeEvaluator> = new Map();

// ============================================
// Evaluator: checkin_count
// ============================================

evaluatorRegistry.set('checkin_count', async (userId, criteria) => {
  const db = Database.getInstance();
  const result = await db.query('SELECT COUNT(*)::int as cnt FROM checkins WHERE user_id = $1', [
    userId,
  ]);
  const current = result.rows[0]?.cnt || 0;
  const target = criteria.threshold || 0;
  return { current, target, earned: current >= target };
});

// ============================================
// Evaluator: genre_explorer
// ============================================

evaluatorRegistry.set('genre_explorer', async (userId, criteria) => {
  const db = Database.getInstance();
  const genre = criteria.genre || '';
  const target = criteria.threshold || 0;

  const result = await db.query(
    `SELECT COUNT(DISTINCT c.event_id)::int as cnt
     FROM checkins c
     JOIN event_lineup el ON c.event_id = el.event_id
     JOIN bands b ON el.band_id = b.id
     WHERE c.user_id = $1 AND LOWER(b.genre) = LOWER($2)`,
    [userId, genre]
  );

  const current = result.rows[0]?.cnt || 0;
  return { current, target, earned: current >= target };
});

// ============================================
// Evaluator: unique_venues
// ============================================

evaluatorRegistry.set('unique_venues', async (userId, criteria) => {
  const db = Database.getInstance();
  const result = await db.query(
    'SELECT COUNT(DISTINCT venue_id)::int as cnt FROM checkins WHERE user_id = $1',
    [userId]
  );
  const current = result.rows[0]?.cnt || 0;
  const target = criteria.threshold || 0;
  return { current, target, earned: current >= target };
});

// ============================================
// Evaluator: superfan
// ============================================

evaluatorRegistry.set('superfan', async (userId, criteria) => {
  const db = Database.getInstance();
  const target = criteria.threshold || 0;

  const result = await db.query(
    `SELECT el.band_id, b.name as band_name, COUNT(DISTINCT c.event_id)::int as times_seen
     FROM checkins c
     JOIN event_lineup el ON c.event_id = el.event_id
     JOIN bands b ON el.band_id = b.id
     WHERE c.user_id = $1
     GROUP BY el.band_id, b.name
     ORDER BY times_seen DESC
     LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return { current: 0, target, earned: false };
  }

  const row = result.rows[0];
  const current = row.times_seen;
  const earned = current >= target;

  return {
    current,
    target,
    earned,
    metadata: earned ? { bandId: row.band_id, bandName: row.band_name } : undefined,
  };
});

// ============================================
// Evaluator: festival_warrior
// ============================================

evaluatorRegistry.set('festival_warrior', async (userId, criteria) => {
  const db = Database.getInstance();
  const target = criteria.threshold || 0;

  const result = await db.query(
    `SELECT DATE(created_at) as d, COUNT(*)::int as cnt
     FROM checkins
     WHERE user_id = $1
     GROUP BY DATE(created_at)
     ORDER BY cnt DESC
     LIMIT 1`,
    [userId]
  );

  const current = result.rows[0]?.cnt || 0;
  return { current, target, earned: current >= target };
});

// ============================================
// Evaluator: road_warrior
// ============================================

evaluatorRegistry.set('road_warrior', async (userId, criteria) => {
  const db = Database.getInstance();
  const target = criteria.threshold || 0;

  // Safe column mapping -- never interpolate user input directly
  const col = criteria.field === 'state' ? 'v.state' : 'v.city';

  const result = await db.query(
    `SELECT COUNT(DISTINCT ${col})::int as cnt
     FROM checkins c
     JOIN venues v ON c.venue_id = v.id
     WHERE c.user_id = $1 AND ${col} IS NOT NULL`,
    [userId]
  );

  const current = result.rows[0]?.cnt || 0;
  return { current, target, earned: current >= target };
});
