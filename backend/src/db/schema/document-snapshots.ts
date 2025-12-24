import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { projects } from './projects';
import { users } from './users';

export const documentSnapshots = sqliteTable('document_snapshots', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  documentId: text('document_id', { length: 500 }).notNull(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name', { length: 255 }).notNull(),
  description: text('description'),
  xmlContent: text('xml_content'),
  worldbuildingData: text('worldbuilding_data', { mode: 'json' }).$type<Record<string, unknown>>(),
  wordCount: integer('word_count'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
});

export type DocumentSnapshot = typeof documentSnapshots.$inferSelect;
export type InsertDocumentSnapshot = typeof documentSnapshots.$inferInsert;
