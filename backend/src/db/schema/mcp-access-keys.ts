import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { projects } from './projects';

/**
 * MCP (Model Context Protocol) access keys for per-project API access.
 *
 * Keys allow external AI agents to access project data via the MCP protocol.
 * Each key is scoped to a single project with configurable permissions.
 *
 * Security:
 * - Keys are generated as `iw_proj_{random_32_chars}`
 * - Only the SHA-256 hash is stored (never the plain key)
 * - keyPrefix stores first 8 chars for identification in UI
 */
export const mcpAccessKeys = sqliteTable(
  'mcp_access_keys',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Reference to the project this key grants access to */
    projectId: text('projectId')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),

    /** User-friendly name for the key (e.g., "Claude Desktop", "Cursor IDE") */
    name: text('name').notNull(),

    /** SHA-256 hash of the full API key */
    keyHash: text('keyHash').notNull().unique(),

    /** First 8 characters of the key for identification (e.g., "iw_proj_a") */
    keyPrefix: text('keyPrefix').notNull(),

    /**
     * JSON array of permission scopes granted to this key.
     * Available scopes:
     * - read:project     - Read project metadata
     * - read:elements    - Read project tree/elements
     * - read:documents   - Read document content
     * - read:worldbuilding - Read worldbuilding data & relationships
     * - read:schemas     - Read template schemas
     * - read:media       - Access media library
     * - write:elements   - Create/update/delete elements
     * - write:worldbuilding - Update worldbuilding data
     * - write:schemas    - Create/update custom templates
     * - write:media      - Upload media
     */
    permissions: text('permissions').notNull().default('["read:project","read:elements"]'),

    /** Optional expiration timestamp (ms since epoch). Null = never expires */
    expiresAt: integer('expiresAt'),

    /** Timestamp of last successful use (ms since epoch) */
    lastUsedAt: integer('lastUsedAt'),

    /** IP address of last use (for audit purposes) */
    lastUsedIp: text('lastUsedIp'),

    /** Creation timestamp (ms since epoch) */
    createdAt: integer('createdAt')
      .notNull()
      .$defaultFn(() => Date.now()),

    /** Revocation timestamp (ms since epoch). Null = not revoked */
    revokedAt: integer('revokedAt'),

    /** Reason for revocation (if revoked) */
    revokedReason: text('revokedReason'),
  },
  (table) => [
    // Index for looking up keys by project
    index('mcp_access_keys_project_idx').on(table.projectId),
    // Index for quick key lookup by hash
    index('mcp_access_keys_hash_idx').on(table.keyHash),
  ]
);

export type McpAccessKey = typeof mcpAccessKeys.$inferSelect;
export type InsertMcpAccessKey = typeof mcpAccessKeys.$inferInsert;

/**
 * Available MCP permission scopes
 */
export const MCP_PERMISSIONS = {
  // Read permissions
  READ_PROJECT: 'read:project',
  READ_ELEMENTS: 'read:elements',
  READ_WORLDBUILDING: 'read:worldbuilding',
  READ_SCHEMAS: 'read:schemas',

  // Write permissions
  WRITE_ELEMENTS: 'write:elements',
  WRITE_WORLDBUILDING: 'write:worldbuilding',
} as const;

export type McpPermission = (typeof MCP_PERMISSIONS)[keyof typeof MCP_PERMISSIONS];

/**
 * Default permission sets for common use cases
 */
export const MCP_PERMISSION_PRESETS = {
  /** Read-only access to all project data */
  READ_ONLY: [
    MCP_PERMISSIONS.READ_PROJECT,
    MCP_PERMISSIONS.READ_ELEMENTS,
    MCP_PERMISSIONS.READ_WORLDBUILDING,
    MCP_PERMISSIONS.READ_SCHEMAS,
  ],

  /** Full read/write access */
  FULL_ACCESS: [
    MCP_PERMISSIONS.READ_PROJECT,
    MCP_PERMISSIONS.READ_ELEMENTS,
    MCP_PERMISSIONS.READ_WORLDBUILDING,
    MCP_PERMISSIONS.READ_SCHEMAS,
    MCP_PERMISSIONS.WRITE_ELEMENTS,
    MCP_PERMISSIONS.WRITE_WORLDBUILDING,
  ],

  /** Worldbuilding-focused access */
  WORLDBUILDING: [
    MCP_PERMISSIONS.READ_PROJECT,
    MCP_PERMISSIONS.READ_ELEMENTS,
    MCP_PERMISSIONS.READ_WORLDBUILDING,
    MCP_PERMISSIONS.READ_SCHEMAS,
    MCP_PERMISSIONS.WRITE_WORLDBUILDING,
  ],
} as const;
