/**
 * Comment Service
 *
 * Manages comment threads and messages via REST API (server-authoritative)
 * and via ProseMirror marks (for positioning in the document).
 *
 * In server mode: thread data lives in SQLite, fetched on demand.
 * In local-only mode: thread data lives in the ProseMirror mark attributes.
 */

import { HttpClient, type HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal, type WritableSignal } from '@angular/core';
import { type Mark } from 'prosemirror-model';
import { type EditorView } from 'prosemirror-view';
import { catchError, firstValueFrom, throwError } from 'rxjs';

import { type CommentMarkAttrs } from '../../components/comment-mark/comment-mark-schema';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { UnifiedUserService } from '../user/unified-user.service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CommentMessageResponse {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  editedAt: string | null;
}

export interface CommentThreadResponse {
  id: string;
  documentId: string;
  projectId: string;
  authorId: string;
  authorName: string;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: CommentMessageResponse[];
}

export interface CommentThreadSummary {
  id: string;
  documentId: string;
  projectId: string;
  authorId: string;
  authorName: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface UnreadCount {
  documentId: string;
  count: number;
}

/** Local-only message stored in the mark's messages attribute */
export interface LocalCommentMessage {
  id: string;
  authorName: string;
  text: string;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CommentService {
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);
  private readonly userService = inject(UnifiedUserService);
  private readonly logger = inject(LoggerService);

  /** Currently active (clicked) comment thread ID */
  readonly activeCommentId: WritableSignal<string | null> = signal(null);

  /** Comment click event data (set by plugin, consumed by editor component to show popover) */
  readonly commentClickEvent: WritableSignal<{
    attrs: CommentMarkAttrs;
    coords: { x: number; y: number };
  } | null> = signal(null);

  /** Trigger signal for add-comment shortcut (incremented by keyboard shortcut) */
  readonly addCommentTrigger: WritableSignal<number> = signal(0);

  /** Unread counts per document, keyed by documentId */
  readonly unreadCounts: WritableSignal<Map<string, number>> = signal(
    new Map<string, number>()
  );

  private get basePath(): string {
    return this.setupService.getServerUrl() ?? '';
  }

