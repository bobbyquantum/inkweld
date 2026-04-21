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
  templateUrl: './comment-popover.component.html',
  styleUrls: ['./comment-popover.component.scss'],
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
    if (left + popoverWidth > globalThis.innerWidth - margin) {
      left = globalThis.innerWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    // If below would overflow, show above
    if (top + popoverHeight > globalThis.innerHeight - margin) {
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
