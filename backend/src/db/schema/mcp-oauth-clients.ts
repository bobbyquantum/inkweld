import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * OAuth client types
 */
export const oauthClientTypes = ['public', 'confidential'] as const;
export type OAuthClientType = (typeof oauthClientTypes)[number];

/**
 * MCP OAuth Clients - Registered OAuth 2.1 clients (DCR or pre-registered)
 *
 * Clients are applications that can request access to user projects via OAuth.
 * Examples: Claude Desktop, Cursor IDE, custom AI assistants.
 *
 * Supports both:
 * - Dynamic Client Registration (RFC 7591) - clients register themselves
 * - Pre-registered clients - manually configured by admins
 */
export const mcpOAuthClients = sqliteTable(
  'mcp_oauth_clients',
  {
    /** Client ID (UUID) - used in OAuth flows */
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Human-readable name displayed in consent UI */
    clientName: text('client_name').notNull(),

    /** Client's homepage URL (optional, for display) */
    clientUri: text('client_uri'),

    /** URL to client's logo (optional, for display in consent UI) */
    logoUri: text('logo_uri'),

    /** JSON array of allowed redirect URIs */
    redirectUris: text('redirect_uris').notNull(),

    /**
     * Client type: 'public' (no secret) or 'confidential' (has secret)
     * Public clients: SPAs, native apps, CLI tools
     * Confidential clients: Server-side apps with secure secret storage
     */
    clientType: text('client_type').notNull().default('public'),

    /**
     * SHA-256 hash of client secret (null for public clients)
     * Only confidential clients have secrets
     */
    clientSecretHash: text('client_secret_hash'),

    /** First 8 chars of secret for identification (like API key prefix) */
    clientSecretPrefix: text('client_secret_prefix'),

    /** Contact email for the client developer (optional) */
    contactEmail: text('contact_email'),

    /** Policy URL (optional) */
    policyUri: text('policy_uri'),

    /** Terms of service URL (optional) */
    tosUri: text('tos_uri'),

    /** Whether this client was registered via DCR */
    isDynamic: integer('is_dynamic', { mode: 'boolean' }).notNull().default(true),

    /** Creation timestamp (ms since epoch) */
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),

    /** Last update timestamp */
    updatedAt: integer('updated_at').$defaultFn(() => Date.now()),
  },
  (table) => [
    // Index for looking up clients by name (for admin UI)
    index('mcp_oauth_clients_name_idx').on(table.clientName),
  ]
);

export type McpOAuthClient = typeof mcpOAuthClients.$inferSelect;
export type InsertMcpOAuthClient = typeof mcpOAuthClients.$inferInsert;

/**
 * Public representation of an OAuth client (safe to expose to users)
 */
export interface PublicOAuthClient {
  id: string;
  clientName: string;
  clientUri: string | null;
  logoUri: string | null;
}
