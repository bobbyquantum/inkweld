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
  ProjectSearchFilters,
  ProjectSearchProgress,
  ProjectSearchResult,
  ProjectSearchService,
  SearchSnippet,
} from '../../services/core/project-search.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { RelationshipService } from '../../services/relationship/relationship.service';
import { TagService } from '../../services/tag/tag.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';

/** Number of results to show per pagination page */
const PAGE_SIZE = 50;

/**
 * Dialog for project-wide full-text search (Cmd/Ctrl + Shift + F).
 *
 * Features:
 * - Case-insensitive search across all document content
 * - Browse mode: shows all elements when query is empty
 * - Progressive results as documents are scanned
 * - Highlighted text snippets showing match context
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 * - Opens matched document and triggers find-in-document on navigation
 * - Infinite-scroll pagination (loads PAGE_SIZE results at a time)
 * - Filters: element type, worldbuilding schema, tags, relationships
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
  private readonly tagService = inject(TagService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly worldbuildingService = inject(WorldbuildingService);

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

  // ─── Pagination ───────────────────────────────────────────────────────

  /** How many results are currently displayed (grows with scroll) */
  readonly displayedCount = signal(PAGE_SIZE);

  /** The slice of results visible in the list */
  readonly visibleResults = computed(() =>
    this.resultsList().slice(0, this.displayedCount())
  );

  /** Whether there are more results to show */
  readonly hasMoreResults = computed(
    () => this.resultsList().length > this.displayedCount()
  );

  // ─── Filters ──────────────────────────────────────────────────────────

  /** Whether the filter panel is expanded */
  readonly showFilters = signal(false);

  /** Selected tag IDs for filtering */
  readonly selectedTagIds = signal<string[]>([]);

  /** Selected element types for filtering */
  readonly selectedElementTypes = signal<ElementType[]>([]);

  /** Selected worldbuilding schema IDs for filtering */
  readonly selectedSchemaIds = signal<string[]>([]);

  /** Element ID to filter by relationship (empty = no filter) */
  readonly relatedToElementId = signal<string>('');

  /** Available tags from the project */
  readonly availableTags = computed(() => this.tagService.allTags());

  /** Whether any tags exist in the project (controls filter button visibility) */
  readonly hasTags = computed(() => this.availableTags().length > 0);

  /** Available worldbuilding schemas for the project */
  readonly availableSchemas = computed(() =>
    this.worldbuildingService.getSchemas()
  );

  /** Whether any schemas exist in the project */
  readonly hasSchemas = computed(() => this.availableSchemas().length > 0);

  /** Searchable element types (excludes Folder) */
  readonly elementTypeOptions: {
    type: ElementType;
    label: string;
    icon: string;
  }[] = [
    { type: ElementType.Item, label: 'Documents', icon: 'description' },
    {
      type: ElementType.Worldbuilding,
      label: 'Worldbuilding',
      icon: 'category',
    },
    { type: ElementType.RelationshipChart, label: 'Charts', icon: 'hub' },
    { type: ElementType.Canvas, label: 'Canvas', icon: 'dashboard' },
  ];

  /** Elements available for the relationship filter dropdown */
  readonly relatedElements = computed(() => {
    const elements = this.projectState.elements();
    return elements
      .filter(
        el =>
          el.type !== ElementType.Folder &&
          this.relationshipService.hasRelationships(el.id)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** Whether any relationship-enabled elements exist */
  readonly hasRelationships = computed(() => this.relatedElements().length > 0);

  /** Total number of active filters */
  readonly activeFilterCount = computed(() => {
    let count = 0;
    if (this.selectedTagIds().length > 0) count++;
    if (this.selectedElementTypes().length > 0) count++;
    if (this.selectedSchemaIds().length > 0) count++;
    if (this.relatedToElementId()) count++;
    return count;
  });

  /** Current filters object for the search service */
  private readonly currentFilters = computed<ProjectSearchFilters>(() => ({
    tagIds: this.selectedTagIds(),
    elementTypes: this.selectedElementTypes(),
    relatedToElementId: this.relatedToElementId() || undefined,
    schemaIds: this.selectedSchemaIds(),
  }));

  /** Whether any text query is active */
  readonly hasTextQuery = computed(() => this.searchQuery().trim().length >= 2);

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
    // Trigger initial browse (shows all elements filtered)
    this.runSearch('');
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
    this.displayedCount.set(PAGE_SIZE);

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => this.runSearch(value), 300);
  }

  /** Toggle the filter panel */
  toggleFilters(): void {
    this.showFilters.update(v => !v);
  }

  /** Toggle a tag in the filter */
  toggleTag(tagId: string): void {
    this.selectedTagIds.update(ids =>
      ids.includes(tagId) ? ids.filter(id => id !== tagId) : [...ids, tagId]
    );
    this.retriggerSearch();
  }

  /** Toggle an element type in the filter */
  toggleElementType(type: ElementType): void {
    this.selectedElementTypes.update(types =>
      types.includes(type) ? types.filter(t => t !== type) : [...types, type]
    );
    this.retriggerSearch();
  }

  /** Toggle a worldbuilding schema in the filter */
  toggleSchema(schemaId: string): void {
    this.selectedSchemaIds.update(ids =>
      ids.includes(schemaId)
        ? ids.filter(id => id !== schemaId)
        : [...ids, schemaId]
    );
    this.retriggerSearch();
  }

  /** Check if the given schema ID is selected */
  isSchemaSelected(schemaId: string): boolean {
    return this.selectedSchemaIds().includes(schemaId);
  }

  /** Set the related-to element for relationship filtering */
  setRelatedToElement(elementId: string): void {
    this.relatedToElementId.set(elementId);
    this.retriggerSearch();
  }

  /** Clear all filters */
  clearFilters(): void {
    this.selectedTagIds.set([]);
    this.selectedElementTypes.set([]);
    this.selectedSchemaIds.set([]);
    this.relatedToElementId.set('');
    this.retriggerSearch();
  }

  /** Check if the given tag ID is selected */
  isTagSelected(tagId: string): boolean {
    return this.selectedTagIds().includes(tagId);
  }

  /** Check if the given element type is selected */
  isElementTypeSelected(type: ElementType): boolean {
    return this.selectedElementTypes().includes(type);
  }

  /** Get the name of the related-to element */
  getRelatedElementName(): string {
    const id = this.relatedToElementId();
    if (!id) return '';
    const el = this.projectState.elements().find(e => e.id === id);
    return el?.name ?? '';
  }

  /** Re-trigger search with current query and filters */
  private retriggerSearch(): void {
    const query = this.searchQuery();
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.displayedCount.set(PAGE_SIZE);
    this.debounceTimer = setTimeout(() => this.runSearch(query), 150);
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
        signal,
        this.currentFilters()
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
      case ElementType.Worldbuilding: {
        // Show the schema icon if available
        const schemaId = result.element.schemaId;
        if (schemaId) {
          const schema = this.worldbuildingService.getSchemaById(schemaId);
          if (schema?.icon) return schema.icon;
        }
        return 'category';
      }
      case ElementType.RelationshipChart:
        return 'hub';
      case ElementType.Canvas:
        return 'dashboard';
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
    return this.visibleResults();
  }

  get totalResults(): number {
    return this.resultsList().length;
  }

  get isDone(): boolean {
    return this.progress().done;
  }

  get hasQuery(): boolean {
    return this.searchQuery().trim().length >= 2;
  }

  /** Load the next page of results (infinite scroll) */
  loadMore(): void {
    this.displayedCount.update(n => n + PAGE_SIZE);
  }

  /** Handle scroll event on the results container for infinite scroll */
  onResultsScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom && this.hasMoreResults()) {
      this.loadMore();
    }
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
