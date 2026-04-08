import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { commentThreads } from './comment-threads';
import { users } from './users';

export const commentMessages = sqliteTable(
  'comment_messages',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    threadId: text('thread_id')
      .notNull()
      .references(() => commentThreads.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    editedAt: integer('edited_at', { mode: 'number' }),
  },
  (table) => [
    index('idx_comment_messages_thread').on(table.threadId),
    index('idx_comment_messages_author').on(table.authorId),
  ]
);

export type CommentMessage = typeof commentMessages.$inferSelect;
export type InsertCommentMessage = typeof commentMessages.$inferInsert;
