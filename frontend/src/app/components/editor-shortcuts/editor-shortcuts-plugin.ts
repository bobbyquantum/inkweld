/**
 * Editor Keyboard Shortcuts Plugin
 *
 * Provides keyboard shortcuts for common formatting operations in the ProseMirror editor.
 * These shortcuts match standard word processor conventions (Ctrl/Cmd + key combinations).
 */
import { toggleMark } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import type { NodeType, Schema } from 'prosemirror-model';
import { liftListItem, wrapInList } from 'prosemirror-schema-list';
import { Command, Plugin } from 'prosemirror-state';

/**
 * Configuration options for the keyboard shortcuts plugin
 */
export interface KeyboardShortcutsOptions {
  /**
   * Callback to execute when insert link shortcut is triggered (Ctrl/Cmd + K)
   * If not provided, the shortcut will be disabled
   */
  onInsertLink?: () => void;

  /**
   * Callback to execute when find shortcut is triggered (Ctrl/Cmd + F)
   * If not provided, the shortcut will be disabled and browser default will apply
   */
  onOpenFind?: () => void;

  /**
   * Callback to execute when insert image shortcut is triggered (Ctrl/Cmd + Shift + I)
   * If not provided, the shortcut will be disabled
   */
  onInsertImage?: () => void;
}

/**
 * Creates a command that sets a block type to a heading with the specified level
 * Note: This function is tested at integration level in e2e tests
 */
/* c8 ignore next -- @preserve */
function setHeading(schema: Schema, level: number): Command {
  return (state, dispatch) => {
    const headingType = schema.nodes['heading'];
    if (!headingType) return false;

    const { selection } = state;
    const { $from, $to } = selection;

    // Check if we can apply heading to the selection
    if (
      !$from.parent.type.spec.content?.includes('inline') &&
      $from.parent.type !== headingType
    ) {
      return false;
    }

    if (dispatch) {
      const tr = state.tr.setBlockType($from.pos, $to.pos, headingType, {
        level,
      });
      dispatch(tr);
    }
    return true;
  };
}

/**
 * Creates a command that sets a block type to paragraph (removes heading)
 * Note: This function is tested at integration level in e2e tests
 */
/* c8 ignore next -- @preserve */
function setParagraph(schema: Schema): Command {
  return (state, dispatch) => {
    const paragraphType = schema.nodes['paragraph'];
    if (!paragraphType) return false;

    const { selection } = state;
    const { $from, $to } = selection;

    if (dispatch) {
      const tr = state.tr.setBlockType($from.pos, $to.pos, paragraphType);
      dispatch(tr);
    }
    return true;
  };
}

/**
 * Creates a command that wraps the selection in a blockquote
 * Note: This function is tested at integration level in e2e tests
 */
/* c8 ignore next -- @preserve */
function toggleBlockquote(schema: Schema): Command {
  return (state, dispatch) => {
    const blockquoteType = schema.nodes['blockquote'];
    if (!blockquoteType) return false;

    const { selection } = state;
    const { $from } = selection;

    // Check if we're already in a blockquote
    for (let depth = $from.depth; depth >= 0; depth--) {
      if ($from.node(depth).type === blockquoteType) {
        // Lift out of blockquote
        if (dispatch) {
          const range = $from.blockRange();
          if (range) {
            const tr = state.tr.lift(range, depth - 1);
            dispatch(tr);
          }
        }
        return true;
      }
    }

    // Wrap in blockquote
    if (dispatch) {
      const { tr } = state;
      const range = $from.blockRange();
      if (range) {
        tr.wrap(range, [{ type: blockquoteType }]);
        dispatch(tr);
      }
    }
    return true;
  };
}

/**
 * Creates a command that inserts a horizontal rule
 * Note: This function is tested at integration level in e2e tests
 */
/* c8 ignore next -- @preserve */
function insertHorizontalRule(schema: Schema): Command {
  return (state, dispatch) => {
    const hrType = schema.nodes['horizontal_rule'];
    if (!hrType) return false;

    if (dispatch) {
      const { tr } = state;
      tr.replaceSelectionWith(hrType.create());
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

/**
 * Creates a command that clears all formatting marks from the selection
 * Note: This function is tested at integration level in e2e tests
 */
/* c8 ignore next -- @preserve */
function clearFormatting(schema: Schema): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;

    if (dispatch) {
      const tr = state.tr;

      // Remove all marks in the selection
      for (const mark of Object.values(schema.marks)) {
        tr.removeMark(from, to, mark);
      }

      dispatch(tr);
    }
    return true;
  };
}

/**
 * Creates a toggle mark command with safety check
 * Note: This function is tested at integration level in e2e tests
 */
/* c8 ignore next -- @preserve */
function safeToggleMark(schema: Schema, markName: string): Command {
  return (state, dispatch, view) => {
    const markType = schema.marks[markName];
    if (!markType) return false;
    return toggleMark(markType)(state, dispatch, view);
  };
}

/**
 * Creates a command that toggles a list type (wraps in list or lifts out)
 * Note: This function is tested at integration level in e2e tests
 */
/* c8 ignore next -- @preserve */
function toggleList(listType: NodeType, listItemType: NodeType): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;

    // Check if we're already in this specific list type
    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth);
      if (node.type === listType) {
        // We're in this list type, lift out
        return liftListItem(listItemType)(state, dispatch);
      }
    }

    // Not in this list type, wrap in list
    return wrapInList(listType)(state, dispatch);
  };
}

