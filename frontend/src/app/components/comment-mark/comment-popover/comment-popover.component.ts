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
import { form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TooltipAriaLabelDirective } from '@directives/tooltip-aria-label.directive';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { formatRelativeDate } from '@utils/date-format';

import type {
  CommentThreadResponse,
  LocalCommentMessage,
} from '../../../services/project/comment.service';
import {
  CommentService,
  isCommentId,
} from '../../../services/project/comment.service';
import { UserAvatarComponent } from '../../user-avatar/user-avatar.component';
import type { CommentMarkAttrs } from '../comment-mark-schema';

interface CommentReplyFormValue {
  replyText: string;
}

@Component({
  selector: 'app-comment-popover',
  standalone: true,
  imports: [
    TooltipAriaLabelDirective,
    FormField,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslocoModule,
    UserAvatarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comment-popover.component.html',
  styleUrls: ['./comment-popover.component.scss'],
})
export class CommentPopoverComponent {
  private readonly commentService = inject(CommentService);
  private readonly transloco = inject(TranslocoService);

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

  /** Emitted for a reply to a local-only thread, which lives in the mark */
  localReply = output<{ commentId: string; text: string }>();

  @ViewChild('messagesContainer')
  messagesContainer?: ElementRef<HTMLDivElement>;

  loading = signal(true);
  thread = signal<CommentThreadResponse | null>(null);
  readonly model = signal<CommentReplyFormValue>({ replyText: '' });
  readonly form = form(this.model);

  /**
   * The loaded server thread when it is the open mark's, else null. The
   * editor reuses this popover when another highlight is clicked, so a
   * thread loaded for an earlier mark is never shown or acted on.
   */
  private readonly openThread = computed(() => {
    const t = this.thread();
    return t?.id === this.attrs().commentId ? t : null;
  });

  /**
   * A server comment that cannot be shown: its id is not a comment id (it is
   * never sent to the server), or no thread with its id has loaded. The
   * popover then offers no server actions, only a notice and Close.
   */
  readonly unavailable = computed(
    () =>
      !this.loading() && !this.attrs().localOnly && this.openThread() === null
  );

  /** Bumped per thread load, so a late response for another mark is dropped. */
  private loadGeneration = 0;

  /** Unified message list (works for both server and local-only) */
  messages = computed<
    Array<{
      id: string;
      authorName: string;
      authorUsername?: string;
      text: string;
      createdAt: string | number;
    }>
  >(() => {
    const t = this.openThread();
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
    return (
      this.openThread()?.authorName ??
      this.attrs().authorName ??
      this.transloco.translate('editor.comments.unknownAuthor')
    );
  });

  threadDate = computed(() => {
    const t = this.openThread();
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

  private readonly commentId = computed(() => this.attrs().commentId);
  private readonly localOnly = computed(() => this.attrs().localOnly);

  constructor() {
    // Fetch thread data when the thread changes. Tracks only the id and
    // storage mode, so refreshed mark attrs (a reply, an unresolve) don't
    // trigger another fetch.
    effect(() => {
      const commentId = this.commentId();
      if (!commentId) return;

      // A local-only thread lives in the mark. An id that is not a comment id
      // is never sent to the server; the popover shows it as unavailable.
      if (this.localOnly() || !isCommentId(commentId)) {
        this.loadGeneration++;
        this.thread.set(null);
        this.loading.set(false);
        return;
      }

      void this.fetchThread(commentId);
    });
  }

  /**
   * The id to act on for a server thread, or null when there is none to act
   * on: a local-only mark, an id that is not a comment id, or no loaded
   * thread for the open mark.
   */
  private serverThreadId(): string | null {
    const a = this.attrs();
    if (a.localOnly || !isCommentId(a.commentId) || !this.openThread()) {
      return null;
    }
    return a.commentId;
  }

  /**
   * Fetch a server thread and return it (null when it does not load). It is
   * shown only while `commentId` is still the open mark and no later load
   * has started.
   */
  private async fetchThread(
    commentId: string
  ): Promise<CommentThreadResponse | null> {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    // A thread that does not load (an orphan mark, offline) is shown as
    // unavailable.
    const thread =
      (await this.commentService
        .getThread(this.username(), this.slug(), commentId)
        .catch(() => null)) ?? null;
    // Another mark was opened meanwhile, or a later load started; that load
    // decides what is shown.
    if (generation === this.loadGeneration && this.commentId() === commentId) {
      this.thread.set(thread);
      this.loading.set(false);
    }
    return thread;
  }

  async onReply(): Promise<void> {
    const text = this.model().replyText.trim();
    if (!text) return;

    const a = this.attrs();
    if (a.localOnly) {
      // The messages live in the mark, so the editor applies the reply
      this.localReply.emit({ commentId: a.commentId, text });
      this.form.replyText().value.set('');
      return;
    }

    const threadId = this.serverThreadId();
    if (!threadId) return;
    try {
      await this.commentService.addMessage(
        this.username(),
        this.slug(),
        threadId,
        text
      );
      this.form.replyText().value.set('');
      // Refresh the thread while it is still open; another highlight may
      // have been opened during the request.
      const thread =
        this.commentId() === threadId ? await this.fetchThread(threadId) : null;
      this.updated.emit({
        commentId: threadId,
        updates: {
          messageCount: thread?.messages.length ?? a.messageCount + 1,
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

    const threadId = this.serverThreadId();
    if (!threadId) return;
    try {
      await this.commentService.resolveThread(
        this.username(),
        this.slug(),
        threadId
      );
      this.resolved.emit(threadId);
      this.closed.emit();
    } catch {
      // Error logged by service
    }
  }

  async onUnresolve(): Promise<void> {
    const a = this.attrs();
    if (a.localOnly) {
      this.updated.emit({
        commentId: a.commentId,
        updates: { resolved: false },
      });
      return;
    }

    const threadId = this.serverThreadId();
    if (!threadId) return;
    try {
      await this.commentService.unresolveThread(
        this.username(),
        this.slug(),
        threadId
      );
      this.updated.emit({
        commentId: threadId,
        updates: { resolved: false },
      });
      // Refresh the thread while it is still open.
      if (this.commentId() === threadId) await this.fetchThread(threadId);
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

    const threadId = this.serverThreadId();
    if (!threadId) return;
    try {
      await this.commentService.deleteThread(
        this.username(),
        this.slug(),
        threadId
      );
      this.deleted.emit(threadId);
      this.closed.emit();
    } catch {
      // Error logged by service
    }
  }

  formatDate(date: string | number): string {
    return formatRelativeDate(date, this.transloco.getActiveLang());
  }
}
