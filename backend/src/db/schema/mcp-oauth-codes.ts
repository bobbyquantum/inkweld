import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { users } from './users';
import { mcpOAuthClients } from './mcp-oauth-clients';

/**
 * MCP OAuth Authorization Codes - Short-lived codes for token exchange
 *
 * Authorization codes are issued after user consent and exchanged for tokens.
 * They are single-use and expire quickly (5 minutes).
 *
 * Security:
 * - Codes are hashed before storage
 * - PKCE code_challenge is stored for verification
 * - Codes are deleted after use or expiration
 */
export const mcpOAuthCodes = sqliteTable(
  'mcp_oauth_codes',
  {
    /** Code ID (UUID) - internal reference */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** SHA-256 hash of the authorization code */
    codeHash: text('code_hash').notNull().unique(),

    /** Reference to the user who authorized */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Reference to the OAuth client */
    clientId: text('client_id')
      .notNull()
      .references(() => mcpOAuthClients.id, { onDelete: 'cascade' }),

    /** PKCE code_challenge (S256 hash of code_verifier) */
    codeChallenge: text('code_challenge').notNull(),

    /** PKCE code_challenge_method (always 'S256') */
    codeChallengeMethod: text('code_challenge_method').notNull().default('S256'),

    /** The redirect_uri used in the authorization request */
    redirectUri: text('redirect_uri').notNull(),

    /**
     * JSON array of granted project access
     * Format: [{ "projectId": "...", "role": "viewer|editor|admin" }, ...]
     */
    grants: text('grants').notNull(),

    /** OAuth scope string (space-separated) */
    scope: text('scope'),

    /** OAuth state parameter (passed through) */
    state: text('state'),

    /** When this code was created */
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),

    /** When this code expires (5 minutes from creation) */
    expiresAt: integer('expires_at').notNull(),

    /** Whether this code has been used */
    usedAt: integer('used_at'),
  },
  (table) => [
    // Index for code lookup during token exchange
    index('mcp_oauth_codes_hash_idx').on(table.codeHash),
    // Index for cleanup of expired codes
    index('mcp_oauth_codes_expires_idx').on(table.expiresAt),
  ]
);

export type McpOAuthCode = typeof mcpOAuthCodes.$inferSelect;
export type InsertMcpOAuthCode = typeof mcpOAuthCodes.$inferInsert;

/**
 * Parsed grant from authorization code
 */
export interface OAuthCodeGrant {
  projectId: string;
  role: 'viewer' | 'editor' | 'admin';
}
