import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { projects } from './projects';
import { users } from './users';

export const commentThreads = sqliteTable(
  'comment_threads',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** Yjs document ID, e.g. "username:slug:docName" */
    documentId: text('document_id', { length: 500 }).notNull(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
    resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: integer('resolved_at', { mode: 'number' }),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('idx_comment_threads_project').on(table.projectId),
    index('idx_comment_threads_document').on(table.documentId),
    index('idx_comment_threads_author').on(table.authorId),
  ]
);

export type CommentThread = typeof commentThreads.$inferSelect;
export type InsertCommentThread = typeof commentThreads.$inferInsert;
