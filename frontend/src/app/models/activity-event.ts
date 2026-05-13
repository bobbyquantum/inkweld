/**
 * Activity event models — mirror of the `/api/v1/activity` API responses.
 *
 * Activity events are an append-only audit log of meaningful actions taken
 * within a project: document edits, snapshots, comments, publishes, and
 * collaborator changes. The frontend uses them to power the project-scoped
 * activity tab and the cross-project home dashboard "what's new" widget.
 *
 * Keep `ActivityEventType` in sync with `ACTIVITY_EVENT_TYPES` in
 * `backend/src/db/schema/activity-events.ts`.
 */

export type ActivityEventType =
  | 'document_edit'
  | 'snapshot_created'
  | 'comment_thread_created'
  | 'comment_reply_added'
  | 'file_published'
  | 'collaborator_invited'
  | 'collaborator_joined'
  | 'collaborator_role_changed'
  | 'collaborator_removed'
  | 'element_created'
  | 'element_renamed'
  | 'element_deleted';

/** Event as returned by the project-scoped feed. */
export interface ProjectActivityEvent {
  id: string;
  projectId: string;
  userId: string | null;
  /** Resolved username; null for non-user actors or when the account is gone. */
  username: string | null;
  /**
   * Display label for non-user actors (e.g. MCP API key name or "MCP").
   * Set when `userId` is null; null for human-user events.
   */
  actorLabel: string | null;
  eventType: ActivityEventType;
  /** Type-specific entity reference (snapshot id, element id, …). */
  entityId: string | null;
  /** Display name for the entity if known at write time. */
  entityName: string | null;
  /** Free-form structured details — shape varies by `eventType`. */
  metadata: Record<string, unknown> | null;
  /** Unix milliseconds. */
  createdAt: number;
}

/** Same as `ProjectActivityEvent` but enriched with project metadata for the cross-project feed. */
export interface UserActivityEvent extends ProjectActivityEvent {
  projectSlug: string | null;
  projectTitle: string | null;
  projectOwnerUsername: string | null;
}

export interface ProjectActivityResponse {
  events: ProjectActivityEvent[];
  /** Cursor for the next page; null when there are no more events. */
  nextBefore: number | null;
}

export interface UserActivityResponse {
  events: UserActivityEvent[];
  nextBefore: number | null;
}
