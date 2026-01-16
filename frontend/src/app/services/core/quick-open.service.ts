import { inject, Injectable, signal } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Element, ElementType } from '@inkweld/index';

import { QuickOpenDialogComponent } from '../../dialogs/quick-open-dialog/quick-open-dialog.component';
import { ProjectStateService } from '../project/project-state.service';
import { RecentFilesService } from '../project/recent-files.service';

/**
 * Result item from quick open search
 */
export interface QuickOpenResult {
  element: Element;
  /** Highlighted match positions in name */
  matchPositions: number[];
  /** Score for ranking (higher is better match) */
  score: number;
  /** Path breadcrumb (e.g., "Folder > Subfolder") */
  path: string;
  /** Whether this is from recent files */
  isRecent: boolean;
}

/**
 * Service for quick file open functionality (Cmd/Ctrl + P).
 *
 * Provides:
 * - Fuzzy search across project elements
 * - Recent files prioritization
 * - Keyboard shortcut registration
 * - Dialog management
 */
@Injectable({
  providedIn: 'root',
})
export class QuickOpenService {
  private readonly dialog = inject(MatDialog);
  private readonly projectState = inject(ProjectStateService);
  private readonly recentFilesService = inject(RecentFilesService);

  /** Whether the quick open dialog is currently open */
  readonly isOpen = signal(false);

  /** Current dialog reference */
  private dialogRef: MatDialogRef<QuickOpenDialogComponent> | null = null;

