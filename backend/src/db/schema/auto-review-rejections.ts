import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { projects } from './projects';
import { users } from './users';

export const autoReviewRejections = sqliteTable(
  'auto_review_rejections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Yjs document ID, e.g. "username:slug:docName/" */
    documentId: text('document_id', { length: 500 }).notNull(),
    /** Bare element ID (without username:slug prefix) */
    elementId: text('element_id').notNull(),
    originalText: text('original_text').notNull(),
    suggestionText: text('suggestion_text').notNull(),
    category: text('category'),
    message: text('message'),
    rejectedBy: text('rejected_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rejectedAt: integer('rejected_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('idx_auto_review_rejections_project').on(table.projectId),
    index('idx_auto_review_rejections_document').on(table.documentId),
    index('idx_auto_review_rejections_element').on(table.elementId),
  ]
);

export type AutoReviewRejection = typeof autoReviewRejections.$inferSelect;
export type InsertAutoReviewRejection = typeof autoReviewRejections.$inferInsert;
