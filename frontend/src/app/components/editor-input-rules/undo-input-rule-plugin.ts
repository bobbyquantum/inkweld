import { undoInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { type Plugin } from 'prosemirror-state';

/**
 * Backspace straight after a Markdown input rule fires ("# ", "> ", "- ",
 * "1. ", "**bold**" …) reverts the conversion and leaves the typed characters
 * in place, the way Notion/Obsidian/Google Docs behave.
 *
 * ngx-editor registers the input rules themselves but not this binding, and its
 * own `baseKeymap` Backspace would otherwise win (joining the heading into the
 * previous block instead). So this plugin must sit *before* ngx-editor's
 * default plugins in the state's plugin list. `undoInputRule` returns false
 * when the last transaction was not an input rule, so ordinary Backspace is
 * unaffected.
 */
export function createUndoInputRulePlugin(): Plugin {
  return keymap({ Backspace: undoInputRule });
}
