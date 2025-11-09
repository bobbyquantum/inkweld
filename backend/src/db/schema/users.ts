import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: text('username').unique(),
  name: text('name'),
  email: text('email'),
  password: text('password'),
  githubId: text('githubId').unique(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
