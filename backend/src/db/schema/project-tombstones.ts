import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Track deleted projects so clients with offline copies know not to re-upload them.
 *
 * When a project is deleted:
 * 1. A tombstone record is created with the slug and deletion timestamp
 * 2. Clients checking their local projects can query this table
 * 3. Clients finding a tombstone for a local project should purge it
 *
 * Similar pattern to project_slug_aliases for renames.
 */
export const projectTombstones = sqliteTable(
  'project_tombstones',
  {
    /** The slug of the deleted project */
    slug: text('slug').notNull(),
    /** The user who owned the project */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** When the project was deleted */
    deletedAt: integer('deleted_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.slug, table.userId] }),
  })
);

export type ProjectTombstone = typeof projectTombstones.$inferSelect;
export type InsertProjectTombstone = typeof projectTombstones.$inferInsert;
