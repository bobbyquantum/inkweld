import { inject, Injectable, signal } from '@angular/core';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { type Element, ElementType, type Project } from '@inkweld/index';

import { ProjectSearchDialogComponent } from '../../dialogs/project-search-dialog/project-search-dialog.component';
import { flattenToPlainText } from '../../utils/prosemirror-text';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import { RelationshipService } from '../relationship/relationship.service';
import { TagService } from '../tag/tag.service';

/** Navigator with User-Agent Client Hints (not yet in TS lib.dom) */
interface NavigatorWithUAData extends Navigator {
  userAgentData?: { platform: string };
}

/** A highlighted text snippet showing context around a match */
export interface SearchSnippet {
  /** Text before the match (may be truncated with …) */
  before: string;
  /** The matched text (preserves original casing) */
  match: string;
  /** Text after the match (may be truncated with …) */
  after: string;
}

/** A single result from a project-wide search */
export interface ProjectSearchResult {
  /** The element that matched */
  element: Element;
  /** Full document ID for opening */
  documentId: string;
  /** Total number of matches in the document */
  matchCount: number;
  /** Up to 3 snippet previews (first 3 matches) */
  snippets: SearchSnippet[];
  /** Breadcrumb path through folders (e.g. "Part One › Chapter Two") */
  path: string;
}

/** Progress update emitted while a search is running */
export interface ProjectSearchProgress {
  /** Number of documents scanned so far */
  scanned: number;
  /** Total documents to scan */
  total: number;
  /** Accumulated results (grows as documents are scanned) */
  results: ProjectSearchResult[];
  /** True when the scan is complete */
  done: boolean;
}

/** Options for filtering project search results */
export interface ProjectSearchFilters {
  /** Only include elements with at least one of these tags */
  tagIds?: string[];
  /** Only include elements of these types */
  elementTypes?: ElementType[];
  /** Only include elements that have a relationship with this element */
  relatedToElementId?: string;
  /** Only include worldbuilding elements matching one of these schema IDs */
  schemaIds?: string[];
}

/** Context characters to show around each match */
const SNIPPET_CONTEXT = 60;

/** Maximum snippets per result */
const MAX_SNIPPETS = 3;

/**
 * Service for project-wide full-text search (Cmd/Ctrl + Shift + F).
 *
 * Provides:
 * - Case-insensitive substring search across all document content
 * - Progressive results delivered as documents are scanned
 * - Cancellation support so a new query aborts the previous scan
 * - Keyboard shortcut registration
 * - Dialog lifecycle management
 */
@Injectable({
  providedIn: 'root',
})
export class ProjectSearchService {
  private readonly dialog = inject(MatDialog);
  private readonly projectState = inject(ProjectStateService);
  private readonly documentService = inject(DocumentService);
  private readonly tagService = inject(TagService);
  private readonly relationshipService = inject(RelationshipService);

  /** Whether the search dialog is currently open */
  readonly isOpen = signal(false);

  private dialogRef: MatDialogRef<ProjectSearchDialogComponent> | null = null;
  private keydownListener: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Initialize the global keyboard shortcut listener (Cmd/Ctrl + Shift + F).
   * Should be called once when a project is loaded.
   */
  initialize(): void {
    if (this.keydownListener) return;

    this.keydownListener = (event: KeyboardEvent) => {
      const isMac = this.isMacPlatform();
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;

      if (modifierKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        if (this.projectState.project()) {
          event.preventDefault();
          event.stopPropagation();
          this.open();
        }
      }
    };

    document.addEventListener('keydown', this.keydownListener, true);
  }

  /**
   * Remove the global keyboard shortcut listener.
   * Should be called when the project is unloaded.
   */
  destroy(): void {
    if (this.keydownListener) {
      document.removeEventListener('keydown', this.keydownListener, true);
      this.keydownListener = null;
    }
  }

  /**
   * Open the project search dialog.
   */
  open(): void {
    if (this.isOpen()) return;

    this.isOpen.set(true);
    this.dialogRef = this.dialog.open(ProjectSearchDialogComponent, {
      width: '680px',
      maxWidth: '92vw',
      maxHeight: '85vh',
      panelClass: 'project-search-dialog',
      autoFocus: 'dialog',
      hasBackdrop: true,
    });

    this.dialogRef.afterClosed().subscribe(() => {
      this.isOpen.set(false);
      this.dialogRef = null;
    });
  }

  /**
   * Close the project search dialog.
   */
  close(): void {
    this.dialogRef?.close();
  }

