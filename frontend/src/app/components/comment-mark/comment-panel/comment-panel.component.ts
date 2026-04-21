import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { CommentThreadResponse } from '../../../services/project/comment.service';
import { CommentService } from '../../../services/project/comment.service';
import { formatRelativeDate } from '../../../utils/date-format';
import { UserAvatarComponent } from '../../user-avatar/user-avatar.component';
import type { CommentMarkAttrs } from '../comment-mark-schema';

interface PositionedThread extends CommentThreadResponse {
  displayTop: number;
}

@Component({
  selector: 'app-comment-panel',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    UserAvatarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comment-panel.component.html',
  styleUrls: ['./comment-panel.component.scss'],
})
export class CommentPanelComponent {
  private readonly commentService = inject(CommentService);

  /** Project coordinates */
  username = input.required<string>();
  slug = input.required<string>();

  /** Document ID for filtering */
  documentId = input<string | null>(null);

  /** Whether the panel is open */
  isOpen = input(false);

  /** Currently active comment marks in the editor (for local-only fallback) */
  commentMarks = input<CommentMarkAttrs[]>([]);

  /** Map of commentId → Y offset (px) relative to editor content top */
  threadPositions = input<Record<string, number>>({});

  /** Editor scroll container's scrollTop */
  editorScrollTop = input(0);

  /** Editor scroll container's scrollHeight */
  editorContentHeight = input(0);

  /** Whether the user has write access */
  canWrite = input(false);

  /** Emitted when the panel is closed */
  closed = output<void>();

  /** Emitted when a thread is clicked (to scroll/highlight in editor) */
  threadSelected = output<string>();

  /** Emitted when a thread is resolved */
  commentResolved = output<string>();

  /** Emitted when a thread is deleted */
  commentDeleted = output<string>();

  /** Emitted when a thread is updated (reply, unresolve) */
  commentUpdated = output<{
    commentId: string;
    updates: Partial<CommentMarkAttrs>;
  }>();

  /** Emitted on thread hover (commentId or null for leave) */
  threadHovered = output<string | null>();

  loading = signal(false);
  threads = signal<CommentThreadResponse[]>([]);
  expandedThreadId = signal<string | null>(null);

  /** Whether running without a server (local-only mode) */
  isLocalMode = computed(() => !this.commentService.isServerMode);

  /** Threads sorted and positioned for gutter display */
  positionedThreads = computed<PositionedThread[]>(() => {
    const threads = this.threads();
    const positions = this.threadPositions();
    const expandedId = this.expandedThreadId();

    // Sort by document position
    const sorted = [...threads].sort((a, b) => {
      const posA = positions[a.id] ?? Infinity;
      const posB = positions[b.id] ?? Infinity;
      return posA - posB;
    });

    // Collision resolution: ensure threads don't overlap
    const minGap = 4;
    const collapsedHeight = 52;
    const expandedHeight = 220;
    let lastBottom = 0;

    return sorted.map(thread => {
      const naturalTop = positions[thread.id] ?? lastBottom;
      const displayTop = Math.max(naturalTop, lastBottom);
      const height =
        expandedId === thread.id ? expandedHeight : collapsedHeight;
      lastBottom = displayTop + height + minGap;
      return { ...thread, displayTop };
    });
  });

  constructor() {
    // Refresh when panel opens, documentId changes, or commentMarks change
    effect(() => {
      const open = this.isOpen();
      const _docId = this.documentId();
      const _marks = this.commentMarks();
      if (open) {
        void this.fetchThreads();
      }
    });
  }

