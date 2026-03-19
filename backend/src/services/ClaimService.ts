import Database from '../config/database';
import {
  VerificationClaim,
  CreateClaimRequest,
  ReviewClaimRequest,
  ClaimStatus,
  ClaimEntityType,
} from '../types';
import { NotFoundError, ConflictError, BadRequestError } from '../utils/errors';

export class ClaimService {
  private db = Database.getInstance();

  // SEC-008: Lookup map for entity type -> table name to avoid string interpolation.
  // This is a static allow-list; no user input can influence the table name.
  private static readonly ENTITY_TABLE_MAP: Record<string, string> = {
    venue: 'venues',
    band: 'bands',
  };

  /**
   * Resolve a validated entity type to its database table name.
   * Throws if the entity type is not in the allow-list.
   */
  private static resolveTable(entityType: string): string {
    const table = ClaimService.ENTITY_TABLE_MAP[entityType];
    if (!table) {
      throw new BadRequestError('entityType must be "venue" or "band"');
    }
    return table;
  }

  /**
   * Submit a new verification claim for a venue or band.
   * The partial unique index on verification_claims enforces one pending claim per entity.
   */
  async submitClaim(userId: string, request: CreateClaimRequest): Promise<VerificationClaim> {
    const { entityType, entityId, evidenceText, evidenceUrl } = request;

    // Validate entityType and resolve table via lookup map
    const table = ClaimService.resolveTable(entityType);

    // Verify entity exists
    const entityResult = await this.db.query(
      `SELECT id FROM ${table} WHERE id = $1 AND is_active = true`,
      [entityId]
    );
    if (entityResult.rows.length === 0) {
      throw new NotFoundError(`${entityType === 'venue' ? 'Venue' : 'Band'} not found`);
    }

    // Check if user already has an approved claim for this entity
    const approvedResult = await this.db.query(
      `SELECT id FROM verification_claims
       WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3 AND status = 'approved'`,
      [userId, entityType, entityId]
    );
    if (approvedResult.rows.length > 0) {
      throw new ConflictError('You already have an approved claim for this entity');
    }

    // Insert claim — partial unique index enforces one pending per entity
    try {
      const result = await this.db.query(
        `INSERT INTO verification_claims (user_id, entity_type, entity_id, status, evidence_text, evidence_url)
         VALUES ($1, $2, $3, 'pending', $4, $5)
         RETURNING *`,
        [userId, entityType, entityId, evidenceText || null, evidenceUrl || null]
      );
      return this.mapClaimRow(result.rows[0]);
    } catch (error: any) {
      // Catch unique violation from partial unique index (one pending per entity)
      if (error.code === '23505') {
        throw new ConflictError('A pending claim already exists for this entity');
      }
      throw error;
    }
  }

  /**
   * Get all claims for the authenticated user.
   */
  async getMyClaims(userId: string): Promise<VerificationClaim[]> {
    const result = await this.db.query(
      `SELECT vc.*,
              CASE vc.entity_type
                WHEN 'venue' THEN v.name
                WHEN 'band' THEN b.name
              END AS entity_name
       FROM verification_claims vc
       LEFT JOIN venues v ON vc.entity_type = 'venue' AND vc.entity_id = v.id
       LEFT JOIN bands b ON vc.entity_type = 'band' AND vc.entity_id = b.id
       WHERE vc.user_id = $1
       ORDER BY vc.created_at DESC`,
      [userId]
    );
    return result.rows.map((row: any) => this.mapClaimRow(row));
  }

  /**
   * Get a single claim by ID with entity and user details.
   */
  async getClaimById(claimId: string): Promise<VerificationClaim> {
    const result = await this.db.query(
      `SELECT vc.*,
              CASE vc.entity_type
                WHEN 'venue' THEN v.name
                WHEN 'band' THEN b.name
              END AS entity_name,
              u.username AS user_name,
              u.email AS user_email
       FROM verification_claims vc
       LEFT JOIN venues v ON vc.entity_type = 'venue' AND vc.entity_id = v.id
       LEFT JOIN bands b ON vc.entity_type = 'band' AND vc.entity_id = b.id
       LEFT JOIN users u ON vc.user_id = u.id
       WHERE vc.id = $1`,
      [claimId]
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('Claim not found');
    }
    return this.mapClaimRow(result.rows[0]);
  }

