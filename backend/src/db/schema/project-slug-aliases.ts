import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './users';

/**
 * Track renamed project slugs so clients with offline copies
 * can be redirected to the new slug.
 *
 * When a project slug is renamed:
 * 1. Old slug → new slug mapping is stored here
 * 2. Clients hitting the old endpoint get a redirect instruction
 * 3. Clients update their local IndexedDB databases accordingly
 */
export const projectSlugAliases = sqliteTable(
  'project_slug_aliases',
  {
    /** The old slug that was renamed */
    oldSlug: text('old_slug').notNull(),
    /** The user who owns the project */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The new slug the project was renamed to */
    newSlug: text('new_slug').notNull(),
    /** When the rename happened */
    renamedAt: integer('renamed_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.oldSlug, table.userId] }),
  })
);

export type ProjectSlugAlias = typeof projectSlugAliases.$inferSelect;
export type InsertProjectSlugAlias = typeof projectSlugAliases.$inferInsert;
