import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

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
  isAdmin: integer('isAdmin', { mode: 'boolean' }).notNull().default(false),
  hasAvatar: integer('hasAvatar', { mode: 'boolean' }).notNull().default(false),
  // Whether the user has uploaded a personal background image (mirrors
  // hasAvatar: the bytes live in storage, this flag saves a storage round-trip
  // when rendering).
  hasBackground: integer('hasBackground', { mode: 'boolean' }).notNull().default(false),
  // Free-form per-user UI preferences as a JSON object. Kept as one column
  // rather than a table per preference so device-independent settings can be
  // added without a migration each time. See UserPreferences in
  // services/user-preferences.service.ts for the shape.
  preferences: text('preferences'),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
