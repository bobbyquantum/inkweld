/**
 * Auto-Review Plugin for ProseMirror
 *
 * Handles click detection on auto-review-highlighted text and emits events
 * so the editor component can show an accept/reject popover.
 */

import {
  AUTO_REVIEW_MARK_NAME,
  type AutoReviewMarkAttrs,
} from '@inkweld/prosemirror/schema';
import { Plugin, PluginKey } from 'prosemirror-state';
import { type EditorView } from 'prosemirror-view';

export interface AutoReviewPluginState {
  activeSuggestionId: string | null;
}

export const autoReviewPluginKey = new PluginKey<AutoReviewPluginState>(
  'autoReview'
);

export interface AutoReviewPluginCallbacks {
  onSuggestionClick?: (
    attrs: AutoReviewMarkAttrs,
    coords: { x: number; y: number }
  ) => void;
}

export function createAutoReviewPlugin(
  callbacks: AutoReviewPluginCallbacks = {}
): Plugin<AutoReviewPluginState> {
  return new Plugin<AutoReviewPluginState>({
    key: autoReviewPluginKey,

    state: {
      init(): AutoReviewPluginState {
        return { activeSuggestionId: null };
      },
      apply(tr, value): AutoReviewPluginState {
        const meta = tr.getMeta(autoReviewPluginKey) as
          | Partial<AutoReviewPluginState>
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
        const markType = state.schema.marks[AUTO_REVIEW_MARK_NAME];
        if (!markType) return false;

        const marks = $pos.marks();
        const reviewMark = marks.find(m => m.type === markType);

        if (reviewMark) {
          const attrs = reviewMark.attrs as AutoReviewMarkAttrs;
          if (attrs.id) {
            view.dispatch(
              state.tr.setMeta(autoReviewPluginKey, {
                activeSuggestionId: attrs.id,
              })
            );
            callbacks.onSuggestionClick?.(attrs, {
              x: event.clientX,
              y: event.clientY,
            });
            return true;
          }
        } else {
          const current = autoReviewPluginKey.getState(state);
          if (current?.activeSuggestionId) {
            view.dispatch(
              state.tr.setMeta(autoReviewPluginKey, {
                activeSuggestionId: null,
              })
            );
          }
        }

        return false;
      },
    },
  });
}
