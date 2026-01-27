import { inject, Injectable, signal } from '@angular/core';
import { Editor } from '@bobbyquantum/ngx-editor';

import {
  dispatchClose,
  dispatchNextMatch,
  dispatchPreviousMatch,
  dispatchSearch,
  dispatchToggleCaseSensitive,
  findPluginKey,
  FindPluginState,
  getFindState,
} from '../../components/find-in-document/find-plugin';
import { LoggerService } from '../core/logger.service';

/**
 * Service for managing "Find in Document" functionality.
 *
 * Handles:
 * - Opening/closing the find UI
 * - Coordinating between the UI component and ProseMirror plugin
 * - Keyboard shortcut state
 *
 * Designed for future extension to support "Replace" functionality.
 */
@Injectable({
  providedIn: 'root',
})
export class FindInDocumentService {
  private readonly logger = inject(LoggerService);

  /** Whether the find bar is currently visible */
  readonly isOpen = signal(false);

  /** Current search query */
  readonly query = signal('');

  /** Whether case sensitivity is enabled */
  readonly caseSensitive = signal(false);

  /** Total number of matches */
  readonly matchCount = signal(0);

  /** Current match index (1-based for display, 0 if no matches) */
  readonly currentMatchNumber = signal(0);

  /** Reference to the current editor */
  private currentEditor: Editor | null = null;

  /**
   * Register the editor instance for find operations.
   * Called when a document is opened.
   */
  setEditor(editor: Editor | null): void {
    this.currentEditor = editor;

    // Clear state when editor changes
    if (!editor) {
      this.close();
    }
  }

  /**
   * Open the find bar and focus the search input.
   */
  open(): void {
    if (!this.currentEditor?.view) {
      this.logger.warn(
        'FindInDocumentService',
        'Cannot open find - no editor available'
      );
      return;
    }

    this.isOpen.set(true);
    this.logger.debug('FindInDocumentService', 'Find bar opened');
  }

  /**
   * Close the find bar and clear highlights.
   */
  close(): void {
    if (this.currentEditor?.view) {
      dispatchClose(this.currentEditor.view);
    }

    this.isOpen.set(false);
    this.query.set('');
    this.matchCount.set(0);
    this.currentMatchNumber.set(0);
    this.logger.debug('FindInDocumentService', 'Find bar closed');
  }

  /**
   * Perform a search with the given query.
   */
  search(searchQuery: string): void {
    this.query.set(searchQuery);

    if (!this.currentEditor?.view) {
      return;
    }

    dispatchSearch(this.currentEditor.view, searchQuery);
    this.updateMatchInfo();
  }

  /**
   * Navigate to the next match.
   */
  nextMatch(): void {
    if (!this.currentEditor?.view) {
      return;
    }

    dispatchNextMatch(this.currentEditor.view);
    this.updateMatchInfo();
  }

  /**
   * Navigate to the previous match.
   */
  previousMatch(): void {
    if (!this.currentEditor?.view) {
      return;
    }

    dispatchPreviousMatch(this.currentEditor.view);
    this.updateMatchInfo();
  }

  /**
   * Toggle case sensitivity.
   */
  toggleCaseSensitive(): void {
    const newValue = !this.caseSensitive();
    this.caseSensitive.set(newValue);

    if (!this.currentEditor?.view) {
      return;
    }

    dispatchToggleCaseSensitive(this.currentEditor.view, newValue);
    this.updateMatchInfo();
  }

  /**
   * Update match count and current match number from plugin state.
   */
  private updateMatchInfo(): void {
    if (!this.currentEditor?.view) {
      this.matchCount.set(0);
      this.currentMatchNumber.set(0);
      return;
    }

    const state = getFindState(this.currentEditor.view);
    if (state) {
      this.matchCount.set(state.matches.length);
      this.currentMatchNumber.set(
        state.matches.length > 0 ? state.currentMatchIndex + 1 : 0
      );
    }
  }

  /**
   * Get the current plugin state (for testing/debugging).
   */
  getPluginState(): FindPluginState | undefined {
    if (!this.currentEditor?.view) {
      return undefined;
    }
    return findPluginKey.getState(this.currentEditor.view.state);
  }
}
