import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { projects } from './projects';
import { users } from './users';

/**
 * Activity events are an append-only audit log of meaningful actions taken
 * within a project, used to power both the project-scoped activity feed and
 * the cross-project home dashboard recent-activity widget.
 *
 * Events are emitted server-side by route handlers (and the Yjs WebSocket
 * layer for `document_edit`) as side effects of the operation that caused
 * them. They are kept indefinitely.
 *
 * `metadata` is a free-form JSON blob intended to hold event-type-specific
 * details (e.g. word counts before/after for an edit, the new role for a
 * collaborator change, the file format for a publish event). Consumers
 * should treat unknown keys as opaque.
 *
 * Timestamps are stored in milliseconds (consistent with sibling tables).
 */
export const ACTIVITY_EVENT_TYPES = [
  'document_edit',
  'snapshot_created',
  'comment_thread_created',
  'comment_reply_added',
  'file_published',
  'collaborator_invited',
  'collaborator_joined',
  'collaborator_role_changed',
  'collaborator_removed',
  'element_created',
  'element_renamed',
  'element_deleted',
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

export const activityEvents = sqliteTable(
  'activity_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventType: text('event_type', { length: 64 }).notNull().$type<ActivityEventType>(),
    entityId: text('entity_id', { length: 500 }),
    entityName: text('entity_name', { length: 500 }),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    projectIdx: index('activity_events_project_id_idx').on(table.projectId),
    userIdx: index('activity_events_user_id_idx').on(table.userId),
    projectCreatedIdx: index('activity_events_project_created_idx').on(
      table.projectId,
      table.createdAt
    ),
  })
);

export type ActivityEvent = typeof activityEvents.$inferSelect;
export type InsertActivityEvent = typeof activityEvents.$inferInsert;
