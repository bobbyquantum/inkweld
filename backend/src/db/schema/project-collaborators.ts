import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { projects } from './projects';
import { users } from './users';

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
 * Project collaborators table
 * Manages access for users who are not the project owner
 */
export const projectCollaborators = sqliteTable(
  'project_collaborators',
  {
    /** Reference to the project */
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),

    /** Reference to the collaborator user */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Role: viewer (read-only), editor (read/write), admin (full access) */
    role: text('role').notNull().default('viewer'),

    /** Invitation status */
    status: text('status').notNull().default('pending'),

    /** User who invited this collaborator */
    invitedBy: text('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),

    /** When the invitation was created */
    invitedAt: integer('invited_at', { mode: 'number' }).notNull(),

    /** When the invitation was accepted (null if pending/declined) */
    acceptedAt: integer('accepted_at', { mode: 'number' }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })]
);

export type ProjectCollaborator = typeof projectCollaborators.$inferSelect;
export type InsertProjectCollaborator = typeof projectCollaborators.$inferInsert;
