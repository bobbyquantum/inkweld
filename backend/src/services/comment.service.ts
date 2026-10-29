import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import type { D1DatabaseInstance } from '../db/d1';
import { commentThreads, type CommentThread } from '../db/schema/comment-threads';
import { commentMessages, type CommentMessage } from '../db/schema/comment-messages';
import { commentReadStatus } from '../db/schema/comment-read-status';
import { users } from '../db/schema/users';

/** Who wrote a thread or message, as shown next to it. */
export interface CommentAuthor {
  /** Display name, or the username when the author has not set one */
  authorName: string;
  /** For loading the author's avatar */
  authorUsername: string;
}

export type CommentMessageWithAuthor = CommentMessage & CommentAuthor;

export interface CommentThreadWithMessages extends CommentThread, CommentAuthor {
  messages: CommentMessageWithAuthor[];
}

/** Author columns joined onto every thread and message row. */
const authorColumns = { name: users.name, username: users.username };

function toAuthor(row: { name: string | null; username: string | null }): CommentAuthor {
  const username = row.username ?? '';
  return { authorName: row.name || username || 'Unknown', authorUsername: username };
}

export interface UnreadCount {
  documentId: string;
  count: number;
}

class CommentService {
  /**
   * Create a new comment thread with its initial message
   */
  async createThread(
    db: DatabaseInstance,
    data: {
      id: string;
      documentId: string;
      projectId: string;
      authorId: string;
      text: string;
    }
  ): Promise<CommentThreadWithMessages> {
    const now = Date.now();

    // Sequential inserts instead of transaction — D1 does not support interactive transactions
    await db.insert(commentThreads).values({
      id: data.id,
      documentId: data.documentId,
      projectId: data.projectId,
      authorId: data.authorId,
      resolved: false,
      createdAt: now,
      updatedAt: now,
    });

    const messageId = crypto.randomUUID();
    await db.insert(commentMessages).values({
      id: messageId,
      threadId: data.id,
      authorId: data.authorId,
      text: data.text,
      createdAt: now,
    });

    const thread = await this.getThread(db, data.id);
    if (!thread) {
      throw new Error('Failed to create comment thread');
    }
    return thread;
  }

  /**
   * Get a single thread with all its messages
   */
  async getThread(
    db: DatabaseInstance,
    threadId: string
  ): Promise<CommentThreadWithMessages | undefined> {
    const threadRows = await (db as D1DatabaseInstance)
      .select({
        thread: commentThreads,
        ...authorColumns,
      })
      .from(commentThreads)
      .innerJoin(users, eq(commentThreads.authorId, users.id))
      .where(eq(commentThreads.id, threadId))
      .limit(1);

    if (threadRows.length === 0) return undefined;

    const [threadRow] = threadRows;

    const msgs = await (db as D1DatabaseInstance)
      .select({
        message: commentMessages,
        ...authorColumns,
      })
      .from(commentMessages)
      .innerJoin(users, eq(commentMessages.authorId, users.id))
      .where(eq(commentMessages.threadId, threadId))
      .orderBy(commentMessages.createdAt);

    return {
      ...threadRow.thread,
      ...toAuthor(threadRow),
      messages: msgs.map((m) => ({ ...m.message, ...toAuthor(m) })),
    };
  }

  /**
   * List all threads for a document (with messages)
   */
  async listByDocumentId(
    db: DatabaseInstance,
    projectId: string,
    documentId: string
  ): Promise<CommentThreadWithMessages[]> {
    const threads = await (db as D1DatabaseInstance)
      .select({
        thread: commentThreads,
        ...authorColumns,
      })
      .from(commentThreads)
      .innerJoin(users, eq(commentThreads.authorId, users.id))
      .where(
        and(eq(commentThreads.projectId, projectId), eq(commentThreads.documentId, documentId))
      )
      .orderBy(desc(commentThreads.createdAt));

    if (threads.length === 0) return [];

    const threadIds = threads.map((t) => t.thread.id);
    const allMessages = await (db as D1DatabaseInstance)
      .select({
        message: commentMessages,
        ...authorColumns,
      })
      .from(commentMessages)
      .innerJoin(users, eq(commentMessages.authorId, users.id))
      .where(inArray(commentMessages.threadId, threadIds))
      .orderBy(commentMessages.createdAt);

    const messagesByThread = new Map<string, CommentMessageWithAuthor[]>();
    for (const m of allMessages) {
      const list = messagesByThread.get(m.message.threadId) ?? [];
      list.push({ ...m.message, ...toAuthor(m) });
      messagesByThread.set(m.message.threadId, list);
    }

    return threads.map((t) => ({
      ...t.thread,
      ...toAuthor(t),
      messages: messagesByThread.get(t.thread.id) ?? [],
    }));
  }

  /**
   * List all threads for a project (summary, no messages)
   */
  async listByProjectId(
    db: DatabaseInstance,
    projectId: string
  ): Promise<(CommentThread & CommentAuthor & { messageCount: number })[]> {
    const threads = await (db as D1DatabaseInstance)
      .select({
        thread: commentThreads,
        ...authorColumns,
        messageCount: sql<number>`(SELECT COUNT(*) FROM ${commentMessages} WHERE ${commentMessages.threadId} = ${commentThreads.id})`,
      })
      .from(commentThreads)
      .innerJoin(users, eq(commentThreads.authorId, users.id))
      .where(eq(commentThreads.projectId, projectId))
      .orderBy(desc(commentThreads.createdAt));

    return threads.map((t) => ({
      ...t.thread,
      ...toAuthor(t),
      messageCount: t.messageCount,
    }));
  }

