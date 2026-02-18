import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ElementType } from '@inkweld/index';

import { FindInDocumentService } from '../../services/core/find-in-document.service';
import {
  ProjectSearchProgress,
  ProjectSearchResult,
  ProjectSearchService,
  SearchSnippet,
} from '../../services/core/project-search.service';
import { ProjectStateService } from '../../services/project/project-state.service';

/**
 * Dialog for project-wide full-text search (Cmd/Ctrl + Shift + F).
 *
 * Features:
 * - Case-insensitive search across all document content
 * - Progressive results as documents are scanned
 * - Highlighted text snippets showing match context
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Opens matched document and triggers find-in-document on navigation
 */
@Component({
  selector: 'app-project-search-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './project-search-dialog.component.html',
  styleUrls: ['./project-search-dialog.component.scss'],
})
export class ProjectSearchDialogComponent implements AfterViewInit, OnDestroy {
  private readonly dialogRef = inject(
    MatDialogRef<ProjectSearchDialogComponent>
  );
  private readonly projectSearchService = inject(ProjectSearchService);
  private readonly projectState = inject(ProjectStateService);
  private readonly findInDocumentService = inject(FindInDocumentService);

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  /** Current search query entered by the user */
  readonly searchQuery = signal('');

  /** Active scan progress */
  readonly progress = signal<ProjectSearchProgress>({
    scanned: 0,
    total: 0,
    results: [],
    done: true,
  });

  /** Currently highlighted result index */
  readonly selectedIndex = signal(0);

  /** Whether a search is in progress */
  readonly isSearching = signal(false);

  /** Derived results list — reactive so template re-evaluates when progress changes */
  readonly resultsList = computed(() => this.progress().results);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  /** Track whether the user has moved the mouse since the dialog opened */
  private mouseMoved = false;

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    this.handleKeydown(event);
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.searchInput?.nativeElement?.focus();
    });
    document.addEventListener('mousemove', this.onMouseMove, {
      once: false,
      passive: true,
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousemove', this.onMouseMove);
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.abortController?.abort();
  }

  /** Called on each keystroke in the search input */
  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.selectedIndex.set(0);

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    if (!value.trim() || value.trim().length < 2) {
      this.abortController?.abort();
      this.isSearching.set(false);
      this.progress.set({ scanned: 0, total: 0, results: [], done: true });
      return;
    }

    this.debounceTimer = setTimeout(() => this.runSearch(value), 300);
  }

  private runSearch(query: string): void {
    // Cancel any previous scan
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.isSearching.set(true);
    this.progress.set({ scanned: 0, total: 0, results: [], done: false });
    this.selectedIndex.set(-1);
    this.mouseMoved = false; // reset so new results aren't stolen by mouseenter

    void this.projectSearchService
      .search(
        query,
        progress => {
          if (!signal.aborted) {
            this.progress.set(progress);
            if (progress.results.length > 0 && this.selectedIndex() < 0) {
              this.selectedIndex.set(0);
            } else if (this.selectedIndex() >= progress.results.length) {
              this.selectedIndex.set(0);
            }
            if (progress.done) {
              this.isSearching.set(false);
            }
          }
        },
        signal
      )
      .then(() => {
        if (!signal.aborted) {
          this.isSearching.set(false);
        }
      });
  }

  private handleKeydown(event: KeyboardEvent): void {
    const results = this.resultsList();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        this.selectedIndex.set(
          Math.min(this.selectedIndex() + 1, results.length - 1)
        );
        this.scrollSelectedIntoView();
        break;

      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        this.selectedIndex.set(Math.max(this.selectedIndex() - 1, 0));
        this.scrollSelectedIntoView();
        break;

      case 'Enter':
        event.preventDefault();
        event.stopPropagation();
        this.selectResult(results[this.selectedIndex()]);
        break;

      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.dialogRef.close();
        break;
    }
  }

  private scrollSelectedIntoView(): void {
    setTimeout(() => {
      document.querySelector('.search-result-item.selected')?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    });
  }

  /** Navigate to a result and trigger find-in-document */
  selectResult(result: ProjectSearchResult | undefined): void {
    if (!result) return;

    const query = this.searchQuery().trim();
    this.projectState.openDocument(result.element);
    this.dialogRef.close();

    // After the editor has had time to mount, open find-in-document
    // pre-populated with the search query so the user lands on the first match.
    if (query) {
      setTimeout(() => {
        this.findInDocumentService.open();
        this.findInDocumentService.search(query);
      }, 500);
    }
  }

  onResultClick(result: ProjectSearchResult, index: number): void {
    this.selectedIndex.set(index);
    this.selectResult(result);
  }

  onResultMouseEnter(index: number): void {
    // Only follow mouse if the user has physically moved the mouse.
    // Prevents render-time mouseenter events (DOM painted under stationary
    // cursor) from overriding keyboard-driven selection.
    if (this.mouseMoved) {
      this.selectedIndex.set(index);
    }
  }

  private readonly onMouseMove = (): void => {
    this.mouseMoved = true;
  };

  /** Get the Material icon name for an element type */
  getIcon(result: ProjectSearchResult): string {
    const type = result.element.type;
    switch (type) {
      case ElementType.Folder:
        return 'folder';
      case ElementType.Item:
        return 'description';
      case ElementType.Worldbuilding:
        return 'category';
      default:
        return 'description';
    }
  }

  /** Build safe HTML for a snippet, highlighting the match in bold */
  getSnippetHtml(snippet: SearchSnippet): string {
    return (
      this.escapeHtml(snippet.before) +
      '<mark>' +
      this.escapeHtml(snippet.match) +
      '</mark>' +
      this.escapeHtml(snippet.after)
    );
  }

  /** Progress bar value 0–100 */
  get progressValue(): number {
    const { scanned, total } = this.progress();
    return total > 0 ? Math.round((scanned / total) * 100) : 0;
  }

  get results(): ProjectSearchResult[] {
    return this.resultsList();
  }

  get isDone(): boolean {
    return this.progress().done;
  }

  get hasQuery(): boolean {
    return this.searchQuery().trim().length >= 2;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  trackByResultId(_index: number, result: ProjectSearchResult): string {
    return result.element.id;
  }
}