  /**
   * Search all documents in the project for the given query string.
   *
   * When `query` is empty or below 2 characters the search operates in
   * "browse" mode — it returns all elements that match the active filters
   * without performing a text search (no document content is loaded).
   *
   * Scans documents sequentially to avoid overwhelming IndexedDB.
   * Yields progress updates via `onProgress` as each document is scanned.
   * Respects an AbortSignal for cancellation.
   *
   * @param query - Search term (empty string triggers browse mode)
   * @param onProgress - Callback receiving incremental progress updates
   * @param abortSignal - Signal to cancel the in-progress scan
   * @param filters - Optional filters to narrow results by tag, element type, relationship, or schema
   */
  async search(
    query: string,
    onProgress: (progress: ProjectSearchProgress) => void,
    abortSignal: AbortSignal,
    filters?: ProjectSearchFilters
  ): Promise<void> {
    const project = this.projectState.project();

    if (!project) {
      this.emitProgress(onProgress, 0, 0, [], true);
      return;
    }

    const elements = this.projectState.elements();
    const normalizedQuery = query.trim().toLowerCase();
    const elementMap = new Map(elements.map(el => [el.id, el]));
    const searchableElements = this.buildSearchableElements(elements, filters);

    // ─── Browse mode (no query or single character) ────────────────────
    // Return all matching elements without loading document content.
    if (normalizedQuery.length < 2) {
      this.emitProgress(
        onProgress,
        searchableElements.length,
        searchableElements.length,
        this.buildBrowseResults(project, searchableElements, elementMap),
        true
      );
      return;
    }

    // ─── Text search mode ────────────────────────────────────────────────
    this.emitProgress(onProgress, 0, searchableElements.length, [], false);

    const results = await this.searchDocuments(
      project,
      searchableElements,
      elementMap,
      normalizedQuery,
      onProgress,
      abortSignal
    );

    if (!abortSignal.aborted) {
      this.emitProgress(
        onProgress,
        searchableElements.length,
        searchableElements.length,
        results,
        true
      );
    }
  }

  private isMacPlatform(): boolean {
    if (typeof navigator === 'undefined') return false;
    // Prefer the modern User-Agent Client Hints API; fall back to the legacy
    // navigator.userAgent string that remains supported across browsers.
    const platform =
      (navigator as NavigatorWithUAData).userAgentData?.platform ??
      navigator.userAgent;
    return /Mac|iP(hone|[oa]d)/i.test(platform);
  }

  private buildSearchableElements(
    elements: Element[],
    filters?: ProjectSearchFilters
  ): Element[] {
    const relatedElementIds = this.getRelatedElementIds(filters);
    const taggedElementIds = this.getTaggedElementIds(filters);
    const schemaIdSet = this.getSchemaIdSet(filters);

    return elements.filter(element =>
      this.matchesFilters(
        element,
        filters,
        relatedElementIds,
        taggedElementIds,
        schemaIdSet
      )
    );
  }

  private getRelatedElementIds(
    filters?: ProjectSearchFilters
  ): Set<string> | undefined {
    if (!filters?.relatedToElementId) return undefined;

    const view = this.relationshipService.getRelationshipView(
      filters.relatedToElementId
    );

    return new Set([
      ...view.outgoing.map(r => r.targetElementId),
      ...view.incoming.map(r => r.sourceElementId),
    ]);
  }

  private getTaggedElementIds(
    filters?: ProjectSearchFilters
  ): Set<string> | undefined {
    if (!filters?.tagIds?.length) return undefined;

    const taggedElementIds = new Set<string>();
    for (const tagId of filters.tagIds) {
      for (const elementId of this.tagService.getElementsWithTag(tagId)) {
        taggedElementIds.add(elementId);
      }
    }

    return taggedElementIds;
  }

  private getSchemaIdSet(
    filters?: ProjectSearchFilters
  ): Set<string> | undefined {
    if (!filters?.schemaIds?.length) return undefined;
    return new Set(filters.schemaIds);
  }

  private matchesFilters(
    element: Element,
    filters: ProjectSearchFilters | undefined,
    relatedElementIds: Set<string> | undefined,
    taggedElementIds: Set<string> | undefined,
    schemaIdSet: Set<string> | undefined
  ): boolean {
    if (element.type === ElementType.Folder) return false;

    if (
      filters?.elementTypes?.length &&
      !filters.elementTypes.includes(element.type)
    ) {
      return false;
    }

    if (taggedElementIds && !taggedElementIds.has(element.id)) {
      return false;
    }

    if (relatedElementIds && !relatedElementIds.has(element.id)) {
      return false;
    }

    if (schemaIdSet) {
      return !!element.schemaId && schemaIdSet.has(element.schemaId);
    }

    return true;
  }

