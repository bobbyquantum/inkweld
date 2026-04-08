import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import type {
  CommentThreadResponse,
  LocalCommentMessage,
} from '../../../services/project/comment.service';
import { CommentService } from '../../../services/project/comment.service';
import { formatRelativeDate } from '../../../utils/date-format';
import { UserAvatarComponent } from '../../user-avatar/user-avatar.component';
import type { CommentMarkAttrs } from '../comment-mark-schema';

@Component({
  selector: 'app-comment-popover',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    UserAvatarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="comment-popover"
      [style.position]="'fixed'"
      [style.z-index]="'1100'"
      [style.top.px]="adjustedPosition().top"
      [style.left.px]="adjustedPosition().left"
      data-testid="comment-popover">
      @if (loading()) {
        <div class="comment-popover__loading">
          <mat-spinner diameter="24"></mat-spinner>
        </div>
      } @else {
        <div class="comment-popover__header">
          <app-user-avatar
            [username]="threadAuthor()"
            size="small"
            class="comment-popover__avatar"></app-user-avatar>
          <span class="comment-popover__author">{{ threadAuthor() }}</span>
          <span class="comment-popover__date">{{ threadDate() }}</span>
          <span class="comment-popover__spacer"></span>
          @if (!attrs().resolved) {
            <button
              mat-icon-button
              class="comment-popover__action"
              matTooltip="Resolve"
              (click)="onResolve()"
              data-testid="comment-resolve-btn">
              <mat-icon>check_circle_outline</mat-icon>
            </button>
          } @else {
            <button
              mat-icon-button
              class="comment-popover__action"
              matTooltip="Unresolve"
              (click)="onUnresolve()"
              data-testid="comment-unresolve-btn">
              <mat-icon>undo</mat-icon>
            </button>
          }
          <button
            mat-icon-button
            class="comment-popover__action"
            matTooltip="Delete thread"
            (click)="onDelete()"
            data-testid="comment-delete-btn">
            <mat-icon>delete_outline</mat-icon>
          </button>
          <button
            mat-icon-button
            class="comment-popover__action"
            matTooltip="Close"
            (click)="closed.emit()"
            data-testid="comment-close-btn">
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <div class="comment-popover__messages" #messagesContainer>
          @for (msg of messages(); track msg.id) {
            <div class="comment-popover__message">
              <div class="comment-popover__msg-header">
                <app-user-avatar
                  [username]="msg.authorName"
                  size="small"
                  class="comment-popover__msg-avatar"></app-user-avatar>
                <span class="comment-popover__msg-author">{{
                  msg.authorName
                }}</span>
                <span class="comment-popover__msg-date">{{
                  formatDate(msg.createdAt)
                }}</span>
              </div>
              <div class="comment-popover__msg-text">{{ msg.text }}</div>
            </div>
          } @empty {
            <div class="comment-popover__empty">No messages</div>
          }
        </div>

        <div class="comment-popover__reply">
          <input
            #replyInput
            class="comment-popover__reply-input"
            type="text"
            placeholder="Reply..."
            [(ngModel)]="replyText"
            (keydown.enter)="onReply()"
            data-testid="comment-reply-input" />
          <button
            mat-icon-button
            class="comment-popover__reply-btn"
            [disabled]="!replyText.trim()"
            (click)="onReply()"
            matTooltip="Send reply"
            data-testid="comment-reply-btn">
            <mat-icon>send</mat-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .comment-popover {
        background: var(--sys-surface-container-high);
        border: 1px solid var(--sys-outline-variant);
        border-radius: 8px;
        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.2),
          0 2px 8px rgba(0, 0, 0, 0.1);
        width: 320px;
        max-height: 400px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-size: 13px;
      }

      .comment-popover__loading {
        display: flex;
        justify-content: center;
        padding: 24px;
      }

      .comment-popover__header {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid var(--sys-outline-variant);
        gap: 6px;
      }

      .comment-popover__avatar {
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

      .comment-popover__author {
        font-weight: 500;
        color: var(--sys-on-surface);
      }

      .comment-popover__date {
        color: var(--sys-on-surface-variant);
        font-size: 11px;
      }

      .comment-popover__spacer {
        flex: 1;
      }

      .comment-popover__action {
        width: 28px;
        height: 28px;
        line-height: 28px;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }

      .comment-popover__messages {
        flex: 1;
        overflow-y: auto;
        padding: 8px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 260px;
      }

      .comment-popover__message {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .comment-popover__msg-header {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .comment-popover__msg-avatar {
        width: 18px;
        height: 18px;
        flex-shrink: 0;

        ::ng-deep .avatar {
          width: 18px;
          height: 18px;

          img,
          svg {
            width: 18px;
            height: 18px;
          }
        }
      }

      .comment-popover__msg-author {
        font-weight: 500;
        font-size: 12px;
        color: var(--sys-on-surface);
      }

      .comment-popover__msg-date {
        font-size: 11px;
        color: var(--sys-on-surface-variant);
      }

      .comment-popover__msg-text {
        color: var(--sys-on-surface);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .comment-popover__empty {
        color: var(--sys-on-surface-variant);
        text-align: center;
        padding: 12px;
      }

      .comment-popover__reply {
        display: flex;
        align-items: center;
        padding: 6px 8px;
        border-top: 1px solid var(--sys-outline-variant);
        gap: 4px;
      }

      .comment-popover__reply-input {
        flex: 1;
        border: 1px solid var(--sys-outline-variant);
        border-radius: 4px;
        padding: 6px 8px;
        font-size: 13px;
        background: var(--sys-surface);
        color: var(--sys-on-surface);
        outline: none;

        &:focus {
          border-color: var(--sys-primary);
        }
      }

      .comment-popover__reply-btn {
        width: 32px;
        height: 32px;
        line-height: 32px;
      }
    `,
  ],
})
export class CommentPopoverComponent {
  private readonly commentService = inject(CommentService);

  /** The mark attributes of the clicked comment */
  attrs = input.required<CommentMarkAttrs>();

  /** Project coordinates for REST calls */
  username = input.required<string>();
  slug = input.required<string>();

  /** Viewport coordinates where the popover should appear */
  position = input.required<{ x: number; y: number }>();

  /** Emitted when the popover should close */
  closed = output<void>();

  /** Emitted when thread is resolved or deleted (mark should be removed) */
  resolved = output<string>();

  /** Emitted when thread is deleted */
  deleted = output<string>();

  /** Emitted when thread data changes (mark cache should update) */
  updated = output<{ commentId: string; updates: Partial<CommentMarkAttrs> }>();

  @ViewChild('messagesContainer')
  messagesContainer?: ElementRef<HTMLDivElement>;

  loading = signal(true);
  thread = signal<CommentThreadResponse | null>(null);
  replyText = '';

  /** Unified message list (works for both server and local-only) */
  messages = computed<
    Array<{
      id: string;
      authorName: string;
      text: string;
      createdAt: string | number;
    }>
  >(() => {
    const t = this.thread();
    if (t) return t.messages;

    // Local-only fallback
    const a = this.attrs();
    if (a.localOnly && a.messages) {
      try {
        return JSON.parse(a.messages) as LocalCommentMessage[];
      } catch {
        return [];
      }
    }
    return [];
  });

  threadAuthor = computed(() => {
    return this.thread()?.authorName ?? this.attrs().authorName ?? 'Unknown';
  });

  threadDate = computed(() => {
    const t = this.thread();
    if (t) return this.formatDate(t.createdAt);
    const a = this.attrs();
    return a.createdAt ? this.formatDate(a.createdAt) : '';
  });

  /** Adjust position to keep popover within viewport */
  adjustedPosition = computed(() => {
    const pos = this.position();
    const popoverWidth = 320;
    const popoverHeight = 300;
    const margin = 8;

    let left = pos.x;
    let top = pos.y + 24; // Below the click point

    // Keep within horizontal bounds
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    // If below would overflow, show above
    if (top + popoverHeight > window.innerHeight - margin) {
      top = pos.y - popoverHeight - 8;
    }
    if (top < margin) top = margin;

    return { top, left };
  });

  constructor() {
    // Fetch thread data when attrs change
    effect(() => {
      const a = this.attrs();
      if (!a.commentId) return;

      if (a.localOnly) {
        this.loading.set(false);
        return;
      }

      void this.fetchThread(a.commentId);
    });
  }

  private async fetchThread(commentId: string): Promise<void> {
    this.loading.set(true);
    try {
      const t = await this.commentService.getThread(
        this.username(),
        this.slug(),
        commentId
      );
      this.thread.set(t);
    } catch {
      // Thread may not exist on server (orphan mark)
      this.thread.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async onReply(): Promise<void> {
    const text = this.replyText.trim();
    if (!text) return;

    const a = this.attrs();
    if (a.localOnly) {
      // Local-only reply would need the editor view — emit for parent to handle
      this.updated.emit({
        commentId: a.commentId,
        updates: { messageCount: (a.messageCount || 0) + 1 },
      });
      this.replyText = '';
      return;
    }

    try {
      await this.commentService.addMessage(
        this.username(),
        this.slug(),
        a.commentId,
        text
      );
      this.replyText = '';
      // Refresh the thread
      await this.fetchThread(a.commentId);
      this.updated.emit({
        commentId: a.commentId,
        updates: {
          messageCount: this.thread()?.messages.length ?? a.messageCount + 1,
          preview: text.length > 100 ? text.substring(0, 100) + '…' : text,
        },
      });
    } catch {
      // Error logged by service
    }
  }

  async onResolve(): Promise<void> {
    const a = this.attrs();
    if (a.localOnly) {
      this.resolved.emit(a.commentId);
      this.closed.emit();
      return;
    }

    try {
      await this.commentService.resolveThread(
        this.username(),
        this.slug(),
        a.commentId
      );
      this.resolved.emit(a.commentId);
      this.closed.emit();
    } catch {
      // Error logged by service
    }
  }

  async onUnresolve(): Promise<void> {
    const a = this.attrs();
    if (a.localOnly) return;

    try {
      await this.commentService.unresolveThread(
        this.username(),
        this.slug(),
        a.commentId
      );
      this.updated.emit({
        commentId: a.commentId,
        updates: { resolved: false },
      });
      await this.fetchThread(a.commentId);
    } catch {
      // Error logged by service
    }
  }

  async onDelete(): Promise<void> {
    const a = this.attrs();
    if (a.localOnly) {
      this.deleted.emit(a.commentId);
      this.closed.emit();
      return;
    }

    try {
      await this.commentService.deleteThread(
        this.username(),
        this.slug(),
        a.commentId
      );
      this.deleted.emit(a.commentId);
      this.closed.emit();
    } catch {
      // Error logged by service
    }
  }

  formatDate(date: string | number): string {
    return formatRelativeDate(date);
  }
}
