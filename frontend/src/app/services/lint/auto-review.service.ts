import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal, type WritableSignal } from '@angular/core';
import {
  type AutoReviewRequest,
  AutoReviewRequestLevel,
  AutoReviewService,
  type AutoReviewSuggestion,
  AutoReviewSuggestionSeverity,
} from '@inkweld/index';
import {
  AUTO_REVIEW_MARK_NAME,
  type AutoReviewMarkAttrs,
} from '@inkweld/prosemirror/schema';
import { SetupService } from '@services/core/setup.service';
import type { Node } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import { firstValueFrom } from 'rxjs';

export type { AutoReviewSuggestion };

export interface AutoReviewClickEvent {
  attrs: AutoReviewMarkAttrs;
  coords: { x: number; y: number };
}

/**
 * Service for server-side auto-review: triggers a review endpoint that
 * reads the Yjs doc, calls the LLM, and inserts `auto_review` marks that
 * sync to all clients. Also provides mark-scanning helpers for the
 * sidebar panel.
 */
@Injectable({
  providedIn: 'root',
})
export class AutoReviewApiService {
  private readonly autoReviewService = inject(AutoReviewService);
  private readonly http = inject(HttpClient);
  private readonly setupService = inject(SetupService);

  /** Build the full backend URL for the rejection endpoints. Uses
   *  SetupService.getServerUrl() — the same source as the generated API
   *  client's Configuration.basePath — so it works in server mode. */
  private get basePath(): string {
    return this.setupService.getServerUrl() ?? '';
  }

  /** Suggestions currently visible in the document (scanned from marks). */
  readonly activeSuggestions: WritableSignal<AutoReviewSuggestion[]> = signal(
    []
  );
  /** Whether a review is currently in progress. */
  readonly reviewing: WritableSignal<boolean> = signal(false);

  /** Click event from the ProseMirror plugin (click on highlighted text). */
  readonly clickEvent: WritableSignal<AutoReviewClickEvent | null> =
    signal(null);

  /** Bumped whenever the doc changes (editor update or review completion) so
   *  the panel's suggestions computed re-scans marks from the ProseMirror doc. */
  readonly docVersion: WritableSignal<number> = signal(0);

  /** Called by the editor on every doc update / Yjs sync so consumers re-scan. */
  tickDocVersion(): void {
    this.docVersion.update(v => v + 1);
  }

  /**
   * Trigger a server-side auto-review for the given document.
   * The server inserts marks into the Yjs doc; clients receive them
   * via the normal Yjs sync.
   */
  async reviewDocument(
    username: string,
    slug: string,
    docId: string,
    style = 'general',
    level: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<{ suggestions: AutoReviewSuggestion[]; clearedMarks: number }> {
    this.reviewing.set(true);
    try {
      const request: AutoReviewRequest = {
        style,
        level:
          level === 'low'
            ? AutoReviewRequestLevel.Low
            : level === 'high'
              ? AutoReviewRequestLevel.High
              : AutoReviewRequestLevel.Medium,
      };
      const result = await firstValueFrom(
        this.autoReviewService.reviewDocumentAutoReview(
          username,
          slug,
          docId,
          request
        )
      );
      return {
        suggestions: result.suggestions ?? [],
        clearedMarks: result.clearedMarks ?? 0,
      };
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
    const result = await firstValueFrom(
      this.autoReviewService.acceptAutoReviewSuggestion(username, slug, docId, {
        suggestionId,
        replacement,
      })
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
    const result = await firstValueFrom(
      this.autoReviewService.rejectAutoReviewSuggestion(username, slug, docId, {
        suggestionId,
      })
    );
    return result.success;
  }

  /** Clear all auto-review marks from the document. */
  async clearAllMarks(
    username: string,
    slug: string,
    docId: string
  ): Promise<void> {
    await firstValueFrom(
      this.autoReviewService.clearAutoReviewMarks(username, slug, docId)
    );
  }

  /** Get the count of rejected suggestions for a document. */
  async getRejectionCount(
    username: string,
    slug: string,
    docId: string
  ): Promise<number> {
    try {
      const base = this.basePath;
      const result = await firstValueFrom(
        this.http.get<{ count: number }>(
          `${base}/api/v1/projects/${username}/${slug}/docs/${docId}/auto-review/rejections`
        )
      );
      return result.count ?? 0;
    } catch (err) {
      console.warn('[AutoReview] Failed to load rejection count:', err);
      return 0;
    }
  }

  /** Delete all rejected suggestions for a document (reset). */
  async clearRejections(
    username: string,
    slug: string,
    docId: string
  ): Promise<boolean> {
    try {
      const base = this.basePath;
      await firstValueFrom(
        this.http.delete<{ success: boolean }>(
          `${base}/api/v1/projects/${username}/${slug}/docs/${docId}/auto-review/rejections`
        )
      );
      return true;
    } catch (err) {
      console.warn('[AutoReview] Failed to clear rejections:', err);
      return false;
    }
  }

  /**
   * Scan the editor document for `auto_review` marks and build a
   * list of suggestions for the sidebar.
   */
  scanDocumentMarks(view: EditorView): AutoReviewSuggestion[] {
    const state = view.state;
    const markType = state.schema.marks[AUTO_REVIEW_MARK_NAME];
    if (!markType) return [];

    const suggestions: AutoReviewSuggestion[] = [];
    const seen = new Set<string>();

    state.doc.descendants((node: Node, pos: number) => {
      for (const mark of node.marks) {
        if (mark.type === markType) {
          const attrs = mark.attrs as AutoReviewMarkAttrs;
          if (attrs.id && !seen.has(attrs.id)) {
            seen.add(attrs.id);
            suggestions.push({
              id: attrs.id,
              message: attrs.message,
              suggestion: attrs.suggestion,
              category: attrs.category,
              severity:
                attrs.severity === 'error'
                  ? AutoReviewSuggestionSeverity.Error
                  : attrs.severity === 'warning'
                    ? AutoReviewSuggestionSeverity.Warning
                    : AutoReviewSuggestionSeverity.Suggestion,
              paragraphStart: pos,
              paragraphEnd: pos + node.nodeSize,
              originalText: node.textContent.slice(0, 100),
            });
          }
        }
      }
      // Descend into all nodes so we visit inline text nodes that carry
      // the `auto_review` mark (marks live on text leaves inside
      // paragraphs, not on the block nodes themselves).
      return true;
    });

    return suggestions;
  }
}
