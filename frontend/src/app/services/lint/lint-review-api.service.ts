import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal, type WritableSignal } from '@angular/core';
import {
  LINT_ERROR_MARK_NAME,
  type LintErrorMarkAttrs,
} from '@inkweld/prosemirror/schema';
import type { Node } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { firstValueFrom } from 'rxjs';

export interface LintSuggestion {
  id: string;
  message: string;
  suggestion: string;
  category: string;
  severity: 'error' | 'warning' | 'suggestion';
  paragraphStart: number;
  paragraphEnd: number;
  originalText: string;
}

export interface LintReviewResult {
  suggestions: LintSuggestion[];
  clearedMarks: number;
}

/**
 * Service for server-side lint review: triggers a review endpoint that
 * reads the Yjs doc, calls the LLM, and inserts `lint_error` marks that
 * sync to all clients. Also provides mark-scanning helpers for the
 * sidebar panel.
 */
@Injectable({
  providedIn: 'root',
})
export class LintReviewApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1/projects';

  /** Suggestions currently visible in the document (scanned from marks). */
  readonly activeSuggestions: WritableSignal<LintSuggestion[]> = signal([]);
  /** Whether a review is currently in progress. */
  readonly reviewing: WritableSignal<boolean> = signal(false);

  /**
   * Trigger a server-side lint review for the given document.
   * The server inserts marks into the Yjs doc; clients receive them
   * via the normal Yjs sync.
   */
  async reviewDocument(
    username: string,
    slug: string,
    docId: string,
    style = 'general',
    level: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<LintReviewResult> {
    this.reviewing.set(true);
    try {
      const url = `${this.baseUrl}/${username}/${slug}/docs/${docId}/lint/review`;
      return await firstValueFrom(
        this.http.post<LintReviewResult>(url, { style, level })
      );
    } finally {
      this.reviewing.set(false);
    }
  }

  /** Accept a suggestion (replace text + remove mark, server-side). */
  async acceptSuggestion(
    username: string,
    slug: string,
    docId: string,
    suggestionId: string,
    replacement: string
  ): Promise<boolean> {
    const url = `${this.baseUrl}/${username}/${slug}/docs/${docId}/lint/accept`;
    const result = await firstValueFrom(
      this.http.post<{ success: boolean }>(url, { suggestionId, replacement })
    );
    return result.success;
  }

  /** Reject a suggestion (remove mark, keep text, server-side). */
  async rejectSuggestion(
    username: string,
    slug: string,
    docId: string,
    suggestionId: string
  ): Promise<boolean> {
    const url = `${this.baseUrl}/${username}/${slug}/docs/${docId}/lint/reject`;
    const result = await firstValueFrom(
      this.http.post<{ success: boolean }>(url, { suggestionId })
    );
    return result.success;
  }

  /** Clear all lint marks from the document. */
  async clearAllMarks(
    username: string,
    slug: string,
    docId: string
  ): Promise<void> {
    const url = `${this.baseUrl}/${username}/${slug}/docs/${docId}/lint/clear`;
    await firstValueFrom(this.http.post<{ success: boolean }>(url, {}));
  }

  /**
   * Scan the editor document for `lint_error` marks and build a
   * list of suggestions for the sidebar.
   */
  scanDocumentMarks(view: EditorView): LintSuggestion[] {
    const state = view.state;
    const lintType = state.schema.marks[LINT_ERROR_MARK_NAME];
    if (!lintType) return [];

    const suggestions: LintSuggestion[] = [];
    const seen = new Set<string>();

    state.doc.descendants((node: Node, pos: number) => {
      for (const mark of node.marks) {
        if (mark.type === lintType) {
          const attrs = mark.attrs as LintErrorMarkAttrs;
          if (attrs.id && !seen.has(attrs.id)) {
            seen.add(attrs.id);
            suggestions.push({
              id: attrs.id,
              message: attrs.message,
              suggestion: attrs.suggestion,
              category: attrs.category,
              severity: attrs.severity,
              paragraphStart: pos,
              paragraphEnd: pos + node.nodeSize,
              originalText: node.textContent.slice(0, 100),
            });
          }
        }
      }
      return false;
    });

    return suggestions;
  }
}
