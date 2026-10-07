import {
  ellipsis,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { type Command } from 'prosemirror-state';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ySyncPlugin, yUndoPlugin } from 'y-prosemirror';
import * as Y from 'yjs';

import { extendedSchema } from '../element-ref/extended-schema';
import { createUndoInputRulePlugin } from './undo-input-rule-plugin';

/**
 * ngx-editor (which registers the real rules) is mocked globally in specs, so
 * these rules mirror its `buildInputRules` using the app's real schema.
 */
const { heading, blockquote, bullet_list, ordered_list } = extendedSchema.nodes;
const rules = inputRules({
  rules: [
    ...[ellipsis],
    wrappingInputRule(/^\s*>\s$/, blockquote),
    wrappingInputRule(/^\s*(?:[-+*])\s$/, bullet_list),
    wrappingInputRule(/^(?:\d+)\.\s$/, ordered_list, m => ({
      order: Number(m[1]),
    })),
    textblockTypeInputRule(/^(#{1,6})\s$/, heading, m => ({
      level: m[1].length,
    })),
  ],
});

// prosemirror-commands is mocked globally in specs; ngx-editor's real Backspace
// handling comes from the actual baseKeymap, which the plugin must beat.
let baseKeymap: Record<string, Command>;
beforeAll(async () => {
  ({ baseKeymap } = await vi.importActual<
    typeof import('prosemirror-commands')
  >('prosemirror-commands'));
});

let view: EditorView | undefined;
afterEach(() => {
  view?.destroy();
  view = undefined;
});

function createView(withYjs = false): {
  view: EditorView;
  yxml: Y.XmlFragment;
} {
  const ydoc = new Y.Doc();
  const yxml = ydoc.getXmlFragment('prosemirror');
  const plugins = [
    createUndoInputRulePlugin(),
    rules,
    keymap(baseKeymap),
    ...(withYjs ? [ySyncPlugin(yxml), yUndoPlugin()] : []),
  ];
  view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ schema: extendedSchema, plugins }),
  });
  return { view, yxml };
}

function type(v: EditorView, text: string): void {
  for (const ch of text) {
    const { from, to } = v.state.selection;
    const handled = v.someProp('handleTextInput', f =>
      f(v, from, to, ch, () => v.state.tr.insertText(ch, from, to))
    );
    if (!handled) v.dispatch(v.state.tr.insertText(ch, from, to));
  }
}

function pressBackspace(v: EditorView): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Backspace' });
  return v.someProp('handleKeyDown', f => f(v, event)) ?? false;
}

describe('Markdown input rules with the Inkweld schema', () => {
  it.each([1, 2, 3, 4, 5, 6])('turns %i "#" into a level heading', level => {
    const { view: v } = createView();
    type(v, `${'#'.repeat(level)} Chapter`);
    const node = v.state.doc.firstChild!;
    expect(node.type.name).toBe('heading');
    expect(node.attrs['level']).toBe(level);
    expect(node.textContent).toBe('Chapter');
  });

  it('does not convert "#" without the trailing space or beyond level 6', () => {
    const { view: v } = createView();
    type(v, '#Chapter');
    expect(v.state.doc.firstChild!.type.name).toBe('paragraph');

    const { view: v2 } = createView();
    type(v2, '####### x');
    expect(v2.state.doc.firstChild!.type.name).toBe('paragraph');
  });

  it('creates a blockquote, bullet list and ordered list', () => {
    const quote = createView().view;
    type(quote, '> q');
    expect(quote.state.doc.firstChild!.type.name).toBe('blockquote');

    const bullets = createView().view;
    type(bullets, '- b');
    expect(bullets.state.doc.firstChild!.type.name).toBe('bullet_list');

    const numbers = createView().view;
    type(numbers, '1. n');
    expect(numbers.state.doc.firstChild!.type.name).toBe('ordered_list');
  });

  it('Backspace right after the conversion reverts it and keeps the typed text', () => {
    const { view: v } = createView();
    type(v, '## ');
    expect(v.state.doc.firstChild!.type.name).toBe('heading');

    expect(pressBackspace(v)).toBe(true);
    expect(v.state.doc.firstChild!.type.name).toBe('paragraph');
    expect(v.state.doc.textContent).toBe('## ');
  });

  it('Backspace is left to the browser once more text has been typed', () => {
    const { view: v } = createView();
    type(v, '## Title');
    // Not handled by the keymap (the browser deletes the character natively),
    // and the heading is untouched.
    expect(pressBackspace(v)).toBe(false);
    expect(v.state.doc.firstChild!.type.name).toBe('heading');
  });

  it('syncs the converted heading to Yjs, and Backspace-undo syncs back', () => {
    const { view: v, yxml } = createView(true);
    type(v, '## Hi');
    expect(yxml.toJSON()).toContain('<heading');
    expect(yxml.toJSON()).toContain('Hi');

    // Back out to just after the conversion, then undo it.
    const fresh = createView(true);
    type(fresh.view, '## ');
    pressBackspace(fresh.view);
    expect(fresh.yxml.toJSON()).not.toContain('<heading');
    expect(fresh.yxml.toJSON()).toContain('## ');
  });
});
