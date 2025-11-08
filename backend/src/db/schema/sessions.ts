import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const userSessions = sqliteTable('user_sessions', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).$type<Record<string, any>>(),
  expiredAt: integer('expiredAt', { mode: 'number' }).notNull(),
  createdAt: integer('createdAt', { mode: 'number' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'number' }).notNull(),
});

export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = typeof userSessions.$inferInsert;
