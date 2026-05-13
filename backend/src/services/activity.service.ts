import { eq, desc, sql, and, gte } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import {
  activityEvents,
  type ActivityEvent,
  type ActivityEventType,
  type InsertActivityEvent,
} from '../db/schema/activity-events';
import { logger } from './logger.service';

const log = logger.child('Activity');

/** Default coalesce window for repeat document_edit events: 5 minutes (ms). */
export const DEFAULT_EDIT_COALESCE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Append-only log of meaningful project events. Events are emitted as a
 * side effect by the route handler that performs the underlying mutation;
 * `record()` is best-effort and never throws to its caller — failures are
 * logged but do not roll back the originating action.
 *
 * Every mutation that writes a row here is something a human collaborator
 * might want to see in the activity feed (snapshots, comments, publishes,
 * collaborator changes, …).
 */
class ActivityService {
  /**
   * Emit an event. Swallows errors so a failed log write never blocks the
   * underlying user action.
   *
   * Either `userId` or `actorLabel` must be provided. For human users pass
   * `userId`; for non-user actors (e.g. MCP API keys) pass `actorLabel` with
   * the key's display name and omit `userId`.
   */
  async record(
    db: DatabaseInstance,
    data: {
      projectId: string;
      userId?: string | null;
      actorLabel?: string | null;
      eventType: ActivityEventType;
      entityId?: string | null;
      entityName?: string | null;
      metadata?: Record<string, unknown> | null;
    }
  ): Promise<void> {
    try {
      const row: InsertActivityEvent = {
        id: crypto.randomUUID(),
        projectId: data.projectId,
        userId: data.userId ?? null,
        actorLabel: data.actorLabel ?? null,
        eventType: data.eventType,
        entityId: data.entityId ?? null,
        entityName: data.entityName ?? null,
        metadata: data.metadata ?? null,
        createdAt: Date.now(),
      };
      await db.insert(activityEvents).values(row);
    } catch (err) {
      // Best-effort: never let activity logging break a user action.
      log.error('Failed to record activity event', err, {
        projectId: data.projectId,
        eventType: data.eventType,
      });
    }
  }

  /**
   * Emit a `document_edit` event, coalescing with the most recent matching
   * event for the same `(projectId, userId|actorLabel, entityId)` if it
   * occurred within `windowMs` (default 5 min). On coalesce we accumulate
   * `wordsDelta` and `durationMs`, replace `endWordCount` with the latest
   * value, refresh `entityName` (in case the document was renamed), and bump
   * `createdAt` so the event re-surfaces at the top of feeds. Otherwise we
   * insert a new row.
   *
   * Either `userId` or `actorLabel` must be provided (same contract as
   * {@link record}).
   *
   * Best-effort like {@link record}: failures are logged and swallowed.
   */
  async recordOrCoalesceEdit(
    db: DatabaseInstance,
    data: {
      projectId: string;
      userId?: string | null;
      actorLabel?: string | null;
      entityId: string;
      entityName?: string | null;
      wordsDelta: number;
      endWordCount: number;
      durationMs: number;
      windowMs?: number;
    }
  ): Promise<void> {
    const windowMs = data.windowMs ?? DEFAULT_EDIT_COALESCE_WINDOW_MS;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Build actor filter: match on userId when set, otherwise on actorLabel.
    const actorFilter = data.userId
      ? eq(activityEvents.userId, data.userId)
      : eq(activityEvents.actorLabel, data.actorLabel ?? '');

    try {
      // Find the most recent document_edit event for this (project, actor, entity)
      // within the coalesce window. We sort by createdAt DESC and take 1.
      const existing = await db
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.projectId, data.projectId),
            actorFilter,
            eq(activityEvents.eventType, 'document_edit'),
            eq(activityEvents.entityId, data.entityId),
            gte(activityEvents.createdAt, windowStart)
          )
        )
        .orderBy(desc(activityEvents.createdAt))
        .limit(1);

      if (existing.length > 0) {
        const prev = existing[0];
        const prevMeta = (prev.metadata ?? {}) as {
          wordsDelta?: number;
          durationMs?: number;
        };
        const mergedMetadata = {
          ...prevMeta,
          wordsDelta: (prevMeta.wordsDelta ?? 0) + data.wordsDelta,
          endWordCount: data.endWordCount,
          durationMs: (prevMeta.durationMs ?? 0) + data.durationMs,
          coalesced: true,
        };
        await db
          .update(activityEvents)
          .set({
            entityName: data.entityName ?? prev.entityName,
            metadata: mergedMetadata,
            createdAt: now,
          })
          .where(eq(activityEvents.id, prev.id));
        return;
      }

      // No existing event in window — insert a fresh one.
      const row: InsertActivityEvent = {
        id: crypto.randomUUID(),
        projectId: data.projectId,
        userId: data.userId ?? null,
        actorLabel: data.actorLabel ?? null,
        eventType: 'document_edit',
        entityId: data.entityId,
        entityName: data.entityName ?? null,
        metadata: {
          wordsDelta: data.wordsDelta,
          endWordCount: data.endWordCount,
          durationMs: data.durationMs,
        },
        createdAt: now,
      };
      await db.insert(activityEvents).values(row);
    } catch (err) {
      log.error('Failed to record/coalesce document_edit event', err, {
        projectId: data.projectId,
        entityId: data.entityId,
      });
    }
  }

  /** Recent events for a single project, newest first. */
  async listForProject(
    db: DatabaseInstance,
    projectId: string,
    limit = 50,
    beforeTs?: number
  ): Promise<ActivityEvent[]> {
    const baseQuery = db
      .select()
      .from(activityEvents)
      .where(
        beforeTs === undefined
          ? eq(activityEvents.projectId, projectId)
          : sql`${activityEvents.projectId} = ${projectId} AND ${activityEvents.createdAt} < ${beforeTs}`
      );
    return baseQuery.orderBy(desc(activityEvents.createdAt)).limit(limit);
  }

  /** Recent events across an arbitrary set of project IDs (for the home dashboard). */
  async listForProjects(
    db: DatabaseInstance,
    projectIds: string[],
    limit = 50,
    beforeTs?: number
  ): Promise<ActivityEvent[]> {
    if (projectIds.length === 0) return [];
    const filter =
      beforeTs === undefined
        ? sql`${activityEvents.projectId} IN ${projectIds}`
        : sql`${activityEvents.projectId} IN ${projectIds} AND ${activityEvents.createdAt} < ${beforeTs}`;
    return db
      .select()
      .from(activityEvents)
      .where(filter)
      .orderBy(desc(activityEvents.createdAt))
      .limit(limit);
  }
}

export const activityService = new ActivityService();
