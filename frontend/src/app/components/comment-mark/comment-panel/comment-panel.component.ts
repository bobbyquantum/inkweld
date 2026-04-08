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
  template: `
    <div class="comment-panel" data-testid="comment-panel">
      <div class="comment-panel__header">
        <mat-icon class="comment-panel__icon">comment</mat-icon>
        <span class="comment-panel__title">
          Comments
          @if (threads().length > 0) {
            <span class="comment-panel__count">({{ threads().length }})</span>
          }
        </span>
        <span class="comment-panel__spacer"></span>
        <button
          mat-icon-button
          matTooltip="Close panel"
          (click)="closed.emit()"
          data-testid="comment-panel-close">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      @if (loading()) {
        <div class="comment-panel__loading">
          <mat-spinner diameter="24"></mat-spinner>
        </div>
      } @else if (threads().length === 0) {
        <div class="comment-panel__empty" data-testid="comment-panel-empty">
          <mat-icon>chat_bubble_outline</mat-icon>
          <p>No comments yet</p>
          <p class="comment-panel__hint">
            Select text and press Ctrl+Alt+M to add a comment
          </p>
        </div>
      } @else {
        <div class="comment-panel__gutter">
          <div
            class="comment-panel__gutter-inner"
            [style.transform]="'translateY(-' + editorScrollTop() + 'px)'"
            [style.height.px]="editorContentHeight()">
            @for (thread of positionedThreads(); track thread.id) {
              <div
                class="comment-panel__thread"
                [class.comment-panel__thread--resolved]="thread.resolved"
                [class.comment-panel__thread--expanded]="
                  expandedThreadId() === thread.id
                "
                [style.top.px]="thread.displayTop"
                (click)="onThreadClick(thread)"
                (keydown.enter)="onThreadClick(thread)"
                (mouseenter)="threadHovered.emit(thread.id)"
                (mouseleave)="threadHovered.emit(null)"
                tabindex="0"
                role="button"
                data-testid="comment-panel-thread">
                <div class="comment-panel__thread-header">
                  <app-user-avatar
                    [username]="thread.authorName"
                    size="small"
                    class="comment-panel__thread-avatar"></app-user-avatar>
                  <span class="comment-panel__thread-author">{{
                    thread.authorName
                  }}</span>
                  <span class="comment-panel__thread-date">{{
                    formatDate(thread.createdAt)
                  }}</span>
                  @if (thread.resolved) {
                    <mat-icon
                      class="comment-panel__resolved-icon"
                      matTooltip="Resolved"
                      >check_circle</mat-icon
                    >
                  }
                </div>

                @if (expandedThreadId() === thread.id) {
                  <div class="comment-panel__thread-actions">
                    @if (!thread.resolved) {
                      <button
                        mat-icon-button
                        matTooltip="Resolve"
                        (click)="onResolve(thread, $event)"
                        data-testid="panel-resolve-btn">
                        <mat-icon>check_circle_outline</mat-icon>
                      </button>
                    } @else {
                      <button
                        mat-icon-button
                        matTooltip="Unresolve"
                        (click)="onUnresolve(thread, $event)"
                        data-testid="panel-unresolve-btn">
                        <mat-icon>undo</mat-icon>
                      </button>
                    }
                    <button
                      mat-icon-button
                      matTooltip="Delete thread"
                      (click)="onDelete(thread, $event)"
                      data-testid="panel-delete-btn">
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>

                  <div class="comment-panel__messages">
                    @for (msg of thread.messages; track msg.id) {
                      <div class="comment-panel__message">
                        <div class="comment-panel__msg-header">
                          <app-user-avatar
                            [username]="msg.authorName"
                            size="small"
                            class="comment-panel__msg-avatar"></app-user-avatar>
                          <span class="comment-panel__msg-author">{{
                            msg.authorName
                          }}</span>
                          <span class="comment-panel__msg-date">{{
                            formatDate(msg.createdAt)
                          }}</span>
                        </div>
                        <div class="comment-panel__msg-text">
                          {{ msg.text }}
                        </div>
                      </div>
                    }
                  </div>

                  @if (canWrite() && !isLocalMode()) {
                    <div class="comment-panel__reply-row">
                      <input
                        #replyInput
                        class="comment-panel__reply-input"
                        type="text"
                        placeholder="Reply..."
                        (keydown.enter)="onReply(thread, replyInput)"
                        (click)="$event.stopPropagation()"
                        data-testid="panel-reply-input" />
                      <button
                        mat-icon-button
                        [disabled]="!replyInput.value.trim()"
                        (click)="
                          onReply(thread, replyInput); $event.stopPropagation()
                        "
                        matTooltip="Send reply"
                        data-testid="panel-reply-btn">
                        <mat-icon>send</mat-icon>
                      </button>
                    </div>
                  }
                } @else {
                  <div class="comment-panel__thread-preview">
                    {{ getPreview(thread) }}
                  </div>
                  @if (thread.messages.length > 1) {
                    <span class="comment-panel__reply-count">
                      {{ thread.messages.length - 1 }}
                      {{
                        thread.messages.length === 2 ? 'reply' : 'replies'
                      }}</span
                    >
                  }
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .comment-panel {
        width: 300px;
        min-width: 300px;
        background: var(--sys-surface-container-lowest);
        border-left: 1px solid var(--sys-outline-variant);
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .comment-panel__header {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid var(--sys-outline-variant);
        gap: 8px;
        flex-shrink: 0;
      }

      .comment-panel__icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: var(--sys-on-surface-variant);
      }

      .comment-panel__title {
        font-weight: 500;
        font-size: 14px;
        color: var(--sys-on-surface);
      }

      .comment-panel__count {
        color: var(--sys-on-surface-variant);
        font-weight: 400;
      }

      .comment-panel__spacer {
        flex: 1;
      }

      .comment-panel__loading {
        display: flex;
        justify-content: center;
        padding: 32px;
      }

      .comment-panel__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 32px 16px;
        color: var(--sys-on-surface-variant);
        text-align: center;
        gap: 4px;

        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
          margin-bottom: 8px;
        }

        p {
          margin: 0;
          font-size: 13px;
        }
      }

      .comment-panel__hint {
        font-size: 11px !important;
        margin-top: 4px !important;
      }

      /* Gutter layout - scroll-synced with editor */
      .comment-panel__gutter {
        flex: 1;
        overflow: hidden;
        position: relative;
      }

      .comment-panel__gutter-inner {
        position: relative;
        min-height: 100%;
      }

      .comment-panel__thread {
        position: absolute;
        left: 4px;
        right: 4px;
        padding: 8px 10px;
        cursor: pointer;
        border: 1px solid var(--sys-outline-variant);
        border-radius: 8px;
        background: var(--sys-surface-container);
        transition:
          background 0.15s,
          box-shadow 0.15s;
        font-size: 13px;

        &:hover {
          background: var(--sys-surface-container-high);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
        }
      }

      .comment-panel__thread--resolved {
        opacity: 0.6;
      }

      .comment-panel__thread--expanded {
        background: var(--sys-surface-container-high);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        z-index: 1;
      }

      .comment-panel__thread-header {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .comment-panel__thread-avatar {
        width: 20px;
        height: 20px;
        flex-shrink: 0;

        ::ng-deep .avatar {
          width: 20px;
          height: 20px;

          img,
          svg {
            width: 20px;
            height: 20px;
          }
        }
      }

      .comment-panel__thread-author {
        font-weight: 500;
        font-size: 12px;
        color: var(--sys-on-surface);
      }

      .comment-panel__thread-date {
        font-size: 11px;
        color: var(--sys-on-surface-variant);
      }

      .comment-panel__resolved-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: var(--sys-primary);
        margin-left: auto;
      }

      .comment-panel__thread-preview {
        font-size: 12px;
        color: var(--sys-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-top: 4px;
      }

      .comment-panel__reply-count {
        font-size: 11px;
        color: var(--sys-on-surface-variant);
        margin-top: 2px;
        display: block;
      }

      /* Expanded thread */
      .comment-panel__thread-actions {
        display: flex;
        gap: 2px;
        margin-top: 4px;

        button {
          width: 28px;
          height: 28px;

          mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
          }
        }
      }

      .comment-panel__messages {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 6px;
        max-height: 200px;
        overflow-y: auto;
      }

      .comment-panel__message {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .comment-panel__msg-header {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .comment-panel__msg-avatar {
        width: 16px;
        height: 16px;
        flex-shrink: 0;

        ::ng-deep .avatar {
          width: 16px;
          height: 16px;

          img,
          svg {
            width: 16px;
            height: 16px;
          }
        }
      }

      .comment-panel__msg-author {
        font-weight: 500;
        font-size: 11px;
        color: var(--sys-on-surface);
      }

      .comment-panel__msg-date {
        font-size: 10px;
        color: var(--sys-on-surface-variant);
      }

      .comment-panel__msg-text {
        font-size: 12px;
        color: var(--sys-on-surface);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .comment-panel__reply-row {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid var(--sys-outline-variant);
      }

      .comment-panel__reply-input {
        flex: 1;
        border: 1px solid var(--sys-outline-variant);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        background: var(--sys-surface);
        color: var(--sys-on-surface);
        outline: none;

        &:focus {
          border-color: var(--sys-primary);
        }
      }
    `,
  ],
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
