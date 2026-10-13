/**
 * Per-document conversation mode, held in the conversation plugin's state.
 * Kept apart from the plugin so the plugin's views can read it without an
 * import cycle.
 */
import { type EditorState, PluginKey } from 'prosemirror-state';
import { type DecorationSet, type EditorView } from 'prosemirror-view';

export interface ConversationPluginState {
  enabled: boolean;
  decorations: DecorationSet;
}

export const conversationPluginKey = new PluginKey<ConversationPluginState>(
  'conversation'
);

export function isConversationMode(state: EditorState): boolean {
  return conversationPluginKey.getState(state)?.enabled ?? false;
}

/** Turn conversation behaviour on or off for the document in `view`. */
export function setConversationMode(view: EditorView, enabled: boolean): void {
  if (isConversationMode(view.state) === enabled) return;
  view.dispatch(
    view.state.tr
      .setMeta(conversationPluginKey, { enabled })
      .setMeta('addToHistory', false)
  );
}
