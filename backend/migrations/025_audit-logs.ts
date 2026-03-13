import type { MigrationBuilder } from 'node-pg-migrate';

/**
 * Migration 025: Create audit_logs table
 *
 * Audit logging for compliance and security monitoring.
 * Records user actions with timestamps, IP addresses, and user agents.
 *
 * Actions: CREATE, UPDATE, DELETE, EXPORT, LOGIN, LOGOUT, PERMISSION_CHANGE
 * Resource types: users, checkins, user_badges, refresh_tokens, etc.
 *
 * Indexed for querying by:
 *   - user_id: Find all actions by a specific user
 *   - action: Find all instances of a specific action type
 *   - created_at: Time-range queries for security audits
 */

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(50) NOT NULL,
      resource_type VARCHAR(50) NOT NULL,
      resource_id UUID,
      metadata JSONB DEFAULT '{}',
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Index for finding all actions by a user
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user
      ON audit_logs(user_id);

    -- Index for finding all instances of a specific action
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action
      ON audit_logs(action);

    -- Index for time-range queries
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created
      ON audit_logs(created_at);

    -- Composite index for user + time range queries (common audit pattern)
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created
      ON audit_logs(user_id, created_at DESC);

    -- Add comment for documentation
    COMMENT ON TABLE audit_logs IS 'Audit trail for user actions. Fire-and-forget writes, no blocking on main operations.';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_audit_logs_user_created;
    DROP INDEX IF EXISTS idx_audit_logs_created;
    DROP INDEX IF EXISTS idx_audit_logs_action;
    DROP INDEX IF EXISTS idx_audit_logs_user;
    DROP TABLE IF EXISTS audit_logs;
  `);
}
