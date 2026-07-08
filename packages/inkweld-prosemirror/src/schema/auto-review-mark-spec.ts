/**
 * Auto-Review mark specification.
 *
 * Inline mark for highlighting text ranges that have an AI-generated
 * grammar/style suggestion. The mark stores the suggestion metadata
 * (message, suggested replacement, category, stable id) directly in the
 * document so it syncs to all collaborators via Yjs and survives
 * reloads.
 *
 * Multiple auto-review marks may overlap on the same text range
 * (`excludes: ''`), and the mark spans across inline content boundaries.
 */

import { type Mark, type MarkSpec } from 'prosemirror-model';

export interface AutoReviewMarkAttrs {
  /** Stable unique id for this suggestion (used by the sidebar + accept/reject). */
  id: string;
  /** Human-readable description of the issue. */
  message: string;
  /** Suggested replacement text (empty string means "delete this"). */
  suggestion: string;
  /** Category: grammar, spelling, style, clarity, etc. */
  category: string;
  /** Severity: error, warning, suggestion. */
  severity: 'error' | 'warning' | 'suggestion';
}

export const AUTO_REVIEW_MARK_NAME = 'auto_review';

export const autoReviewMarkSpec: MarkSpec = {
  attrs: {
    id: { default: '' },
    message: { default: '' },
    suggestion: { default: '' },
    category: { default: 'grammar' },
    severity: { default: 'suggestion' },
  },

  // Allow multiple auto-review marks to coexist on the same text.
  excludes: '',
  spanning: true,

  parseDOM: [
    {
      tag: 'span[data-auto-review-id]',
      getAttrs(dom: HTMLElement): AutoReviewMarkAttrs {
        return {
          id: dom.dataset['autoReviewId'] || '',
          message: dom.dataset['autoReviewMessage'] || '',
          suggestion: dom.dataset['autoReviewSuggestion'] || '',
          category: dom.dataset['autoReviewCategory'] || 'grammar',
          severity:
            (dom.dataset['autoReviewSeverity'] as AutoReviewMarkAttrs['severity']) ||
            'suggestion',
        };
      },
    },
  ],

  toDOM(mark: Mark) {
    const attrs = mark.attrs as AutoReviewMarkAttrs;
    const classes = [
      'auto-review-highlight',
      `auto-review-highlight--${attrs.severity}`,
    ]
      .filter(Boolean)
      .join(' ');

    const domAttrs: Record<string, string> = {
      class: classes,
      'data-auto-review-id': attrs.id || '',
      'data-auto-review-message': attrs.message || '',
      'data-auto-review-suggestion': attrs.suggestion || '',
      'data-auto-review-category': attrs.category || 'grammar',
      'data-auto-review-severity': attrs.severity || 'suggestion',
    };

    return ['span', domAttrs, 0];
  },
};