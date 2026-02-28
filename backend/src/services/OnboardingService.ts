import Database from '../config/database';

/**
 * OnboardingService: Genre preference CRUD and onboarding completion tracking.
 *
 * Manages user_genre_preferences table and onboarding_completed_at column
 * on the users table.
 *
 * Phase 10: Viral Growth Engine (Plan 01)
 */

export class OnboardingService {
  private db = Database.getInstance();

  /**
   * Save genre preferences for a user.
   * Replaces all existing preferences (DELETE + INSERT batch).
   * Validates that genres array contains 3-8 items.
   */
  async saveGenrePreferences(userId: string, genres: string[]): Promise<void> {
    if (genres.length < 3 || genres.length > 8) {
      throw new Error('Must select between 3 and 8 genres');
    }

    // Delete existing preferences
    await this.db.query(
      `DELETE FROM user_genre_preferences WHERE user_id = $1`,
      [userId]
    );

    // Batch insert new preferences
    if (genres.length > 0) {
      const values = genres
        .map((_, i) => `($1, $${i + 2})`)
        .join(', ');
      const params = [userId, ...genres];

      await this.db.query(
        `INSERT INTO user_genre_preferences (user_id, genre) VALUES ${values}
         ON CONFLICT (user_id, genre) DO NOTHING`,
        params
      );
    }
  }

  /**
   * Get genre preferences for a user.
   */
  async getGenrePreferences(userId: string): Promise<string[]> {
    const result = await this.db.query(
      `SELECT genre FROM user_genre_preferences WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    return result.rows.map((row: any) => row.genre);
  }

  /**
   * Mark onboarding as complete by setting onboarding_completed_at timestamp.
   */
  async completeOnboarding(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET onboarding_completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Check if onboarding is complete for a user.
   */
  async isOnboardingComplete(userId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT onboarding_completed_at FROM users WHERE id = $1`,
      [userId]
    );
    return result.rows.length > 0 && result.rows[0].onboarding_completed_at !== null;
  }
}
