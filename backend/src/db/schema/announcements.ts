import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const announcements = sqliteTable('announcements', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  content: text('content').notNull(),
  type: text('type', { enum: ['announcement', 'update', 'maintenance'] })
    .notNull()
    .default('announcement'),
  priority: text('priority', { enum: ['low', 'normal', 'high'] })
    .notNull()
    .default('normal'),
  isPublic: integer('isPublic', { mode: 'boolean' }).notNull().default(true),
  publishedAt: integer('publishedAt', { mode: 'timestamp' }),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }),
  createdAt: integer('createdAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  createdBy: text('createdBy')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;
