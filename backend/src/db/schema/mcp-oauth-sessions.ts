import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { mcpOAuthClients } from './mcp-oauth-clients';

/**
 * MCP OAuth Sessions - Active OAuth authorization grants
 *
 * A session represents a user's authorization of a specific client.
 * One session can grant access to multiple projects (via project_collaborators).
 *
 * Token lifecycle:
 * - Access tokens: Short-lived (1 hour), JWT containing permission snapshot
 * - Refresh tokens: Long-lived (30 days), opaque reference to this session
 *
 * Security:
 * - Only refresh token hash is stored (never the plain token)
 * - Sessions can be revoked by user at any time
 * - Permission changes via collaborator UI take effect on next token refresh
 */
export const mcpOAuthSessions = sqliteTable(
  'mcp_oauth_sessions',
  {
    /** Session ID (UUID) */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Reference to the user who granted authorization */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Reference to the OAuth client */
    clientId: text('client_id')
      .notNull()
      .references(() => mcpOAuthClients.id, { onDelete: 'cascade' }),

    /**
     * SHA-256 hash of the current refresh token
     * Used to validate refresh requests
     */
    refreshTokenHash: text('refresh_token_hash').notNull(),

    /**
     * SHA-256 hash of the previous refresh token (for rotation tolerance)
     * Allows one retry if client fails to store new token
     */
    previousRefreshTokenHash: text('previous_refresh_token_hash'),

    /** When the previous token expires (short window for retry) */
    previousTokenExpiresAt: integer('previous_token_expires_at'),

    /** When this session was created */
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),

    /** When tokens were last issued/refreshed */
    lastUsedAt: integer('last_used_at'),

    /** Client IP at last use (for audit) */
    lastUsedIp: text('last_used_ip'),

    /** User agent at last use (for identification in UI) */
    lastUsedUserAgent: text('last_used_user_agent'),

    /**
     * When this session was revoked (null = active)
     * Revoked sessions cannot issue new tokens
     */
    revokedAt: integer('revoked_at'),

    /** Reason for revocation (for audit) */
    revokedReason: text('revoked_reason'),

    /** Refresh token expiration (ms since epoch) */
    expiresAt: integer('expires_at'),
  },
  (table) => [
    // Index for looking up sessions by user (for Connected Apps UI)
    index('mcp_oauth_sessions_user_idx').on(table.userId),
    // Index for looking up sessions by client
    index('mcp_oauth_sessions_client_idx').on(table.clientId),
    // Unique index for refresh token lookup
    uniqueIndex('mcp_oauth_sessions_refresh_token_idx').on(table.refreshTokenHash),
    // Index for previous token (rotation tolerance)
    index('mcp_oauth_sessions_prev_token_idx').on(table.previousRefreshTokenHash),
  ]
);

export type McpOAuthSession = typeof mcpOAuthSessions.$inferSelect;
export type InsertMcpOAuthSession = typeof mcpOAuthSessions.$inferInsert;

/**
 * Public representation of an OAuth session (for Connected Apps UI)
 */
export interface PublicOAuthSession {
  id: string;
  client: {
    id: string;
    name: string;
    logoUri: string | null;
  };
  createdAt: number;
  lastUsedAt: number | null;
  projectCount: number;
}
