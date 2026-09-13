import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const projects = sqliteTable(
  'projects',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    version: integer('version').notNull().default(1),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description', { length: 1000 }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    coverImage: text('cover_image'), // nullable - null when no cover, filename when cover exists
    /** Minimum client version required to open this project (e.g., "0.2.0") */
    minClientVersion: text('min_client_version'),
    createdDate: integer('created_date', { mode: 'number' }).notNull(),
    updatedDate: integer('updated_date', { mode: 'number' }).notNull(),
  },
  (table) => [
    // Every project request resolves `username/slug` -> project: the users
    // row is found by its unique username, then projects is probed by
    // (user_id, slug); the leading column also serves "all projects for a
    // user". UNIQUE because slug uniqueness per user was only enforced by a
    // check-then-insert in the route, which two concurrent requests defeat —
    // leaving two rows that share one Yjs/storage namespace, one of them
    // unreachable through findByUsernameAndSlug's LIMIT 1.
    uniqueIndex('projects_user_slug_unique').on(table.userId, table.slug),
  ]
);

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
