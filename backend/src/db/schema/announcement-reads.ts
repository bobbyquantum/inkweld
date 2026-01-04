import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { announcements } from './announcements';
import { users } from './users';

export const announcementReads = sqliteTable(
  'announcement_reads',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    announcementId: text('announcementId')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: integer('readAt', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('announcement_user_idx').on(table.announcementId, table.userId)]
);

export type AnnouncementRead = typeof announcementReads.$inferSelect;
export type InsertAnnouncementRead = typeof announcementReads.$inferInsert;
