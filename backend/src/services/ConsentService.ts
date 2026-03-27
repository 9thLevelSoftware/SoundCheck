import Database from '../config/database';

/**
 * Valid consent purposes for GDPR compliance
 */
export const VALID_PURPOSES = [
  'location_tracking',
  'analytics',
  'marketing_emails',
  'third_party_sharing',
  'personalization',
] as const;

export type ConsentPurpose = (typeof VALID_PURPOSES)[number];

/**
 * Metadata for consent recording (IP/user agent for audit trail)
 */
export interface ConsentMetadata {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * A single consent record
 */
export interface ConsentRecord {
  id: string;
  userId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  recordedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Current consent status for a user (most recent consent for each purpose)
 */
export interface UserConsents {
  [purpose: string]:
    | {
        granted: boolean;
        recordedAt: string;
      }
    | undefined;
}

/**
 * Service for managing user consent records (GDPR compliance)
 */
export class ConsentService {
  private db = Database.getInstance();

  /**
   * Validate that a purpose is one of the valid consent purposes
   */
  private validatePurpose(purpose: string): purpose is ConsentPurpose {
    return VALID_PURPOSES.includes(purpose as ConsentPurpose);
  }

  /**
   * Record a consent decision (grant or revoke)
   * Each record is immutable - new records are added for audit trail
   */
  async recordConsent(
    userId: string,
    purpose: string,
    granted: boolean,
    metadata?: ConsentMetadata
  ): Promise<ConsentRecord> {
    // Validate purpose
    if (!this.validatePurpose(purpose)) {
      throw new Error(
        `Invalid consent purpose: ${purpose}. Valid purposes are: ${VALID_PURPOSES.join(', ')}`
      );
    }

    const query = `
      INSERT INTO user_consents (user_id, purpose, granted, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, purpose, granted, recorded_at, ip_address, user_agent
    `;

    const result = await this.db.query(query, [
      userId,
      purpose,
      granted,
      metadata?.ipAddress || null,
      metadata?.userAgent || null,
    ]);

    return this.mapRowToConsentRecord(result.rows[0]);
  }

  /**
   * Get the current (most recent) consent status for each purpose for a user
   */
  async getUserConsents(userId: string): Promise<UserConsents> {
    // Use DISTINCT ON to get the most recent consent for each purpose
    const query = `
      SELECT DISTINCT ON (purpose) purpose, granted, recorded_at
      FROM user_consents
      WHERE user_id = $1
      ORDER BY purpose, recorded_at DESC
    `;

    const result = await this.db.query(query, [userId]);

    const consents: UserConsents = {};
    for (const row of result.rows) {
      consents[row.purpose] = {
        granted: row.granted,
        recordedAt:
          row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
      };
    }

    return consents;
  }

  /**
   * Get the full consent history for a specific purpose (for audit trail)
   */
  async getConsentHistory(userId: string, purpose: string): Promise<ConsentRecord[]> {
    // Validate purpose
    if (!this.validatePurpose(purpose)) {
      throw new Error(
        `Invalid consent purpose: ${purpose}. Valid purposes are: ${VALID_PURPOSES.join(', ')}`
      );
    }

    const query = `
      SELECT id, user_id, purpose, granted, recorded_at, ip_address, user_agent
      FROM user_consents
      WHERE user_id = $1 AND purpose = $2
      ORDER BY recorded_at DESC
    `;

    const result = await this.db.query(query, [userId, purpose]);
    return result.rows.map((row: any) => this.mapRowToConsentRecord(row));
  }

  /**
   * Check if a user has granted consent for a specific purpose
   * Returns the most recent consent status
   */
  async hasConsent(userId: string, purpose: string): Promise<boolean> {
    // Validate purpose
    if (!this.validatePurpose(purpose)) {
      throw new Error(
        `Invalid consent purpose: ${purpose}. Valid purposes are: ${VALID_PURPOSES.join(', ')}`
      );
    }

    const query = `
      SELECT granted
      FROM user_consents
      WHERE user_id = $1 AND purpose = $2
      ORDER BY recorded_at DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [userId, purpose]);

    if (result.rows.length === 0) {
      // No consent record found - treat as not consented
      return false;
    }

    return result.rows[0].granted;
  }

  /**
   * Revoke all active consents for a user
   * Records a revocation for each purpose that was previously granted
   */
  async revokeAllConsents(userId: string, metadata?: ConsentMetadata): Promise<number> {
    // Get current consents
    const currentConsents = await this.getUserConsents(userId);

    // Find purposes that are currently granted
    const grantedPurposes = Object.entries(currentConsents)
      .filter(([_, status]) => status?.granted)
      .map(([purpose]) => purpose);

    if (grantedPurposes.length === 0) {
      return 0;
    }

    // Record revocation for each granted purpose
    for (const purpose of grantedPurposes) {
      await this.recordConsent(userId, purpose, false, metadata);
    }

    return grantedPurposes.length;
  }

  /**
   * Get all valid consent purposes
   */
  getValidPurposes(): readonly string[] {
    return VALID_PURPOSES;
  }

  /**
   * Map a database row to a ConsentRecord object
   */
  private mapRowToConsentRecord(row: any): ConsentRecord {
    return {
      id: row.id,
      userId: row.user_id,
      purpose: row.purpose as ConsentPurpose,
      granted: row.granted,
      recordedAt: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }
}