  /** Keyboard event listener */
  private keydownListener: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Initialize the global keyboard shortcut listener.
   * Should be called once during app initialization.
   */
  initialize(): void {
    if (this.keydownListener) {
      return; // Already initialized
    }

    this.keydownListener = (event: KeyboardEvent) => {
      // Check for Cmd/Ctrl + P
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;

      if (modifierKey && event.key.toLowerCase() === 'p') {
        // Only open if we have a project loaded
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
   */
  destroy(): void {
    if (this.keydownListener) {
      document.removeEventListener('keydown', this.keydownListener, true);
      this.keydownListener = null;
    }
  }

  /**
   * Open the quick open dialog.
   */
  open(): void {
    if (this.isOpen()) {
      return; // Already open
    }

    this.isOpen.set(true);
    this.dialogRef = this.dialog.open(QuickOpenDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      maxHeight: '80vh',
      panelClass: 'quick-open-dialog',
      autoFocus: 'dialog',
      hasBackdrop: true,
    });

    this.dialogRef.afterClosed().subscribe(() => {
      this.isOpen.set(false);
      this.dialogRef = null;
    });
  }

  /**
   * Close the quick open dialog.
   */
  close(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  /**
   * Search elements with fuzzy matching.
   *
   * @param query - Search query string
   * @returns Sorted array of matching results
   */
  search(query: string): QuickOpenResult[] {
    const elements = this.projectState.elements();
    const project = this.projectState.project();

    if (!elements.length || !project) {
      return [];
    }

    // Get recent files for this project
    const recentFiles = this.recentFilesService.getRecentFilesForProject(
      project.username,
      project.slug
    );
    const recentIds = new Set(recentFiles.map(f => f.id));

    // Build element map for path resolution
    const elementMap = new Map(elements.map(el => [el.id, el]));

    // If no query, return recent files
    if (!query.trim()) {
      return this.getRecentResults(elements, recentIds, elementMap);
    }

    const normalizedQuery = query.toLowerCase().trim();
    const results: QuickOpenResult[] = [];

    for (const element of elements) {
      // Only search openable elements (not folders unless they have no children)
      if (element.type === ElementType.Folder) {
        continue;
      }

      const matchResult = this.fuzzyMatch(element.name, normalizedQuery);
      if (matchResult) {
        results.push({
          element,
          matchPositions: matchResult.positions,
          score: matchResult.score + (recentIds.has(element.id) ? 100 : 0),
          path: this.getElementPath(element, elementMap),
          isRecent: recentIds.has(element.id),
        });
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Limit results
    return results.slice(0, 50);
  }

  /**
   * Get recent files as results (when no search query).
   */
  private getRecentResults(
    elements: Element[],
    recentIds: Set<string>,
    elementMap: Map<string, Element>
  ): QuickOpenResult[] {
    const project = this.projectState.project();
    if (!project) return [];

    const recentFiles = this.recentFilesService.getRecentFilesForProject(
      project.username,
      project.slug
    );

    const results: QuickOpenResult[] = [];

    // Add recent files first
    for (const recent of recentFiles) {
      const element = elementMap.get(recent.id);
      if (element) {
        results.push({
          element,
          matchPositions: [],
          score: 1000 - results.length, // Preserve recent order
          path: this.getElementPath(element, elementMap),
          isRecent: true,
        });
      }
    }

    // Add other non-folder elements if we have room
    if (results.length < 10) {
      const remaining = elements
        .filter(el => el.type !== ElementType.Folder && !recentIds.has(el.id))
        .slice(0, 10 - results.length);

      for (const element of remaining) {
        results.push({
          element,
          matchPositions: [],
          score: 0,
          path: this.getElementPath(element, elementMap),
          isRecent: false,
        });
      }
    }

    return results;
  }

  /**
   * Fuzzy match a query against a target string.
   *
   * Uses a simple fuzzy matching algorithm that:
   * - Matches characters in order (but not necessarily consecutive)
   * - Prefers matches at word boundaries
   * - Prefers consecutive matches
   * - Prefers matches at the start of the string
   *
   * @param target - String to match against
   * @param query - Search query
   * @returns Match result with positions and score, or null if no match
   */
  private fuzzyMatch(
    target: string,
    query: string
  ): { positions: number[]; score: number } | null {
    const targetLower = target.toLowerCase();
    const positions: number[] = [];
    let score = 0;
    let targetIndex = 0;
    let prevMatchIndex = -1;

    for (let queryIndex = 0; queryIndex < query.length; queryIndex++) {
      const queryChar = query[queryIndex];
      let found = false;

      while (targetIndex < targetLower.length) {
        if (targetLower[targetIndex] === queryChar) {
          positions.push(targetIndex);

          // Score bonuses
          if (targetIndex === 0) {
            score += 10; // Start of string
          } else if (
            target[targetIndex - 1] === ' ' ||
            target[targetIndex - 1] === '/' ||
            target[targetIndex - 1] === '_' ||
            target[targetIndex - 1] === '-'
          ) {
            score += 8; // Word boundary
          }

          if (prevMatchIndex !== -1 && targetIndex === prevMatchIndex + 1) {
            score += 5; // Consecutive match
          }

          // Prefer matches closer to start
          score += Math.max(0, 10 - targetIndex);

          prevMatchIndex = targetIndex;
          targetIndex++;
          found = true;
          break;
        }
        targetIndex++;
      }

      if (!found) {
        return null; // Query character not found
      }
    }

    // Bonus for exact matches
    if (targetLower === query) {
      score += 100;
    } else if (targetLower.startsWith(query)) {
      score += 50;
    }

    return { positions, score };
  }

  /**
   * Get the path breadcrumb for an element.
   *
   * @param element - Element to get path for
   * @param elementMap - Map of all elements by ID
   * @returns Path string like "Folder > Subfolder"
   */
  private getElementPath(
    element: Element,
    elementMap: Map<string, Element>
  ): string {
    const pathParts: string[] = [];
    let current: Element | undefined = element;

    // Walk up the tree to build path
    while (current?.parentId) {
      const parent = elementMap.get(current.parentId);
      if (parent) {
        pathParts.unshift(parent.name);
        current = parent;
      } else {
        break;
      }
    }

    return pathParts.join(' › ');
  }
}