  private buildBrowseResults(
    project: Project,
    searchableElements: Element[],
    elementMap: Map<string, Element>
  ): ProjectSearchResult[] {
    return searchableElements.map(element => ({
      element,
      documentId: `${project.username}:${project.slug}:${element.id}`,
      matchCount: 0,
      snippets: [],
      path: this.buildPath(element, elementMap),
    }));
  }

  private async searchDocuments(
    project: Project,
    searchableElements: Element[],
    elementMap: Map<string, Element>,
    normalizedQuery: string,
    onProgress: (progress: ProjectSearchProgress) => void,
    abortSignal: AbortSignal
  ): Promise<ProjectSearchResult[]> {
    const results: ProjectSearchResult[] = [];
    let scanned = 0;

    for (const element of searchableElements) {
      if (abortSignal.aborted) return results;

      const result = await this.searchElementDocument(
        project,
        element,
        elementMap,
        normalizedQuery
      );
      if (result) {
        results.push(result);
      }

      scanned++;
      await this.yieldToUiThread();
      this.emitProgress(
        onProgress,
        scanned,
        searchableElements.length,
        [...results],
        false
      );
    }

    return results;
  }

  private extractContentNodes(content: unknown): unknown[] {
    if (Array.isArray(content)) {
      return content;
    }
    if (
      content !== null &&
      typeof content === 'object' &&
      'content' in content &&
      Array.isArray((content as { content?: unknown }).content)
    ) {
      return (content as { content: unknown[] }).content;
    }
    return [];
  }

  private async searchElementDocument(
    project: Project,
    element: Element,
    elementMap: Map<string, Element>,
    normalizedQuery: string
  ): Promise<ProjectSearchResult | null> {
    const documentId = `${project.username}:${project.slug}:${element.id}`;

    try {
      const content = await this.documentService.getDocumentContent(documentId);
      const nodes = this.extractContentNodes(content);
      const text = flattenToPlainText(nodes);
      const { matchCount, snippets } = this.collectSearchMatches(
        text,
        normalizedQuery
      );

      if (matchCount === 0) {
        return null;
      }

      return {
        element,
        documentId,
        matchCount,
        snippets,
        path: this.buildPath(element, elementMap),
      };
    } catch {
      return null;
    }
  }

  private collectSearchMatches(
    text: string,
    normalizedQuery: string
  ): { matchCount: number; snippets: SearchSnippet[] } {
    const textLower = text.toLowerCase();
    const snippets: SearchSnippet[] = [];
    let matchCount = 0;
    let searchFrom = 0;

    while (searchFrom < textLower.length) {
      const idx = textLower.indexOf(normalizedQuery, searchFrom);
      if (idx === -1) break;

      matchCount++;
      if (snippets.length < MAX_SNIPPETS) {
        snippets.push(this.buildSnippet(text, idx, normalizedQuery.length));
      }

      searchFrom = idx + normalizedQuery.length;
    }

    return { matchCount, snippets };
  }

  private buildSnippet(
    text: string,
    startIndex: number,
    queryLength: number
  ): SearchSnippet {
    const start = Math.max(0, startIndex - SNIPPET_CONTEXT);
    const end = Math.min(
      text.length,
      startIndex + queryLength + SNIPPET_CONTEXT
    );

    return {
      before: (start > 0 ? '…' : '') + text.slice(start, startIndex),
      match: text.slice(startIndex, startIndex + queryLength),
      after:
        text.slice(startIndex + queryLength, end) +
        (end < text.length ? '…' : ''),
    };
  }

  private emitProgress(
    onProgress: (progress: ProjectSearchProgress) => void,
    scanned: number,
    total: number,
    results: ProjectSearchResult[],
    done: boolean
  ): void {
    onProgress({ scanned, total, results, done });
  }

  private async yieldToUiThread(): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }

  /**
   * Build a breadcrumb path string for an element by walking its parent chain.
   */
  private buildPath(
    element: Element,
    elementMap: Map<string, Element>
  ): string {
    const parts: string[] = [];
    let current: Element | undefined = element;

    while (current?.parentId) {
      const parent = elementMap.get(current.parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      current = parent;
    }

    return parts.join(' › ');
  }
}
