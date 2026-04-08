import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const commentReadStatus = sqliteTable(
  'comment_read_status',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Yjs document ID, e.g. "username:slug:docName" */
    documentId: text('document_id', { length: 500 }).notNull(),
    lastSeenAt: integer('last_seen_at', { mode: 'number' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.documentId] })]
);

export type CommentReadStatus = typeof commentReadStatus.$inferSelect;
export type InsertCommentReadStatus = typeof commentReadStatus.$inferInsert;
