import { inject, Injectable, signal } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Element, ElementType } from '@inkweld/index';

import { ProjectSearchDialogComponent } from '../../dialogs/project-search-dialog/project-search-dialog.component';
import { flattenToPlainText } from '../../utils/prosemirror-text';
import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';

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
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
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
   * Scans documents sequentially to avoid overwhelming IndexedDB.
   * Yields progress updates via `onProgress` as each document is scanned.
   * Respects an AbortSignal for cancellation.
   *
   * @param query - Search term (minimum 2 characters)
   * @param onProgress - Callback receiving incremental progress updates
   * @param abortSignal - Signal to cancel the in-progress scan
   */
  async search(
    query: string,
    onProgress: (progress: ProjectSearchProgress) => void,
    abortSignal: AbortSignal
  ): Promise<void> {
    const project = this.projectState.project();
    const elements = this.projectState.elements();
    const trimmed = query.trim();

    if (!project || trimmed.length < 2) {
      onProgress({ scanned: 0, total: 0, results: [], done: true });
      return;
    }

    const normalizedQuery = trimmed.toLowerCase();
    const searchableElements = elements.filter(
      el => el.type !== ElementType.Folder
    );
    const elementMap = new Map(elements.map(el => [el.id, el]));
    const results: ProjectSearchResult[] = [];
    let scanned = 0;

    onProgress({
      scanned: 0,
      total: searchableElements.length,
      results: [],
      done: false,
    });

    for (const element of searchableElements) {
      if (abortSignal.aborted) return;

      const documentId = `${project.username}:${project.slug}:${element.id}`;

      try {
        const content =
          await this.documentService.getDocumentContent(documentId);
        const nodes = Array.isArray(content) ? content : [];
        const text = flattenToPlainText(nodes);
        const textLower = text.toLowerCase();

        const snippets: SearchSnippet[] = [];
        let matchCount = 0;
        let searchFrom = 0;

        while (searchFrom < textLower.length) {
          const idx = textLower.indexOf(normalizedQuery, searchFrom);
          if (idx === -1) break;

          matchCount++;

          if (snippets.length < MAX_SNIPPETS) {
            const start = Math.max(0, idx - SNIPPET_CONTEXT);
            const end = Math.min(
              text.length,
              idx + normalizedQuery.length + SNIPPET_CONTEXT
            );
            snippets.push({
              before: (start > 0 ? '…' : '') + text.slice(start, idx),
              match: text.slice(idx, idx + normalizedQuery.length),
              after:
                text.slice(idx + normalizedQuery.length, end) +
                (end < text.length ? '…' : ''),
            });
          }

          searchFrom = idx + normalizedQuery.length;
        }

        if (matchCount > 0) {
          results.push({
            element,
            documentId,
            matchCount,
            snippets,
            path: this.buildPath(element, elementMap),
          });
        }
      } catch {
        // Skip documents that can't be read (empty, corrupt, etc.)
      }

      scanned++;

      // Yield to the UI thread between documents to keep the interface responsive
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      onProgress({
        scanned,
        total: searchableElements.length,
        results: [...results],
        done: false,
      });
    }

    if (!abortSignal.aborted) {
      onProgress({
        scanned,
        total: searchableElements.length,
        results,
        done: true,
      });
    }
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
