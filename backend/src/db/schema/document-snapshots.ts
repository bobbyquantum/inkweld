import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { projects } from './projects';
import { users } from './users';

export const documentSnapshots = sqliteTable('document_snapshots', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  documentId: text('document_id', { length: 500 }).notNull(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name', { length: 255 }).notNull(),
  description: text('description'),
  yDocState: blob('y_doc_state', { mode: 'buffer' }).notNull(),
  stateVector: blob('state_vector', { mode: 'buffer' }),
  wordCount: integer('word_count'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type DocumentSnapshot = typeof documentSnapshots.$inferSelect;
export type InsertDocumentSnapshot = typeof documentSnapshots.$inferInsert;
