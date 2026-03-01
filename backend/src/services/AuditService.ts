/**
 * Audit Service -- Compliance and security audit logging
 *
 * Fire-and-forget pattern: audit logging never blocks main operations.
 * All log() calls are non-awaited to prevent performance impact.
 *
 * Supported actions: CREATE, UPDATE, DELETE, EXPORT, LOGIN, LOGOUT, PERMISSION_CHANGE
 * Resource types: users, checkins, user_badges, refresh_tokens, etc.
 *
 * Usage:
 *   const auditService = new AuditService();
 *   auditService.log(userId, 'CREATE', 'checkins', checkinId, { venueName }, req);
 *
 * The log() method returns a Promise but callers should NOT await it.
 * Use the fire-and-forget pattern:
 *   auditService.log(...).catch(err => logger.error('[AuditService] Log failed', { error: err.message }));
 */

import Database from '../config/database';
import { Request } from 'express';
import logger from '../utils/logger';

/**
 * Valid audit action types
 */
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'EXPORT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PERMISSION_CHANGE';

/**
 * Common resource types for audit logging
 */
export type AuditResourceType =
  | 'users'
  | 'checkins'
  | 'user_badges'
  | 'refresh_tokens'
  | 'reviews'
  | 'events'
  | 'venues'
  | 'bands';

/**
 * Audit log entry structure (matches database schema)
 */
export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, any>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * Query options for retrieving audit logs
 */