  private async fetchThreads(): Promise<void> {
    if (!this.commentService['isServerMode']) {
      this.buildLocalThreads();
      return;
    }

    this.loading.set(true);
    try {
      const docId = this.documentId();
      let result: CommentThreadResponse[];
      if (docId) {
        const documentName = docId.includes(':')
          ? docId.split(':').pop()!
          : docId;
        result = await this.commentService.listDocumentComments(
          this.username(),
          this.slug(),
          documentName
        );
      } else {
        const summaries = await this.commentService.listProjectComments(
          this.username(),
          this.slug()
        );
        result = summaries.map(s => ({
          ...s,
          resolvedBy: null,
          resolvedAt: null,
          messages: [],
        }));
      }
      this.threads.set(result);
    } catch {
      this.threads.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private buildLocalThreads(): void {
    const marks = this.commentMarks();
    const threads: CommentThreadResponse[] = marks.map(m => {
      let messages: Array<{
        id: string;
        threadId: string;
        authorId: string;
        authorName: string;
        text: string;
        createdAt: string;
        editedAt: null;
      }> = [];
      if (m.messages) {
        try {
          const local = JSON.parse(m.messages) as Array<{
            id: string;
            authorName: string;
            text: string;
            createdAt: number;
          }>;
          messages = local.map(lm => ({
            id: lm.id,
            threadId: m.commentId,
            authorId: '',
            authorName: lm.authorName,
            text: lm.text,
            createdAt: new Date(lm.createdAt).toISOString(),
            editedAt: null,
          }));
        } catch {
          // Invalid JSON
        }
      }
      return {
        id: m.commentId,
        documentId: '',
        projectId: '',
        authorId: '',
        authorName: m.authorName,
        resolved: m.resolved,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: m.createdAt
          ? new Date(m.createdAt).toISOString()
          : new Date().toISOString(),
        updatedAt: m.createdAt
          ? new Date(m.createdAt).toISOString()
          : new Date().toISOString(),
        messages,
      };
    });
    this.threads.set(threads);
    this.loading.set(false);
  }

  onThreadClick(thread: CommentThreadResponse): void {
    if (this.expandedThreadId() === thread.id) {
      // Collapse
      this.expandedThreadId.set(null);
      this.commentService.activeCommentId.set(null);
    } else {
      // Expand & select
      this.expandedThreadId.set(thread.id);
      this.commentService.activeCommentId.set(thread.id);
      this.threadSelected.emit(thread.id);
    }
  }

  async onResolve(thread: CommentThreadResponse, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.isLocalMode()) {
      this.commentResolved.emit(thread.id);
      this.expandedThreadId.set(null);
      return;
    }
    try {
      await this.commentService.resolveThread(
        this.username(),
        this.slug(),
        thread.id
      );
      this.commentResolved.emit(thread.id);
      await this.fetchThreads();
    } catch {
      // Error logged by service
    }
  }

  async onUnresolve(
    thread: CommentThreadResponse,
    event: Event
  ): Promise<void> {
    event.stopPropagation();
    if (this.isLocalMode()) {
      this.commentUpdated.emit({
        commentId: thread.id,
        updates: { resolved: false },
      });
      return;
    }
    try {
      await this.commentService.unresolveThread(
        this.username(),
        this.slug(),
        thread.id
      );
      this.commentUpdated.emit({
        commentId: thread.id,
        updates: { resolved: false },
      });
      await this.fetchThreads();
    } catch {
      // Error logged by service
    }
  }

  async onDelete(thread: CommentThreadResponse, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.isLocalMode()) {
      this.commentDeleted.emit(thread.id);
      this.expandedThreadId.set(null);
      return;
    }
    try {
      await this.commentService.deleteThread(
        this.username(),
        this.slug(),
        thread.id
      );
      this.commentDeleted.emit(thread.id);
      this.expandedThreadId.set(null);
      await this.fetchThreads();
    } catch {
      // Error logged by service
    }
  }

  async onReply(
    thread: CommentThreadResponse,
    inputEl: HTMLInputElement
  ): Promise<void> {
    const text = inputEl.value.trim();
    if (!text) return;

    try {
      await this.commentService.addMessage(
        this.username(),
        this.slug(),
        thread.id,
        text
      );
      inputEl.value = '';
      this.commentUpdated.emit({
        commentId: thread.id,
        updates: { messageCount: thread.messages.length + 1 },
      });
      await this.fetchThreads();
    } catch {
      // Error logged by service
    }
  }

  getPreview(thread: CommentThreadResponse): string {
    if (thread.messages.length > 0) {
      const text = thread.messages[0].text;
      return text.length > 80 ? text.substring(0, 80) + '…' : text;
    }
    return '';
  }

  formatDate(date: string): string {
    return formatRelativeDate(date);
  }
}
