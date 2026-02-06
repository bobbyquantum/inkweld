import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { projects } from './projects';
import { users } from './users';
import { mcpOAuthSessions } from './mcp-oauth-sessions';

/**
 * Collaboration roles for project access
 */
export const collaboratorRoles = ['viewer', 'editor', 'admin'] as const;
export type CollaboratorRole = (typeof collaboratorRoles)[number];

/**
 * Invitation status for collaborators
 */
export const invitationStatuses = ['pending', 'accepted', 'declined'] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

/**
 * Collaborator types
 */
export const collaboratorTypes = ['user', 'oauth_app'] as const;
export type CollaboratorType = (typeof collaboratorTypes)[number];

/**
 * Project collaborators table
 * Manages access for users AND OAuth apps who are not the project owner
 *
 * Supports two types of collaborators:
 * - 'user': Human collaborators invited to the project
 * - 'oauth_app': AI assistants granted access via OAuth consent flow
 *
 * For OAuth apps:
 * - userId is the user who granted access (the project owner or admin)
 * - mcpSessionId references the OAuth session
 * - status is always 'accepted' (no invitation flow)
 * - Permission changes here take effect on next token refresh
 */
export const projectCollaborators = sqliteTable(
  'project_collaborators',
  {
    /** Auto-increment primary key */
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),

    /** Reference to the project */
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),

    /**
     * Reference to the collaborator user
     * - For 'user' type: The collaborating user
     * - For 'oauth_app' type: The user who granted access
     */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /**
     * Reference to MCP OAuth session (null for human collaborators)
     * When set, this row represents an AI assistant's access grant
     */
    mcpSessionId: text('mcp_session_id').references(() => mcpOAuthSessions.id, {
      onDelete: 'cascade',
    }),

    /**
     * Type of collaborator:
     * - 'user': Human collaborator
     * - 'oauth_app': AI assistant via OAuth
     */
    collaboratorType: text('collaborator_type').notNull().default('user'),

    /** Role: viewer (read-only), editor (read/write), admin (full access) */
    role: text('role').notNull().default('viewer'),

    /** Invitation status (for users) / always 'accepted' for OAuth apps */
    status: text('status').notNull().default('pending'),

    /** User who invited/granted access */
    invitedBy: text('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),

    /** When the invitation/grant was created */
    invitedAt: integer('invited_at', { mode: 'number' }).notNull(),

    /** When the invitation was accepted (null if pending/declined) */
    acceptedAt: integer('accepted_at', { mode: 'number' }),
  },
  (table) => [
    // Unique index for human collaborators: one entry per (project, user)
    // Uses partial index - only applies when collaborator_type = 'user'
    uniqueIndex('project_collaborators_user_unique_idx')
      .on(table.projectId, table.userId)
      .where(sql`${table.collaboratorType} = 'user'`),
    // Unique index for OAuth apps: one entry per (project, session)
    // Uses partial index - only applies when mcp_session_id is not null
    uniqueIndex('project_collaborators_oauth_unique_idx')
      .on(table.projectId, table.mcpSessionId)
      .where(sql`${table.mcpSessionId} IS NOT NULL`),
    // Index for finding all OAuth grants for a session (for token generation)
    index('project_collaborators_session_idx').on(table.mcpSessionId),
    // Index for finding all collaborators of a project
    index('project_collaborators_project_idx').on(table.projectId),
  ]
);

export type ProjectCollaborator = typeof projectCollaborators.$inferSelect;
export type InsertProjectCollaborator = typeof projectCollaborators.$inferInsert;

/**
 * Convert collaborator role to MCP permissions
 */
export function roleToMcpPermissions(role: CollaboratorRole): string[] {
  switch (role) {
    case 'viewer':
      return ['read:project', 'read:elements', 'read:worldbuilding', 'read:schemas'];
    case 'editor':
      return [
        'read:project',
        'read:elements',
        'read:worldbuilding',
        'read:schemas',
        'write:elements',
        'write:worldbuilding',
      ];
    case 'admin':
      return [
        'read:project',
        'read:elements',
        'read:worldbuilding',
        'read:schemas',
        'write:elements',
        'write:worldbuilding',
      ];
    default:
      return ['read:project'];
  }
}
