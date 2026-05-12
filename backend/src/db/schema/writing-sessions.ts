import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { projects } from './projects';
import { users } from './users';

/**
 * Writing sessions track per-user, per-document editing sessions derived from
 * the Yjs WebSocket connection lifecycle.
 *
 * - A session starts when an authenticated WebSocket connects to a document
 *   and the starting word count is captured from the live Yjs doc.
 * - A session ends when the WebSocket disconnects (or the server tears down
 *   the connection); at that point the ending word count is captured and
 *   `wordsDelta` is computed.
 * - While a session is open, `sessionEnd`, `endWordCount`, and `wordsDelta`
 *   are null.
 *
 * Multiple users editing the same element each have their own session row;
 * concurrent editing can be derived by querying overlapping time windows
 * for the same `elementId`.
 *
 * Timestamps are stored in milliseconds (consistent with sibling tables like
 * document_snapshots and projects, NOT the seconds convention used by passkey
 * tables).
 */
export const writingSessions = sqliteTable(
  'writing_sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    elementId: text('element_id', { length: 500 }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionStart: integer('session_start', { mode: 'number' }).notNull(),
    sessionEnd: integer('session_end', { mode: 'number' }),
    startWordCount: integer('start_word_count').notNull(),
    endWordCount: integer('end_word_count'),
    wordsDelta: integer('words_delta'),
  },
  (table) => ({
    projectIdx: index('writing_sessions_project_id_idx').on(table.projectId),
    userIdx: index('writing_sessions_user_id_idx').on(table.userId),
    elementIdx: index('writing_sessions_element_id_idx').on(table.elementId),
    projectStartIdx: index('writing_sessions_project_start_idx').on(
      table.projectId,
      table.sessionStart
    ),
  })
);

export type WritingSession = typeof writingSessions.$inferSelect;
export type InsertWritingSession = typeof writingSessions.$inferInsert;