export interface AuditLogQueryOptions {
  userId?: string;
  action?: AuditAction;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class AuditService {
  private db = Database.getInstance();

  /**
   * Log an audit event.
   *
   * Fire-and-forget pattern: callers should NOT await this method.
   * Instead, chain a .catch() to handle errors silently:
   *
   *   auditService.log(userId, 'CREATE', 'checkins', id, {}, req)
   *     .catch(err => logger.error('[AuditService] Log failed', { error: err.message }));
   *
   * @param userId - ID of the user performing the action (null for failed logins)
   * @param action - The action type (CREATE, UPDATE, DELETE, EXPORT, LOGIN, LOGOUT, PERMISSION_CHANGE)
   * @param resourceType - Type of resource being acted upon (users, checkins, etc.)
   * @param resourceId - ID of the specific resource (null for non-specific actions)
   * @param metadata - Additional context (JSON-serializable)
   * @param req - Express request object for extracting IP and user agent
   */
  async log(
    userId: string | null,
    action: AuditAction,
    resourceType: string,
    resourceId: string | null = null,
    metadata: Record<string, any> = {},
    req?: Request
  ): Promise<void> {
    const ipAddress = req ? this.extractIpAddress(req) : null;
    const userAgent = req?.headers['user-agent'] || null;

    const query = `
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;

    const values = [
      userId,
      action,
      resourceType,
      resourceId,
      JSON.stringify(metadata),
      ipAddress,
      userAgent,
    ];

    await this.db.query(query, values);
  }

  /**
   * Convenience method for logging user creation
   */
  logUserCreated(userId: string, req?: Request): void {
    this.log(userId, 'CREATE', 'users', userId, {}, req)
      .catch(err => logger.error('[AuditService] Log failed', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }

  /**
   * Convenience method for logging profile updates
   */
  logProfileUpdated(userId: string, updatedFields: string[], req?: Request): void {
    this.log(userId, 'UPDATE', 'users', userId, { updatedFields }, req)
      .catch(err => logger.error('[AuditService] Log failed', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }

  /**
   * Convenience method for logging user deletion
   */
  logUserDeleted(userId: string, scheduledAt: Date, req?: Request): void {
    this.log(userId, 'DELETE', 'users', userId, { scheduledAt: scheduledAt.toISOString() }, req)
      .catch(err => logger.error('[AuditService] Log failed', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }

  /**
   * Convenience method for logging data export
   */
  logDataExport(userId: string, req?: Request): void {
    this.log(userId, 'EXPORT', 'users', userId, {}, req)
      .catch(err => logger.error('[AuditService] Log failed', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }

  /**
   * Convenience method for logging successful login
   */
  logLoginSuccess(userId: string, method: string, req?: Request): void {
    this.log(userId, 'LOGIN', 'users', userId, { success: true, method }, req)
      .catch(err => logger.error('[AuditService] Log failed', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }

  /**
   * Convenience method for logging failed login
   */
  logLoginFailure(email: string, reason: string, req?: Request): void {
    this.log(null, 'LOGIN', 'users', null, { success: false, email, reason }, req)
      .catch(err => logger.error('[AuditService] Log failed', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }

  /**
   * Convenience method for logging logout
   */
  logLogout(userId: string, req?: Request): void {
    this.log(userId, 'LOGOUT', 'refresh_tokens', null, {}, req)
      .catch(err => logger.error('[AuditService] Log failed', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }

  /**
   * Convenience method for logging social auth linkage
   */
  logSocialAuthLinked(userId: string, provider: string, req?: Request): void {
    this.log(userId, 'PERMISSION_CHANGE', 'users', userId, { provider, action: 'linked' }, req)
      .catch(err => logger.error('[AuditService] Log failed', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }

  /**
   * Convenience method for logging check-in creation
   */
  logCheckinCreated(userId: string, checkinId: string, metadata: Record<string, any>, req?: Request): void {
    this.log(userId, 'CREATE', 'checkins', checkinId, metadata, req)
      .catch(err => logger.error('[AuditService] Log failed', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }

  /**
   * Convenience method for logging badge award
   */
  logBadgeAwarded(userId: string, badgeId: string, badgeName: string, req?: Request): void {
    this.log(userId, 'CREATE', 'user_badges', badgeId, { badgeName }, req)
      .catch(err => logger.error('[AuditService] Log failed', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }));
  }

  /**
   * Query audit logs with filters.
   *
   * Unlike log(), this method IS awaited since it returns data.
   *
   * @param options - Query filters (userId, action, resourceType, date range, pagination)
   * @returns Array of audit log entries
   */
  async query(options: AuditLogQueryOptions = {}): Promise<{
    logs: AuditLogEntry[];
    total: number;
    hasMore: boolean;
  }> {
    const { userId, action, resourceType, startDate, endDate, limit = 50, offset = 0 } = options;

    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (userId) {
      conditions.push(`user_id = $${paramCount}`);
      values.push(userId);
      paramCount++;
    }

    if (action) {
      conditions.push(`action = $${paramCount}`);
      values.push(action);
      paramCount++;
    }

    if (resourceType) {
      conditions.push(`resource_type = $${paramCount}`);
      values.push(resourceType);
      paramCount++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramCount}`);
      values.push(startDate);
      paramCount++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramCount}`);
      values.push(endDate);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total matching records
    const countQuery = `SELECT COUNT(*) FROM audit_logs ${whereClause}`;
    const countResult = await this.db.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    // Fetch paginated results
    values.push(limit);
    values.push(offset);
    const query = `
      SELECT id, user_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const result = await this.db.query(query, values);

    const logs: AuditLogEntry[] = result.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      action: row.action as AuditAction,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      metadata: row.metadata || {},
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    }));

    return {
      logs,
      total,
      hasMore: offset + logs.length < total,
    };
  }

  /**
   * Get audit logs for a specific user (for data export/GDPR compliance)
   */
  async getUserAuditHistory(userId: string, limit = 100): Promise<AuditLogEntry[]> {
    const result = await this.query({ userId, limit });
    return result.logs;
  }

  /**
   * Extract client IP address from request, handling proxies
   */
  private extractIpAddress(req: Request): string | null {
    // Check for forwarded IP (behind proxy/load balancer)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ips.trim();
    }

    // Check for real IP header (Cloudflare, nginx)
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fall back to direct connection
    return req.socket?.remoteAddress || null;
  }
}
