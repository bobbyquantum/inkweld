/**
 * Comment mark specification.
 *
 * Inline mark for highlighting text ranges that have an attached comment
 * thread. The mark stores a stable `commentId` plus cached metadata for
 * quick offline rendering; full thread data is fetched on demand.
 *
 * Multiple comment marks may overlap on the same text range
 * (`excludes: ''`), and the mark spans across inline content boundaries.
 */

import { type Mark, type MarkSpec } from 'prosemirror-model';

export interface CommentMarkAttrs {
  commentId: string;
  authorName: string;
  preview: string;
  messageCount: number;
  resolved: boolean;
  createdAt: number;
  /** True when the comment exists only locally (not yet sent to server). */
  localOnly: boolean;
  /** JSON-encoded messages array, used only in local-only mode. */
  messages: string | null;
}

export const COMMENT_MARK_NAME = 'comment';

export const commentMarkSpec: MarkSpec = {
  attrs: {
    commentId: { default: null },
    authorName: { default: '' },
    preview: { default: '' },
    messageCount: { default: 1 },
    resolved: { default: false },
    createdAt: { default: 0 },
    localOnly: { default: false },
    messages: { default: null },
  },

  // Allow multiple comment marks to coexist on the same text.
  excludes: '',
  spanning: true,

  parseDOM: [
    {
      tag: 'span[data-comment-id]',
      getAttrs(dom: HTMLElement): CommentMarkAttrs {
        // Guard numeric dataset parsing so malformed HTML attributes can't
        // leak NaN into mark attrs (and downstream UI/state).
        const parsedCount = Number(dom.dataset['commentCount'] ?? '1');
        const parsedCreatedAt = Number(dom.dataset['commentCreatedAt'] ?? '0');
        return {
          commentId: dom.dataset['commentId'] || '',
          authorName: dom.dataset['commentAuthor'] || '',
          preview: dom.dataset['commentPreview'] || '',
          messageCount: Number.isFinite(parsedCount) ? parsedCount : 1,
          resolved: dom.dataset['commentResolved'] === 'true',
          createdAt: Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : 0,
          localOnly: dom.dataset['commentLocalOnly'] === 'true',
          messages: dom.dataset['commentMessages'] || null,
        };
      },
    },
  ],

  toDOM(mark: Mark) {
    const attrs = mark.attrs as CommentMarkAttrs;
    const resolved = attrs.resolved;

    const classes = [
      'comment-highlight',
      resolved ? 'comment-highlight--resolved' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const domAttrs: Record<string, string> = {
      class: classes,
      'data-comment-id': attrs.commentId || '',
      'data-comment-author': attrs.authorName || '',
      'data-comment-preview': attrs.preview || '',
      'data-comment-count': String(attrs.messageCount || 1),
      'data-comment-created-at': String(attrs.createdAt || 0),
    };

    if (resolved) domAttrs['data-comment-resolved'] = 'true';
    if (attrs.localOnly) domAttrs['data-comment-local-only'] = 'true';
    if (attrs.messages) domAttrs['data-comment-messages'] = attrs.messages;

    return ['span', domAttrs, 0];
  },
};
