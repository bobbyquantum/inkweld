import {
  ChangeDetectionStrategy,
  Component,
  computed,
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

interface PositionedSuggestion extends AutoReviewSuggestion {
  displayTop: number;
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

  expandedSuggestionId = signal<string | null>(null);

  /** Bumped on every editor doc change so the computed re-scans marks. */
  private readonly docVersion = signal(0);

  /** Suggestions scanned from the editor document marks. */
  readonly suggestions = computed<AutoReviewSuggestion[]>(() => {
    const view = this.editorView();
    this.docVersion(); // dependency — re-evaluates when bumped
    if (!view) return [];
    return this.autoReviewApi.scanDocumentMarks(view);
  });

  readonly reviewing = computed(() => this.autoReviewApi.reviewing());

  positionedSuggestions = computed<PositionedSuggestion[]>(() => {
    const suggestions = this.suggestions();
    const positions = this.suggestionPositions();
    const sorted = [...suggestions].sort((a, b) => {
      const posA = positions[a.id] ?? Infinity;
      const posB = positions[b.id] ?? Infinity;
      return posA - posB;
    });

    const minGap = 4;
    const collapsedHeight = 52;
    const expandedHeight = 140;
    let lastBottom = 0;
    return sorted.map(s => {
      const naturalTop = positions[s.id] ?? lastBottom;
      const displayTop = Math.max(naturalTop, lastBottom);
      const height =
        this.expandedSuggestionId() === s.id ? expandedHeight : collapsedHeight;
      lastBottom = displayTop + height + minGap;
      return { ...s, displayTop };
    });
  });

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
  }

  async onAccept(
    suggestion: AutoReviewSuggestion,
    event: Event
  ): Promise<void> {
    event.stopPropagation();
    const username = this.username();
    const slug = this.slug();
    const docId = this.docId();
    if (!username || !slug || !docId) return;
    await this.autoReviewApi.acceptSuggestion(
      username,
      slug,
      docId,
      suggestion.id,
      suggestion.suggestion
    );
    this.expandedSuggestionId.set(null);
    this.suggestionAccepted.emit(suggestion.id);
  }

  async onReject(
    suggestion: AutoReviewSuggestion,
    event: Event
  ): Promise<void> {
    event.stopPropagation();
    const username = this.username();
    const slug = this.slug();
    const docId = this.docId();
    if (!username || !slug || !docId) return;
    await this.autoReviewApi.rejectSuggestion(
      username,
      slug,
      docId,
      suggestion.id
    );
    this.expandedSuggestionId.set(null);
    this.suggestionRejected.emit(suggestion.id);
  }

  async onClearAll(): Promise<void> {
    const username = this.username();
    const slug = this.slug();
    const docId = this.docId();
    if (!username || !slug || !docId) return;
    await this.autoReviewApi.clearAllMarks(username, slug, docId);
  }

  onClose(): void {
    this.closed.emit();
  }

  onHover(id: string | null): void {
    this.suggestionHovered.emit(id);
  }

  getPreview(suggestion: AutoReviewSuggestion): string {
    return suggestion.originalText.length > 60
      ? suggestion.originalText.slice(0, 57) + '…'
      : suggestion.originalText;
  }

  /** Called by the parent editor component when the doc changes (Yjs sync). */
  refresh(): void {
    this.docVersion.update(v => v + 1);
  }
}
