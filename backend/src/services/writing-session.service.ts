import { eq, and, isNull, desc, gte, sql } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import type { D1DatabaseInstance } from '../db/d1';
import {
  writingSessions,
  type WritingSession,
  type InsertWritingSession,
} from '../db/schema/writing-sessions';

/**
 * Tracks per-user, per-document writing sessions derived from the Yjs
 * WebSocket connection lifecycle.
 *
 * The session lifecycle is:
 *   1. `start()` is called when an authenticated WebSocket attaches to a
 *      document. The current word count of the document is captured and
 *      a row is inserted with `sessionEnd`/`endWordCount`/`wordsDelta = NULL`.
 *   2. `finalize()` is called on disconnect. The current word count is
 *      captured again, the difference is computed, and the row is updated.
 *
 * This service is intentionally agnostic about *how* the word count is
 * obtained — callers (the Yjs route) are responsible for sourcing it from
 * the live `Y.Doc`.
 */
class WritingSessionService {
  /**
   * Open a new writing session for a (user, element) pair.
   * Returns the inserted session id which the caller should retain so it
   * can later finalize the session.
   */
  async start(
    db: DatabaseInstance,
    data: {
      projectId: string;
      elementId: string;
      userId: string;
      startWordCount: number;
    }
  ): Promise<string> {
    const id = crypto.randomUUID();
    const row: InsertWritingSession = {
      id,
      projectId: data.projectId,
      elementId: data.elementId,
      userId: data.userId,
      sessionStart: Date.now(),
      sessionEnd: null,
      startWordCount: data.startWordCount,
      endWordCount: null,
      wordsDelta: null,
    };
    await db.insert(writingSessions).values(row);
    return id;
  }

  /**
   * Close an open session, recording the ending word count and the
   * computed delta. No-op if the session is already closed or not found.
   */
  async finalize(
    db: DatabaseInstance,
    sessionId: string,
    endWordCount: number
  ): Promise<{ wordsDelta: number; durationMs: number } | null> {
    const existing = await db
      .select()
      .from(writingSessions)
      .where(eq(writingSessions.id, sessionId))
      .limit(1);
    const session = existing[0];
    if (!session || session.sessionEnd !== null) return null;

    const delta = endWordCount - session.startWordCount;
    const sessionEnd = Date.now();
    await db
      .update(writingSessions)
      .set({
        sessionEnd,
        endWordCount,
        wordsDelta: delta,
      })
      .where(eq(writingSessions.id, sessionId));
    return { wordsDelta: delta, durationMs: sessionEnd - session.sessionStart };
  }

  /**
   * Forcibly close any sessions that were left open (e.g. due to a server
   * crash before the disconnect hook ran). Called on server start and may
   * be called periodically. Sessions that were left open have their
   * `endWordCount` set equal to `startWordCount` (zero delta) since we
   * cannot reliably reconstruct the state.
   */
  async closeStaleSessions(
    db: DatabaseInstance,
    olderThanMs = 24 * 60 * 60 * 1000
  ): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const stale = await db
      .select()
      .from(writingSessions)
      .where(
        and(isNull(writingSessions.sessionEnd), sql`${writingSessions.sessionStart} < ${cutoff}`)
      );

