/**
 * Comment Plugin for ProseMirror
 *
 * Handles:
 * - Click detection on comment-highlighted text
 * - Emitting events when a comment mark is clicked
 * - Providing the active comment ID for the UI layer
 */

import { Plugin, PluginKey } from 'prosemirror-state';
import { type EditorView } from 'prosemirror-view';

import { type CommentMarkAttrs } from './comment-mark-schema';

// ─────────────────────────────────────────────────────────────────────────────
// Plugin State
// ─────────────────────────────────────────────────────────────────────────────

export interface CommentPluginState {
  /** The commentId of the currently focused/clicked comment, or null */
  activeCommentId: string | null;
}

export const commentPluginKey = new PluginKey<CommentPluginState>('comment');

// ─────────────────────────────────────────────────────────────────────────────
// Event Callbacks
// ─────────────────────────────────────────────────────────────────────────────

export interface CommentPluginCallbacks {
  /** Called when user clicks on a comment-highlighted range */
  onCommentClick?: (
    attrs: CommentMarkAttrs,
    coords: { x: number; y: number }
  ) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createCommentPlugin(
  callbacks: CommentPluginCallbacks = {}
): Plugin<CommentPluginState> {
  return new Plugin<CommentPluginState>({
    key: commentPluginKey,

    state: {
      init(): CommentPluginState {
        return { activeCommentId: null };
      },
      apply(tr, value): CommentPluginState {
        const meta = tr.getMeta(commentPluginKey) as
          | Partial<CommentPluginState>
          | undefined;
        if (meta !== undefined) {
          return { ...value, ...meta };
        }
        return value;
      },
    },

    props: {
      handleClick(view: EditorView, pos: number, event: MouseEvent): boolean {
        const { state } = view;
        const $pos = state.doc.resolve(pos);
        const commentType = state.schema.marks['comment'];
        if (!commentType) return false;

        // Check if the clicked position has a comment mark
        const marks = $pos.marks();
        const commentMark = marks.find(m => m.type === commentType);

        if (commentMark) {
          const attrs = commentMark.attrs as CommentMarkAttrs;
          if (attrs.commentId) {
            // Set active comment
            const tr = state.tr.setMeta(commentPluginKey, {
              activeCommentId: attrs.commentId,
            });
            view.dispatch(tr);

            // Emit click event
            callbacks.onCommentClick?.(attrs, {
              x: event.clientX,
              y: event.clientY,
            });
            return true;
          }
        } else {
          // Clicked outside any comment — deactivate
          const current = commentPluginKey.getState(state);
          if (current?.activeCommentId) {
            const tr = state.tr.setMeta(commentPluginKey, {
              activeCommentId: null,
            });
            view.dispatch(tr);
          }
        }

        return false;
      },
    },
  });
}