  /**
   * Get all pending claims for admin review (FIFO order).
   */
  async getPendingClaims(): Promise<VerificationClaim[]> {
    const result = await this.db.query(
      `SELECT vc.*,
              CASE vc.entity_type
                WHEN 'venue' THEN v.name
                WHEN 'band' THEN b.name
              END AS entity_name,
              u.username AS user_name,
              u.email AS user_email
       FROM verification_claims vc
       LEFT JOIN venues v ON vc.entity_type = 'venue' AND vc.entity_id = v.id
       LEFT JOIN bands b ON vc.entity_type = 'band' AND vc.entity_id = b.id
       LEFT JOIN users u ON vc.user_id = u.id
       WHERE vc.status = 'pending'
       ORDER BY vc.created_at ASC`
    );
    return result.rows.map((row: any) => this.mapClaimRow(row));
  }

  /**
   * Get all claims with optional status filter (admin).
   */
  async getAllClaims(status?: ClaimStatus): Promise<VerificationClaim[]> {
    let query = `
      SELECT vc.*,
             CASE vc.entity_type
               WHEN 'venue' THEN v.name
               WHEN 'band' THEN b.name
             END AS entity_name,
             u.username AS user_name,
             u.email AS user_email
      FROM verification_claims vc
      LEFT JOIN venues v ON vc.entity_type = 'venue' AND vc.entity_id = v.id
      LEFT JOIN bands b ON vc.entity_type = 'band' AND vc.entity_id = b.id
      LEFT JOIN users u ON vc.user_id = u.id
    `;
    const values: any[] = [];

    if (status) {
      query += ` WHERE vc.status = $1`;
      values.push(status);
    }

    query += ` ORDER BY vc.created_at DESC`;

    const result = await this.db.query(query, values);
    return result.rows.map((row: any) => this.mapClaimRow(row));
  }

  /**
   * Admin review: approve or deny a claim.
   * Uses a transaction to atomically update the claim and (on approval) the entity.
   */
  async reviewClaim(
    claimId: string,
    adminUserId: string,
    decision: ReviewClaimRequest
  ): Promise<VerificationClaim> {
    const client = await this.db.getClient();

    try {
      await client.query('BEGIN');

      // Update the claim status (only if currently pending)
      const claimResult = await client.query(
        `UPDATE verification_claims
         SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3, updated_at = NOW()
         WHERE id = $4 AND status = 'pending'
         RETURNING *`,
        [decision.status, adminUserId, decision.reviewNotes || null, claimId]
      );

      if (claimResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new NotFoundError('Claim not found or already reviewed');
      }

      const claim = claimResult.rows[0];

      // If approved, update the entity with claimed_by_user_id
      if (decision.status === 'approved') {
        const table = ClaimService.resolveTable(claim.entity_type);
        await client.query(
          `UPDATE ${table} SET claimed_by_user_id = $1 WHERE id = $2`,
          [claim.user_id, claim.entity_id]
        );
      }

      await client.query('COMMIT');

      // Fetch the full claim with JOINs for return
      return await this.getClaimById(claimId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Map a database row to a VerificationClaim object.
   */
  private mapClaimRow(row: any): VerificationClaim {
    return {
      id: row.id,
      userId: row.user_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      status: row.status,
      evidenceText: row.evidence_text || undefined,
      evidenceUrl: row.evidence_url || undefined,
      reviewedBy: row.reviewed_by || undefined,
      reviewedAt: row.reviewed_at || undefined,
      reviewNotes: row.review_notes || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      entityName: row.entity_name || undefined,
      userName: row.user_name || undefined,
      userEmail: row.user_email || undefined,
    };
  }
}