  get isServerMode(): boolean {
    return !!this.basePath;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mark Operations (ProseMirror)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Apply a comment mark to the current selection.
   * In server mode, also creates the thread on the server.
   * In local-only mode, stores the comment text in the mark.
   */
  async addComment(
    view: EditorView,
    text: string,
    username: string,
    slug: string,
    fromPos?: number,
    toPos?: number
  ): Promise<string | null> {
    const { state } = view;
    const from = fromPos ?? state.selection.from;
    const to = toPos ?? state.selection.to;

    if (from === to) {
      this.logger.warn(
        'CommentService',
        'Cannot add comment to empty selection'
      );
      return null;
    }

    const commentId = crypto.randomUUID();
    const commentType = state.schema.marks['comment'];
    if (!commentType) {
      this.logger.error('CommentService', 'Comment mark type not in schema');
      return null;
    }

    const user = this.userService.currentUser();
    const authorName = user?.name || user?.username || 'Unknown';

    if (this.isServerMode) {
      // Create server-side thread first
      try {
        const documentId = this.getActiveDocumentId(username, slug);
        if (!documentId) return null;

        const thread = await this.createThread(username, slug, {
          id: commentId,
          documentId,
          text,
        });

        // Apply mark with cached server data
        const mark = commentType.create({
          commentId,
          authorName: thread.authorName,
          preview: text.length > 100 ? text.substring(0, 100) + '…' : text,
          messageCount: 1,
          resolved: false,
          createdAt: new Date(thread.createdAt).getTime(),
          localOnly: false,
          messages: null,
        });

        const tr = view.state.tr.addMark(from, to, mark);
        view.dispatch(tr);
        return commentId;
      } catch (error) {
        this.logger.error(
          'CommentService',
          'Failed to create comment thread',
          error
        );
        return null;
      }
    } else {
      // Local-only mode: store everything in the mark
      const localMessage: LocalCommentMessage = {
        id: crypto.randomUUID(),
        authorName,
        text,
        createdAt: Date.now(),
      };

      const mark = commentType.create({
        commentId,
        authorName,
        preview: text.length > 100 ? text.substring(0, 100) + '…' : text,
        messageCount: 1,
        resolved: false,
        createdAt: Date.now(),
        localOnly: true,
        messages: JSON.stringify([localMessage]),
      });

      const tr = state.tr.addMark(from, to, mark);
      view.dispatch(tr);
      return commentId;
    }
  }

  /**
   * Remove the comment mark from the document (used when resolving/deleting).
   */
  removeCommentMark(view: EditorView, commentId: string): void {
    const { state } = view;
    const commentType = state.schema.marks['comment'];
    if (!commentType) return;

    let tr = state.tr;
    state.doc.descendants((node, pos) => {
      const mark = node.marks.find(
        m => m.type === commentType && m.attrs['commentId'] === commentId
      );
      if (mark) {
        tr = tr.removeMark(pos, pos + node.nodeSize, mark);
      }
    });

    if (tr.docChanged) {
      view.dispatch(tr);
    }
  }

  /**
   * Update cached attributes on a comment mark (after fetching fresh data).
   */
  updateCommentMarkCache(
    view: EditorView,
    commentId: string,
    updates: Partial<CommentMarkAttrs>
  ): void {
    const { state } = view;
    const commentType = state.schema.marks['comment'];
    if (!commentType) return;

    let tr = state.tr;
    state.doc.descendants((node, pos) => {
      const oldMark = node.marks.find(
        (m: Mark) =>
          m.type === commentType && m.attrs['commentId'] === commentId
      );
      if (oldMark) {
        const newMark = commentType.create({ ...oldMark.attrs, ...updates });
        tr = tr.removeMark(pos, pos + node.nodeSize, oldMark);
        tr = tr.addMark(pos, pos + node.nodeSize, newMark);
      }
    });

    if (tr.docChanged) {
      view.dispatch(tr);
    }
  }

  /**
   * Find all comment marks in the current document.
   */
  getCommentMarks(view: EditorView): CommentMarkAttrs[] {
    const { state } = view;
    const commentType = state.schema.marks['comment'];
    if (!commentType) return [];

    const seen = new Set<string>();
    const result: CommentMarkAttrs[] = [];

    state.doc.descendants(node => {
      for (const mark of node.marks) {
        if (mark.type === commentType) {
          const id = mark.attrs['commentId'] as string;
          if (id && !seen.has(id)) {
            seen.add(id);
            result.push(mark.attrs as CommentMarkAttrs);
          }
        }
      }
    });

    return result;
  }

  /**
   * Find all comment marks with their document positions (for gutter positioning).
   * Returns the first occurrence position for each unique commentId.
   */
  getCommentMarksWithPositions(
    view: EditorView
  ): Array<{ attrs: CommentMarkAttrs; from: number }> {
    const { state } = view;
    const commentType = state.schema.marks['comment'];
    if (!commentType) return [];

    const seen = new Set<string>();
    const result: Array<{ attrs: CommentMarkAttrs; from: number }> = [];

    state.doc.descendants((node, pos) => {
      for (const mark of node.marks) {
        if (mark.type === commentType) {
          const id = mark.attrs['commentId'] as string;
          if (id && !seen.has(id)) {
            seen.add(id);
            result.push({ attrs: mark.attrs as CommentMarkAttrs, from: pos });
          }
        }
      }
    });

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REST API Operations (Server Mode)
  // ─────────────────────────────────────────────────────────────────────────

  async createThread(
    username: string,
    slug: string,
    data: { id: string; documentId: string; text: string }
  ): Promise<CommentThreadResponse> {
    const url = `${this.basePath}/api/v1/comments/${username}/${slug}`;
    return firstValueFrom(
      this.http
        .post<CommentThreadResponse>(url, data, { withCredentials: true })
        .pipe(catchError(this.handleError.bind(this)))
    );
  }

  async getThread(
    username: string,
    slug: string,
    threadId: string
  ): Promise<CommentThreadResponse> {
    const url = `${this.basePath}/api/v1/comments/${username}/${slug}/threads/${threadId}`;
    return firstValueFrom(
      this.http
        .get<CommentThreadResponse>(url, { withCredentials: true })
        .pipe(catchError(this.handleError.bind(this)))
    );
  }

  async listDocumentComments(
    username: string,
    slug: string,
    documentName: string
  ): Promise<CommentThreadResponse[]> {
    const url = `${this.basePath}/api/v1/comments/${username}/${slug}/doc/${documentName}`;
    return firstValueFrom(
      this.http
        .get<CommentThreadResponse[]>(url, { withCredentials: true })
        .pipe(catchError(this.handleError.bind(this)))
    );
  }

  async listProjectComments(
    username: string,
    slug: string
  ): Promise<CommentThreadSummary[]> {
    const url = `${this.basePath}/api/v1/comments/${username}/${slug}`;
    return firstValueFrom(
      this.http
        .get<CommentThreadSummary[]>(url, { withCredentials: true })
        .pipe(catchError(this.handleError.bind(this)))
    );
  }

  async addMessage(
    username: string,
    slug: string,
    threadId: string,
    text: string
  ): Promise<CommentMessageResponse> {
    const url = `${this.basePath}/api/v1/comments/${username}/${slug}/threads/${threadId}/messages`;
    return firstValueFrom(
      this.http
        .post<CommentMessageResponse>(url, { text }, { withCredentials: true })
        .pipe(catchError(this.handleError.bind(this)))
    );
  }

  async resolveThread(
    username: string,
    slug: string,
    threadId: string
  ): Promise<void> {
    const url = `${this.basePath}/api/v1/comments/${username}/${slug}/threads/${threadId}/resolve`;
    await firstValueFrom(
      this.http
        .patch(url, {}, { withCredentials: true })
        .pipe(catchError(this.handleError.bind(this)))
    );
  }

  async unresolveThread(
    username: string,
    slug: string,
    threadId: string
  ): Promise<void> {
    const url = `${this.basePath}/api/v1/comments/${username}/${slug}/threads/${threadId}/unresolve`;
    await firstValueFrom(
      this.http
        .patch(url, {}, { withCredentials: true })
        .pipe(catchError(this.handleError.bind(this)))
    );
  }

  async deleteThread(
    username: string,
    slug: string,
    threadId: string
  ): Promise<void> {
    const url = `${this.basePath}/api/v1/comments/${username}/${slug}/threads/${threadId}`;
    await firstValueFrom(
      this.http
        .delete(url, { withCredentials: true })
        .pipe(catchError(this.handleError.bind(this)))
    );
  }

  async deleteMessage(
    username: string,
    slug: string,
    threadId: string,
    messageId: string
  ): Promise<{ threadDeleted: boolean }> {
    const url = `${this.basePath}/api/v1/comments/${username}/${slug}/threads/${threadId}/messages/${messageId}`;
    return firstValueFrom(
      this.http
        .delete<{
          message: string;
          threadDeleted: boolean;
        }>(url, { withCredentials: true })
        .pipe(catchError(this.handleError.bind(this)))
    );
  }

  async fetchUnreadCounts(username: string, slug: string): Promise<void> {
    if (!this.isServerMode) return;
    try {
      const url = `${this.basePath}/api/v1/comments/${username}/${slug}/unread`;
      const counts = await firstValueFrom(
        this.http
          .get<UnreadCount[]>(url, { withCredentials: true })
          .pipe(catchError(this.handleError.bind(this)))
      );
      const map = new Map<string, number>();
      for (const c of counts) {
        map.set(c.documentId, c.count);
      }
      this.unreadCounts.set(map);
    } catch {
      // Silently fail — unread counts are non-critical
    }
  }

  async markSeen(
    username: string,
    slug: string,
    documentId: string
  ): Promise<void> {
    if (!this.isServerMode) return;
    try {
      const url = `${this.basePath}/api/v1/comments/${username}/${slug}/seen`;
      await firstValueFrom(
        this.http
          .post(url, { documentId }, { withCredentials: true })
          .pipe(catchError(this.handleError.bind(this)))
      );
      // Clear unread count for this document locally
      const counts = new Map(this.unreadCounts());
      counts.delete(documentId);
      this.unreadCounts.set(counts);
    } catch {
      // Silently fail
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Local-Only Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add a reply in local-only mode by updating the mark's messages attribute.
   */
  addLocalReply(view: EditorView, commentId: string, text: string): void {
    const user = this.userService.currentUser();
    const authorName = user?.name || user?.username || 'You';

    const attrs = this.getCommentMarks(view).find(
      a => a.commentId === commentId
    );
    if (!attrs?.localOnly) return;

    let messages: LocalCommentMessage[];
    try {
      messages = attrs.messages
        ? (JSON.parse(attrs.messages) as LocalCommentMessage[])
        : [];
    } catch {
      messages = [];
    }

    messages.push({
      id: crypto.randomUUID(),
      authorName,
      text,
      createdAt: Date.now(),
    });

    this.updateCommentMarkCache(view, commentId, {
      messages: JSON.stringify(messages),
      messageCount: messages.length,
      preview: text.length > 100 ? text.substring(0, 100) + '…' : text,
    });
  }

  /**
   * Resolve a local-only comment (removes the mark).
   */
  resolveLocalComment(view: EditorView, commentId: string): void {
    this.removeCommentMark(view, commentId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the active document ID from the current project context.
   * This must be set by the document editor component.
   */
  private activeDocumentId: string | null = null;

  setActiveDocumentId(documentId: string | null): void {
    this.activeDocumentId = documentId;
  }

  private getActiveDocumentId(_username: string, _slug: string): string | null {
    return this.activeDocumentId;
  }

  private handleError(error: HttpErrorResponse) {
    this.logger.error('CommentService', 'HTTP error', error);
    return throwError(() => error);
  }
}