/**
 * Creates the keyboard shortcuts plugin for the ProseMirror editor.
 *
 * Supported shortcuts:
 * - Mod-b: Toggle bold
 * - Mod-i: Toggle italic
 * - Mod-u: Toggle underline
 * - Mod-Shift-x: Toggle strikethrough
 * - Mod-e: Toggle inline code
 * - Mod-k: Insert link (calls onInsertLink callback)
 * - Mod-1 through Mod-6: Set heading levels 1-6
 * - Mod-0: Set paragraph (remove heading)
 * - Mod-Shift-7: Toggle bullet list
 * - Mod-Shift-8: Toggle numbered list
 * - Mod-Shift-9: Toggle blockquote
 * - Mod-Shift-h: Insert horizontal rule
 * - Mod-\\: Clear formatting
 *
 * Note: "Mod" is Cmd on Mac and Ctrl on Windows/Linux
 *
 * @param schema The ProseMirror schema
 * @param options Configuration options
 * @returns A ProseMirror plugin with keyboard shortcuts
 */
export function createKeyboardShortcutsPlugin(
  schema: Schema,
  options: KeyboardShortcutsOptions = {}
): Plugin {
  const keyBindings: Record<string, Command> = {
    // Text formatting
    'Mod-b': safeToggleMark(schema, 'strong'),
    'Mod-i': safeToggleMark(schema, 'em'),
    'Mod-u': safeToggleMark(schema, 'u'),
    'Mod-Shift-x': safeToggleMark(schema, 's'),
    'Mod-e': safeToggleMark(schema, 'code'),

    // Headings (Mod-1 through Mod-6)
    'Mod-1': setHeading(schema, 1),
    'Mod-2': setHeading(schema, 2),
    'Mod-3': setHeading(schema, 3),
    'Mod-4': setHeading(schema, 4),
    'Mod-5': setHeading(schema, 5),
    'Mod-6': setHeading(schema, 6),
    'Mod-0': setParagraph(schema),

    // Lists and blocks
    'Mod-Shift-7': (state, dispatch) => {
      const listType = schema.nodes['bullet_list'];
      const listItemType = schema.nodes['list_item'];
      if (!listType || !listItemType) return false;
      return toggleList(listType, listItemType)(state, dispatch);
    },
    'Mod-Shift-8': (state, dispatch) => {
      const listType = schema.nodes['ordered_list'];
      const listItemType = schema.nodes['list_item'];
      if (!listType || !listItemType) return false;
      return toggleList(listType, listItemType)(state, dispatch);
    },
    'Mod-Shift-9': toggleBlockquote(schema),

    // Other formatting
    'Mod-Shift-h': insertHorizontalRule(schema),
    'Mod-\\': clearFormatting(schema),
  };

  // Add link shortcut if callback provided
  if (options.onInsertLink) {
    const callback = options.onInsertLink;
    keyBindings['Mod-k'] = () => {
      callback();
      return true;
    };
  }

  // Add find shortcut if callback provided
  if (options.onOpenFind) {
    const callback = options.onOpenFind;
    keyBindings['Mod-f'] = () => {
      callback();
      return true;
    };
  }

  // Add insert image shortcut if callback provided
  if (options.onInsertImage) {
    const callback = options.onInsertImage;
    keyBindings['Mod-Shift-i'] = () => {
      callback();
      return true;
    };
  }

  return keymap(keyBindings);
}

/**
 * List of all keyboard shortcuts for documentation/help display
 */
export const KEYBOARD_SHORTCUTS_LIST = [
  { keys: 'Ctrl/Cmd + B', action: 'Bold' },
  { keys: 'Ctrl/Cmd + I', action: 'Italic' },
  { keys: 'Ctrl/Cmd + U', action: 'Underline' },
  { keys: 'Ctrl/Cmd + Shift + X', action: 'Strikethrough' },
  { keys: 'Ctrl/Cmd + E', action: 'Inline code' },
  { keys: 'Ctrl/Cmd + K', action: 'Insert link' },
  { keys: 'Ctrl/Cmd + F', action: 'Find in document' },
  { keys: 'Ctrl/Cmd + Shift + I', action: 'Insert image' },
  { keys: 'Ctrl/Cmd + 1-6', action: 'Heading levels 1-6' },
  { keys: 'Ctrl/Cmd + 0', action: 'Paragraph (remove heading)' },
  { keys: 'Ctrl/Cmd + Shift + 7', action: 'Bullet list' },
  { keys: 'Ctrl/Cmd + Shift + 8', action: 'Numbered list' },
  { keys: 'Ctrl/Cmd + Shift + 9', action: 'Blockquote' },
  { keys: 'Ctrl/Cmd + Shift + H', action: 'Horizontal rule' },
  { keys: 'Ctrl/Cmd + \\', action: 'Clear formatting' },
] as const;
