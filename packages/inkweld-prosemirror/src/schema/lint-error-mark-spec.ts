/**
 * Lint error mark specification.
 *
 * Inline mark for highlighting text ranges that have an AI-generated
 * grammar/style suggestion. The mark stores the suggestion metadata
 * (message, suggested replacement, category, stable id) directly in the
 * document so it syncs to all collaborators via Yjs and survives
 * reloads.
 *
 * Multiple lint error marks may overlap on the same text range
 * (`excludes: ''`), and the mark spans across inline content boundaries.
 */

import { type Mark, type MarkSpec } from 'prosemirror-model';

export interface LintErrorMarkAttrs {
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

export const LINT_ERROR_MARK_NAME = 'lint_error';

export const lintErrorMarkSpec: MarkSpec = {
  attrs: {
    id: { default: '' },
    message: { default: '' },
    suggestion: { default: '' },
    category: { default: 'grammar' },
    severity: { default: 'suggestion' },
  },

  // Allow multiple lint error marks to coexist on the same text.
  excludes: '',
  spanning: true,

  parseDOM: [
    {
      tag: 'span[data-lint-id]',
      getAttrs(dom: HTMLElement): LintErrorMarkAttrs {
        return {
          id: dom.dataset['lintId'] || '',
          message: dom.dataset['lintMessage'] || '',
          suggestion: dom.dataset['lintSuggestion'] || '',
          category: dom.dataset['lintCategory'] || 'grammar',
          severity:
            (dom.dataset['lintSeverity'] as LintErrorMarkAttrs['severity']) ||
            'suggestion',
        };
      },
    },
  ],

  toDOM(mark: Mark) {
    const attrs = mark.attrs as LintErrorMarkAttrs;
    const classes = [
      'lint-highlight',
      `lint-highlight--${attrs.severity}`,
    ]
      .filter(Boolean)
      .join(' ');

    const domAttrs: Record<string, string> = {
      class: classes,
      'data-lint-id': attrs.id || '',
      'data-lint-message': attrs.message || '',
      'data-lint-suggestion': attrs.suggestion || '',
      'data-lint-category': attrs.category || 'grammar',
      'data-lint-severity': attrs.severity || 'suggestion',
    };

    return ['span', domAttrs, 0];
  },
};