  /**
   * Add a reply message to a thread
   */
  async addMessage(
    db: DatabaseInstance,
    data: {
      threadId: string;
      authorId: string;
      text: string;
    }
  ): Promise<CommentMessageWithAuthor> {
    const now = Date.now();
    const messageId = crypto.randomUUID();

    // Sequential operations — D1 does not support interactive transactions.
    // If the updatedAt bump fails after a successful insert, the only impact
    // is stale sort order for the thread which is cosmetic.
    await db.insert(commentMessages).values({
      id: messageId,
      threadId: data.threadId,
      authorId: data.authorId,
      text: data.text,
      createdAt: now,
    });

    await db
      .update(commentThreads)
      .set({ updatedAt: now })
      .where(eq(commentThreads.id, data.threadId));

    const result = await (db as D1DatabaseInstance)
      .select({
        message: commentMessages,
        ...authorColumns,
      })
      .from(commentMessages)
      .innerJoin(users, eq(commentMessages.authorId, users.id))
      .where(eq(commentMessages.id, messageId))
      .limit(1);

    if (result.length === 0) {
      throw new Error('Failed to create comment message');
    }

    return { ...result[0].message, ...toAuthor(result[0]) };
  }

  /**
   * Resolve a thread
   */
  async resolve(db: DatabaseInstance, threadId: string, userId: string): Promise<void> {
    const now = Date.now();
    await db
      .update(commentThreads)
      .set({
        resolved: true,
        resolvedBy: userId,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(commentThreads.id, threadId));
  }

  /**
   * Unresolve a thread
   */
  async unresolve(db: DatabaseInstance, threadId: string): Promise<void> {
    const now = Date.now();
    await db
      .update(commentThreads)
      .set({
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
        updatedAt: now,
      })
      .where(eq(commentThreads.id, threadId));
  }

  /**
   * Delete a thread and all its messages (cascades)
   */
  async deleteThread(db: DatabaseInstance, threadId: string): Promise<void> {
    await db.delete(commentThreads).where(eq(commentThreads.id, threadId));
  }

  /**
   * Delete a single message. If it's the only message, delete the thread.
   */
  async deleteMessage(
    db: DatabaseInstance,
    messageId: string
  ): Promise<{ threadDeleted: boolean }> {
    // Sequential operations instead of transaction — D1 does not support interactive transactions
    const message = await db
      .select()
      .from(commentMessages)
      .where(eq(commentMessages.id, messageId))
      .limit(1);

    if (message.length === 0) {
      return { threadDeleted: false };
    }

    const threadId = message[0].threadId;

    // Count messages in thread
    const countResult = await (db as D1DatabaseInstance)
      .select({ count: sql<number>`COUNT(*)` })
      .from(commentMessages)
      .where(eq(commentMessages.threadId, threadId));

    const count = countResult[0]?.count ?? 0;

    if (count <= 1) {
      // Last message — delete the whole thread (cascade removes messages)
      await db.delete(commentThreads).where(eq(commentThreads.id, threadId));
      return { threadDeleted: true };
    }

    await db.delete(commentMessages).where(eq(commentMessages.id, messageId));

    // Update thread's updatedAt
    await db
      .update(commentThreads)
      .set({ updatedAt: Date.now() })
      .where(eq(commentThreads.id, threadId));

    return { threadDeleted: false };
  }

  /**
   * Mark comments as seen for a user on a document
   */
  async markSeen(db: DatabaseInstance, userId: string, documentId: string): Promise<void> {
    const now = Date.now();
    await db
      .insert(commentReadStatus)
      .values({ userId, documentId, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [commentReadStatus.userId, commentReadStatus.documentId],
        set: { lastSeenAt: now },
      });
  }

  /**
   * Get unread comment counts per document for a project
   */
  async getUnreadCounts(
    db: DatabaseInstance,
    projectId: string,
    userId: string
  ): Promise<UnreadCount[]> {
    const results = await (db as D1DatabaseInstance)
      .select({
        documentId: commentThreads.documentId,
        count: sql<number>`COUNT(*)`,
      })
      .from(commentThreads)
      .leftJoin(
        commentReadStatus,
        and(
          eq(commentReadStatus.userId, sql`${userId}`),
          eq(commentReadStatus.documentId, commentThreads.documentId)
        )
      )
      .where(
        and(
          eq(commentThreads.projectId, projectId),
          eq(commentThreads.resolved, false),
          sql`${commentThreads.updatedAt} > COALESCE(${commentReadStatus.lastSeenAt}, 0)`
        )
      )
      .groupBy(commentThreads.documentId);

    return results.map((r) => ({
      documentId: r.documentId,
      count: r.count,
    }));
  }

  /**
   * Find thread by ID (without messages, for auth checks)
   */
  async findById(db: DatabaseInstance, threadId: string): Promise<CommentThread | undefined> {
    const result = await db
      .select()
      .from(commentThreads)
      .where(eq(commentThreads.id, threadId))
      .limit(1);
    return result[0];
  }

  /**
   * Find message by ID scoped to a thread (for auth checks)
   */
  async findMessageById(
    db: DatabaseInstance,
    threadId: string,
    messageId: string
  ): Promise<CommentMessage | undefined> {
    const result = await db
      .select()
      .from(commentMessages)
      .where(and(eq(commentMessages.id, messageId), eq(commentMessages.threadId, threadId)))
      .limit(1);
    return result[0];
  }
}

export const commentService = new CommentService();
