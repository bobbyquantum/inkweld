import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  version: integer('version').notNull().default(1),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description', { length: 1000 }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdDate: integer('created_date', { mode: 'number' }).notNull(),
  updatedDate: integer('updated_date', { mode: 'number' }).notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