    for (const s of stale) {
      await db
        .update(writingSessions)
        .set({
          sessionEnd: s.sessionStart, // attribute to start time so it doesn't pollute future windows
          endWordCount: s.startWordCount,
          wordsDelta: 0,
        })
        .where(eq(writingSessions.id, s.id));
    }
    return stale.length;
  }

  /**
   * Aggregate per-day word totals (sum of positive `wordsDelta`) for a
   * project over a sliding window. Returns an array sorted by day ascending
   * with no gaps for missing days (caller can fill).
   */
  async dailyWordsForProject(
    db: DatabaseInstance,
    projectId: string,
    sinceMs: number
  ): Promise<Array<{ day: string; words: number }>> {
    const rows = await (db as D1DatabaseInstance)
      .select({
        sessionEnd: writingSessions.sessionEnd,
        wordsDelta: writingSessions.wordsDelta,
      })
      .from(writingSessions)
      .where(
        and(eq(writingSessions.projectId, projectId), gte(writingSessions.sessionStart, sinceMs))
      );

    return aggregateDaily(rows);
  }

  /**
   * Daily totals across an arbitrary set of project IDs (used for the
   * cross-project home dashboard).
   */
  async dailyWordsForProjects(
    db: DatabaseInstance,
    projectIds: string[],
    sinceMs: number
  ): Promise<Array<{ day: string; words: number }>> {
    if (projectIds.length === 0) return [];
    const rows = await (db as D1DatabaseInstance)
      .select({
        sessionEnd: writingSessions.sessionEnd,
        wordsDelta: writingSessions.wordsDelta,
      })
      .from(writingSessions)
      .where(
        and(
          sql`${writingSessions.projectId} IN ${projectIds}`,
          gte(writingSessions.sessionStart, sinceMs)
        )
      );

    return aggregateDaily(rows);
  }

  /**
   * Per-user totals (positive deltas only) for a project over a window.
   */
  async contributorTotalsForProject(
    db: DatabaseInstance,
    projectId: string,
    sinceMs: number
  ): Promise<Array<{ userId: string; words: number }>> {
    const rows = await (db as D1DatabaseInstance)
      .select({
        userId: writingSessions.userId,
        wordsDelta: writingSessions.wordsDelta,
      })
      .from(writingSessions)
      .where(
        and(eq(writingSessions.projectId, projectId), gte(writingSessions.sessionStart, sinceMs))
      );

    const totals = new Map<string, number>();
    for (const r of rows) {
      const d = r.wordsDelta ?? 0;
      if (d <= 0) continue;
      totals.set(r.userId, (totals.get(r.userId) ?? 0) + d);
    }
    return Array.from(totals.entries()).map(([userId, words]) => ({ userId, words }));
  }

  /**
   * Total positive words written for a project since `sinceMs`.
   */
  async totalWordsForProject(
    db: DatabaseInstance,
    projectId: string,
    sinceMs: number
  ): Promise<number> {
    const days = await this.dailyWordsForProject(db, projectId, sinceMs);
    return days.reduce((acc, d) => acc + d.words, 0);
  }

  /**
   * Find the most recent session-end timestamp for each project in the set,
   * useful for ranking "most recently active" projects.
   */
  async lastActivityByProject(
    db: DatabaseInstance,
    projectIds: string[]
  ): Promise<Map<string, number>> {
    if (projectIds.length === 0) return new Map();
    const rows = await (db as D1DatabaseInstance)
      .select({
        projectId: writingSessions.projectId,
        ts: sql<number>`MAX(COALESCE(${writingSessions.sessionEnd}, ${writingSessions.sessionStart}))`,
      })
      .from(writingSessions)
      .where(sql`${writingSessions.projectId} IN ${projectIds}`)
      .groupBy(writingSessions.projectId);

    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.ts) map.set(r.projectId, Number(r.ts));
    }
    return map;
  }

  /** Most recent N sessions for a project (for an "active editors" indicator). */
  async recentSessionsForProject(
    db: DatabaseInstance,
    projectId: string,
    limit = 20
  ): Promise<WritingSession[]> {
    return db
      .select()
      .from(writingSessions)
      .where(eq(writingSessions.projectId, projectId))
      .orderBy(desc(writingSessions.sessionStart))
      .limit(limit);
  }
}

/**
 * Bucket session rows into UTC day strings (YYYY-MM-DD), summing only
 * positive deltas. Sessions still open (sessionEnd null) are skipped.
 */
function aggregateDaily(
  rows: Array<{ sessionEnd: number | null; wordsDelta: number | null }>
): Array<{ day: string; words: number }> {
  const buckets = new Map<string, number>();
  for (const r of rows) {
    if (r.sessionEnd === null) continue;
    const delta = r.wordsDelta ?? 0;
    if (delta <= 0) continue;
    const day = new Date(r.sessionEnd).toISOString().slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + delta);
  }
  return Array.from(buckets.entries())
    .map(([day, words]) => ({ day, words }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export const writingSessionService = new WritingSessionService();
