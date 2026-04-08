/**
 * Comment Mark Schema Extension
 *
 * Defines a ProseMirror mark type for inline comment highlighting.
 * The mark stores a commentId (UUID matching the server-side thread)
 * and cached metadata for quick rendering without fetching.
 */

import { type MarkSpec } from 'prosemirror-model';

export interface CommentMarkAttrs {
  commentId: string;
  authorName: string;
  preview: string;
  messageCount: number;
  resolved: boolean;
  createdAt: number;
  /** True when the comment exists only locally (no server backing) */
  localOnly: boolean;
  /** JSON-encoded messages array, used only in local-only mode */
  messages: string | null;
}

/**
 * ProseMirror mark specification for comment highlights.
 *
 * Marks are applied to text ranges and travel with the text via Yjs CRDT.
 * Thread data is fetched on demand from the server; only the commentId
 * is strictly required. The other attrs are cached for offline/quick preview.
 */
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

  // Allow multiple comment marks to coexist on the same text
  excludes: '',

  // Include in the inline group so it can wrap any inline content
  spanning: true,

  parseDOM: [
    {
      tag: 'span[data-comment-id]',
      getAttrs(dom: HTMLElement): CommentMarkAttrs {
        return {
          commentId: dom.dataset['commentId'] || '',
          authorName: dom.dataset['commentAuthor'] || '',
          preview: dom.dataset['commentPreview'] || '',
          messageCount: Number(dom.dataset['commentCount'] || '1'),
          resolved: dom.dataset['commentResolved'] === 'true',
          createdAt: Number(dom.dataset['commentCreatedAt'] || '0'),
          localOnly: dom.dataset['commentLocalOnly'] === 'true',
          messages: dom.dataset['commentMessages'] || null,
        };
      },
    },
  ],

  toDOM(mark) {
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

    if (resolved) {
      domAttrs['data-comment-resolved'] = 'true';
    }
    if (attrs.localOnly) {
      domAttrs['data-comment-local-only'] = 'true';
    }
    if (attrs.messages) {
      domAttrs['data-comment-messages'] = attrs.messages;
    }

    return ['span', domAttrs, 0];
  },
};
