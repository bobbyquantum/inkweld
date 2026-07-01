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
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  AutoReviewApiService,
  type AutoReviewSuggestion,
} from '@services/lint/auto-review.service';
import type { EditorView } from 'prosemirror-view';

/** A suggestion with its computed display position in the gutter. */
interface PositionedSuggestion extends AutoReviewSuggestion {
  displayTop: number;
  /** Whether this suggestion has been resolved (accepted/rejected). */
  resolved: 'accepted' | 'rejected' | null;
}

@Component({
  selector: 'app-auto-review-panel',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatMenuModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auto-review-panel.component.html',
  styleUrls: ['./auto-review-panel.component.scss'],
})
export class AutoReviewPanelComponent {
  private readonly autoReviewApi = inject(AutoReviewApiService);

  /** Project coordinates */
  username = input.required<string>();
  slug = input.required<string>();
  /** Document element ID (bare, no trailing slash). */
  docId = input.required<string>();
  /** Editor view for mark scanning + position computation. */
  editorView = input<EditorView | null>(null);
  /** Whether the panel is open. */
  isOpen = input(false);
  /** Whether the user has write access. */
  canWrite = input(false);
  /** Map of suggestionId → Y offset (px) relative to editor content top. */
  suggestionPositions = input<Record<string, number>>({});
  /** Editor scroll container's scrollTop / scrollHeight. */
  editorScrollTop = input(0);
  editorContentHeight = input(0);

  closed = output<void>();
  suggestionAccepted = output<string>();
  suggestionRejected = output<string>();
  suggestionHovered = output<string | null>();
  reviewCleared = output<void>();
  /** Emitted when the user scrolls (wheel) over the panel gutter.
   *  The editor listens and scrolls its content to match. */
  scrollEditor = output<number>();

  expandedSuggestionId = signal<string | null>(null);

  /** ID of the suggestion currently being processed (accept/reject/undo).
   *  Used to disable the action buttons so the user can't double-click. */
  processingId = signal<string | null>(null);

  /** Count of rejected suggestions stored for this document (loaded on
   *  idle state so the user knows prior rejections exist). */
  rejectionCount = signal(0);
  clearingRejections = signal(false);

  /**
   * Whether a review has been run for the current document and its
   * results are still "active" (marks present in the doc). Distinguishes
   * the idle form state (no review yet) from the post-review empty state
   * (review ran, no issues). Reset by `onClearAll()` ("Dismiss Review").
   */
  hasReviewed = signal(false);

  /**
   * Stores the full suggestion data + last-known position for resolved
   * items so they stay in place in the gutter after accept/reject.
   * Keyed by suggestion id.
   */
  private readonly resolvedStore = signal<
    Map<
      string,
      {
        suggestion: AutoReviewSuggestion;
        position: number;
        action: 'accepted' | 'rejected';
      }
    >
  >(new Map());

  /** Suggestions scanned from the editor document marks. Re-evaluates when
   *  the shared service's docVersion bumps (editor update / Yjs sync). */
  readonly suggestions = computed<AutoReviewSuggestion[]>(() => {
    const view = this.editorView();
    this.autoReviewApi.docVersion(); // dependency
    if (!view) return [];
    return this.autoReviewApi.scanDocumentMarks(view);
  });

  readonly reviewing = computed(() => this.autoReviewApi.reviewing());

