import Database from '../config/database';

/**
 * RsvpService: RSVP ("I'm Going") toggle and friends-going queries.
 *
 * Follows WishlistService pattern: Database.getInstance() singleton,
 * toggle-style create/delete, existence checks.
 *
 * Phase 10: Viral Growth Engine (Plan 01)
 */

export class RsvpService {
  private db = Database.getInstance();

  /**
   * Toggle RSVP for an event.
   * If the user already has an RSVP, delete it. Otherwise, create one.
   * Validates that the event exists and is active before inserting.
   */
  async toggleRsvp(userId: string, eventId: string): Promise<{ isGoing: boolean }> {
    // Try to delete first -- if a row was removed, the user was RSVP'd and is now un-RSVP'd
    const deleteResult = await this.db.query(
      `DELETE FROM event_rsvps WHERE user_id = $1 AND event_id = $2 RETURNING id`,
      [userId, eventId]
    );

    if (deleteResult.rows.length > 0) {
      return { isGoing: false };
    }

    // No existing RSVP -- validate event exists and is active before inserting
    const eventCheck = await this.db.query(
      `SELECT id FROM events WHERE id = $1 AND is_cancelled = FALSE`,
      [eventId]
    );
    if (eventCheck.rows.length === 0) {
      throw new Error('Event not found or cancelled');
    }

    // Insert RSVP with ON CONFLICT DO NOTHING for race-condition safety
    await this.db.query(
      `INSERT INTO event_rsvps (user_id, event_id) VALUES ($1, $2)
       ON CONFLICT (user_id, event_id) DO NOTHING`,
      [userId, eventId]
    );

    return { isGoing: true };
  }

  /**
   * Check if a user has RSVP'd to an event.
   */
  async isGoing(userId: string, eventId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM event_rsvps WHERE user_id = $1 AND event_id = $2`,
      [userId, eventId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get friends who have RSVP'd to an event.
   * "Friends" = users the current user follows (user_followers.follower_id = userId).
   * Returns up to 5 friend profiles + total count of friends going.
   */
  async getFriendsGoing(
    userId: string,
    eventId: string
  ): Promise<{ count: number; friends: { id: string; username: string; profileImageUrl: string | null }[] }> {
    // Count of friends going (users the current user follows who have RSVP'd)
    const countQuery = `
      SELECT COUNT(DISTINCT er.user_id)::int as friend_count
      FROM event_rsvps er
      JOIN user_followers uf ON er.user_id = uf.following_id
      JOIN users u ON er.user_id = u.id
      WHERE er.event_id = $1
        AND uf.follower_id = $2
        AND u.is_active = TRUE
    `;
    const countResult = await this.db.query(countQuery, [eventId, userId]);
    const count = countResult.rows[0]?.friend_count ?? 0;

    // Get up to 5 friend profiles
    const friendsQuery = `
      SELECT u.id, u.username, u.profile_image_url
      FROM event_rsvps er
      JOIN user_followers uf ON er.user_id = uf.following_id
      JOIN users u ON er.user_id = u.id
      WHERE er.event_id = $1
        AND uf.follower_id = $2
        AND u.is_active = TRUE
      ORDER BY er.created_at DESC
      LIMIT 5
    `;
    const friendsResult = await this.db.query(friendsQuery, [eventId, userId]);

    const friends = friendsResult.rows.map((row: any) => ({
      id: row.id,
      username: row.username,
      profileImageUrl: row.profile_image_url || null,
    }));

    return { count, friends };
  }

  /**
   * Get total RSVP count for an event.
   */
  async getRsvpCount(eventId: string): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*)::int as total FROM event_rsvps WHERE event_id = $1`,
      [eventId]
    );
    return result.rows[0]?.total ?? 0;
  }

  /**
   * Get all event IDs the user has RSVP'd to.
   * Used for batch checking RSVP status on event lists.
   */
  async getUserRsvps(userId: string): Promise<string[]> {
    const result = await this.db.query(
      `SELECT event_id FROM event_rsvps WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map((row: any) => row.event_id);
  }
}
