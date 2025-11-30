import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

interface SessionData {
  cookie?: {
    originalMaxAge?: number | null;
    expires?: string | null;
    secure?: boolean;
    httpOnly?: boolean;
    path?: string;
  };
  csrfToken?: string;
  userId?: string;
  [key: string]: unknown;
}

export const userSessions = sqliteTable('user_sessions', {
  id: text('id').primaryKey(),
  data: text('data', { mode: 'json' }).$type<SessionData>(),
  expiredAt: integer('expiredAt', { mode: 'number' }).notNull(),
  createdAt: integer('createdAt', { mode: 'number' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'number' }).notNull(),
});

export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = typeof userSessions.$inferInsert;