  /**
   * Merged list of active + resolved suggestions, sorted by position and
   * laid out so items don't overlap. Resolved items keep their last-known
   * position and appear greyed with an undo button.
   */
  readonly positionedSuggestions = computed<PositionedSuggestion[]>(() => {
    const active = this.suggestions();
    const positions = this.suggestionPositions();
    const resolved = this.resolvedStore();
    const expanded = this.expandedSuggestionId();

    // Build a combined map: id → { suggestion, position, resolved }
    const combined: Array<{
      suggestion: AutoReviewSuggestion;
      position: number;
      resolved: 'accepted' | 'rejected' | null;
    }> = [];

    for (const s of active) {
      combined.push({
        suggestion: s,
        position: positions[s.id] ?? 0,
        resolved: null,
      });
    }

    for (const [id, entry] of resolved) {
      // Skip if the suggestion is still active (shouldn't happen, but guard).
      if (active.some(s => s.id === id)) continue;
      combined.push({
        suggestion: entry.suggestion,
        position: entry.position,
        resolved: entry.action,
      });
    }

    // Sort by position.
    combined.sort((a, b) => a.position - b.position);

    // Layout: prevent overlap, clamp items that would overflow the bottom.
    const minGap = 4;
    const collapsedHeight = 52;
    const expandedHeight = 140;
    const contentHeight = this.editorContentHeight();
    let lastBottom = 0;

    return combined.map(({ suggestion, position, resolved: res }) => {
      const naturalTop = position;
      let displayTop = Math.max(naturalTop, lastBottom);
      const height =
        expanded === suggestion.id ? expandedHeight : collapsedHeight;
      // Clamp: if the item would render below the editor content area,
      // push it up so it stays visible (buttons accessible).
      if (contentHeight > 0 && displayTop + height > contentHeight) {
        displayTop = Math.max(0, contentHeight - height);
      }
      lastBottom = displayTop + height + minGap;
      return { ...suggestion, displayTop, resolved: res };
    });
  });

  /** Total count of visible items (active + resolved). */
  readonly totalCount = computed(
    () => this.suggestions().length + this.resolvedStore().size
  );

  constructor() {
    // Load rejection count when the panel is open in idle state.
    effect(() => {
      // Read all signals we depend on so the effect re-runs when they change.
      const open = this.isOpen();
      const reviewed = this.hasReviewed();
      if (open && !reviewed) {
        // Use untracked to avoid tracking username/slug/docId — they
        // don't change while the panel is open.
        const username = this.username();
        const slug = this.slug();
        const docId = this.docId();
        if (username && slug && docId) {
          void this.loadRejectionCount();
        }
      }
    });
  }

  getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  }

  getSeverityLabel(severity: string): string {
    switch (severity) {
      case 'error':
        return 'Error';
      case 'warning':
        return 'Warning';
      default:
        return 'Suggestion';
    }
  }

  onSuggestionClick(suggestion: AutoReviewSuggestion): void {
    const current = this.expandedSuggestionId();
    this.expandedSuggestionId.set(
      current === suggestion.id ? null : suggestion.id
    );
  }

  async onReview(): Promise<void> {
    const username = this.username();
    const slug = this.slug();
    const docId = this.docId();
    if (!username || !slug || !docId) return;
    await this.autoReviewApi.reviewDocument(username, slug, docId);
    this.hasReviewed.set(true);
    this.resolvedStore.set(new Map());
  }

  /** Load the rejection count for this document (called on idle state). */
  async loadRejectionCount(): Promise<void> {
    const username = this.username();
    const slug = this.slug();
    const docId = this.docId();
    if (!username || !slug || !docId) return;
    const count = await this.autoReviewApi.getRejectionCount(
      username,
      slug,
      docId
    );
    this.rejectionCount.set(count);
  }

  /** Reset all rejections for this document. */
  async onClearRejections(): Promise<void> {
    const username = this.username();
    const slug = this.slug();
    const docId = this.docId();
    if (!username || !slug || !docId) return;
    this.clearingRejections.set(true);
    try {
      await this.autoReviewApi.clearRejections(username, slug, docId);
      this.rejectionCount.set(0);
    } finally {
      this.clearingRejections.set(false);
    }
  }

  async onAccept(
    suggestion: AutoReviewSuggestion,
    event: Event
  ): Promise<void> {
    event.stopPropagation();
    if (this.processingId() === suggestion.id) return;
    this.processingId.set(suggestion.id);
    try {
      const username = this.username();
      const slug = this.slug();
      const docId = this.docId();
      if (!username || !slug || !docId) return;

      // Capture the position BEFORE accepting (the mark disappears after).
      const positions = this.suggestionPositions();
      const lastPos = positions[suggestion.id] ?? 0;

      await this.autoReviewApi.acceptSuggestion(
        username,
        slug,
        docId,
        suggestion.id,
        suggestion.suggestion
      );
      this.expandedSuggestionId.set(null);

      // Store as resolved so the item stays in place with undo.
      const store = new Map(this.resolvedStore());
      store.set(suggestion.id, {
        suggestion,
        position: lastPos,
        action: 'accepted',
      });
      this.resolvedStore.set(store);
      this.suggestionAccepted.emit(suggestion.id);
    } finally {
      this.processingId.set(null);
    }
  }

  async onReject(
    suggestion: AutoReviewSuggestion,
    event: Event
  ): Promise<void> {
    event.stopPropagation();
    if (this.processingId() === suggestion.id) return;
    this.processingId.set(suggestion.id);
    try {
      const username = this.username();
      const slug = this.slug();
      const docId = this.docId();
      if (!username || !slug || !docId) return;

      // Capture the position BEFORE rejecting.
      const positions = this.suggestionPositions();
      const lastPos = positions[suggestion.id] ?? 0;

      await this.autoReviewApi.rejectSuggestion(
        username,
        slug,
        docId,
        suggestion.id
      );
      this.expandedSuggestionId.set(null);

      const store = new Map(this.resolvedStore());
      store.set(suggestion.id, {
        suggestion,
        position: lastPos,
        action: 'rejected',
      });
      this.resolvedStore.set(store);
      this.suggestionRejected.emit(suggestion.id);
    } finally {
      this.processingId.set(null);
    }
  }

  async onUndo(suggestion: AutoReviewSuggestion, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.processingId() === suggestion.id) return;
    this.processingId.set(suggestion.id);
    try {
      const username = this.username();
      const slug = this.slug();
      const docId = this.docId();
      if (!username || !slug || !docId) return;
      // Re-run the review to restore the mark.
      await this.autoReviewApi.reviewDocument(username, slug, docId);
      const store = new Map(this.resolvedStore());
      store.delete(suggestion.id);
      this.resolvedStore.set(store);
    } finally {
      this.processingId.set(null);
    }
  }

  async onClearAll(): Promise<void> {
    const username = this.username();
    const slug = this.slug();
    const docId = this.docId();
    if (!username || !slug || !docId) return;
    await this.autoReviewApi.clearAllMarks(username, slug, docId);
    this.hasReviewed.set(false);
    this.expandedSuggestionId.set(null);
    this.resolvedStore.set(new Map());
    this.reviewCleared.emit();
  }

  /** Dismiss + re-review in one action (common workflow). */
  async onRereview(): Promise<void> {
    const username = this.username();
    const slug = this.slug();
    const docId = this.docId();
    if (!username || !slug || !docId) return;
    await this.autoReviewApi.clearAllMarks(username, slug, docId);
    this.resolvedStore.set(new Map());
    this.expandedSuggestionId.set(null);
    this.reviewCleared.emit();
    await this.autoReviewApi.reviewDocument(username, slug, docId);
    this.hasReviewed.set(true);
  }

  onClose(): void {
    this.closed.emit();
  }

  onHover(id: string | null): void {
    this.suggestionHovered.emit(id);
  }

  /**
   * Relay wheel scroll events over the gutter to the editor so the user
   * can scroll the editor content by scrolling over the side panel.
   * We preventDefault so the panel itself doesn't try to scroll (it has
   * overflow:hidden), and emit the deltaY so the editor component scrolls
   * its content container.
   */
  onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.scrollEditor.emit(event.deltaY);
  }

  getPreview(suggestion: AutoReviewSuggestion): string {
    return suggestion.originalText.length > 60
      ? suggestion.originalText.slice(0, 57) + '…'
      : suggestion.originalText;
  }
}
