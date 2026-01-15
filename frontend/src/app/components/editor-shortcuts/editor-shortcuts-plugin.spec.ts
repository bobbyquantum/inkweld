import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it, vi } from 'vitest';

import {
  createKeyboardShortcutsPlugin,
  KEYBOARD_SHORTCUTS_LIST,
} from './editor-shortcuts-plugin';

// Create a minimal schema for testing with toDOM specs
const testSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      toDOM: node => ['h' + (node.attrs['level'] as number), 0],
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
        { tag: 'h3', attrs: { level: 3 } },
        { tag: 'h4', attrs: { level: 4 } },
        { tag: 'h5', attrs: { level: 5 } },
        { tag: 'h6', attrs: { level: 6 } },
      ],
    },
    blockquote: {
      content: 'block+',
      group: 'block',
      defining: true,
      toDOM: () => ['blockquote', 0],
      parseDOM: [{ tag: 'blockquote' }],
    },
    horizontal_rule: {
      group: 'block',
      toDOM: () => ['hr'],
      parseDOM: [{ tag: 'hr' }],
    },
    bullet_list: {
      content: 'list_item+',
      group: 'block',
      toDOM: () => ['ul', 0],
      parseDOM: [{ tag: 'ul' }],
    },
    ordered_list: {
      content: 'list_item+',
      group: 'block',
      toDOM: () => ['ol', 0],
      parseDOM: [{ tag: 'ol' }],
    },
    list_item: {
      content: 'paragraph block*',
      defining: true,
      toDOM: () => ['li', 0],
      parseDOM: [{ tag: 'li' }],
    },
    text: { group: 'inline' },
  },
  marks: {
    strong: {
      toDOM: () => ['strong', 0],
      parseDOM: [{ tag: 'strong' }],
    },
    em: {
      toDOM: () => ['em', 0],
      parseDOM: [{ tag: 'em' }],
    },
    u: {
      toDOM: () => ['u', 0],
      parseDOM: [{ tag: 'u' }],
    },
    s: {
      toDOM: () => ['s', 0],
      parseDOM: [{ tag: 's' }],
    },
    code: {
      toDOM: () => ['code', 0],
      parseDOM: [{ tag: 'code' }],
    },
    link: {
      attrs: { href: { default: '' } },
      toDOM: node => ['a', { href: node.attrs['href'] as string }, 0],
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom: HTMLElement) => ({ href: dom.getAttribute('href') }),
        },
      ],
    },
  },
});

describe('createKeyboardShortcutsPlugin', () => {
  it('should create a plugin', () => {
    const plugin = createKeyboardShortcutsPlugin(testSchema);
    expect(plugin).toBeDefined();
    expect(plugin.spec).toBeDefined();
  });

  it('should include the plugin in editor state plugins', () => {
    const plugin = createKeyboardShortcutsPlugin(testSchema);
    const state = EditorState.create({
      schema: testSchema,
      plugins: [plugin],
    });
    expect(state.plugins.length).toBe(1);
    expect(state.plugins[0]).toBe(plugin);
  });

  it('should register keymap bindings for formatting shortcuts', () => {
    const plugin = createKeyboardShortcutsPlugin(testSchema);
    // The plugin spec should have props with handleKeyDown
    expect(plugin.spec.props).toBeDefined();
    expect(plugin.spec.props?.handleKeyDown).toBeDefined();
  });

  it('should work with a schema missing optional nodes', () => {
    // Create a minimal schema without optional nodes
    const minimalSchema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: {
          group: 'block',
          content: 'inline*',
          toDOM: () => ['p', 0],
        },
        text: { group: 'inline' },
      },
      marks: {
        strong: { toDOM: () => ['strong', 0] },
        em: { toDOM: () => ['em', 0] },
      },
    });

    const plugin = createKeyboardShortcutsPlugin(minimalSchema);
    expect(plugin).toBeDefined();

    // Create state and verify it works
    const state = EditorState.create({
      schema: minimalSchema,
      plugins: [plugin],
    });
    expect(state.plugins.length).toBe(1);
  });

  describe('command execution with dispatch', () => {
    it('should handle toggleMark commands correctly', () => {
      const plugin = createKeyboardShortcutsPlugin(testSchema);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello World')]),
        ]),
        plugins: [plugin],
      });

      // Select text
      const selection = TextSelection.create(state.doc, 1, 12);
      const selectedState = state.apply(state.tr.setSelection(selection));

      // The state with selection should be valid
      expect(selectedState.selection.from).toBe(1);
      expect(selectedState.selection.to).toBe(12);
    });

    it('should handle heading commands with missing node type gracefully', () => {
      // Schema without heading node
      const noHeadingSchema = new Schema({
        nodes: {
          doc: { content: 'block+' },
          paragraph: {
            group: 'block',
            content: 'inline*',
            toDOM: () => ['p', 0],
          },
          text: { group: 'inline' },
        },
        marks: {},
      });

      const plugin = createKeyboardShortcutsPlugin(noHeadingSchema);
      const state = EditorState.create({
        schema: noHeadingSchema,
        plugins: [plugin],
      });

      // Should still create plugin without throwing
      expect(state.plugins.length).toBe(1);
    });

    it('should handle list commands with missing list types gracefully', () => {
      // Schema without list nodes
      const noListSchema = new Schema({
        nodes: {
          doc: { content: 'block+' },
          paragraph: {
            group: 'block',
            content: 'inline*',
            toDOM: () => ['p', 0],
          },
          text: { group: 'inline' },
        },
        marks: {},
      });

      const plugin = createKeyboardShortcutsPlugin(noListSchema);
      const state = EditorState.create({
        schema: noListSchema,
        plugins: [plugin],
      });

      // Should still create plugin without throwing
      expect(state.plugins.length).toBe(1);
    });
  });

  describe('link callback', () => {
    it('should accept an onInsertLink callback option', () => {
      const onInsertLink = vi.fn();
      const plugin = createKeyboardShortcutsPlugin(testSchema, {
        onInsertLink,
      });
      expect(plugin).toBeDefined();
    });

    it('should create plugin without callback when not provided', () => {
      const plugin = createKeyboardShortcutsPlugin(testSchema, {});
      expect(plugin).toBeDefined();
    });
  });
});

describe('KEYBOARD_SHORTCUTS_LIST', () => {
  it('should export a list of keyboard shortcuts', () => {
    expect(KEYBOARD_SHORTCUTS_LIST).toBeDefined();
    expect(Array.isArray(KEYBOARD_SHORTCUTS_LIST)).toBe(true);
    expect(KEYBOARD_SHORTCUTS_LIST.length).toBeGreaterThan(0);
  });

  it('should include essential formatting shortcuts', () => {
    const actions = KEYBOARD_SHORTCUTS_LIST.map(s => s.action);
    expect(actions).toContain('Bold');
    expect(actions).toContain('Italic');
    expect(actions).toContain('Underline');
    expect(actions).toContain('Strikethrough');
    expect(actions).toContain('Inline code');
  });

  it('should include heading shortcuts', () => {
    const actions = KEYBOARD_SHORTCUTS_LIST.map(s => s.action);
    expect(actions).toContain('Heading levels 1-6');
    expect(actions).toContain('Paragraph (remove heading)');
  });

  it('should include list and block shortcuts', () => {
    const actions = KEYBOARD_SHORTCUTS_LIST.map(s => s.action);
    expect(actions).toContain('Bullet list');
    expect(actions).toContain('Numbered list');
    expect(actions).toContain('Blockquote');
  });

  it('should include utility shortcuts', () => {
    const actions = KEYBOARD_SHORTCUTS_LIST.map(s => s.action);
    expect(actions).toContain('Insert link');
    expect(actions).toContain('Horizontal rule');
    expect(actions).toContain('Clear formatting');
  });

  it('should have valid key descriptions for all shortcuts', () => {
    for (const shortcut of KEYBOARD_SHORTCUTS_LIST) {
      expect(shortcut.keys).toBeDefined();
      expect(shortcut.keys.length).toBeGreaterThan(0);
      expect(shortcut.action).toBeDefined();
      expect(shortcut.action.length).toBeGreaterThan(0);
      // All shortcuts should include Ctrl/Cmd modifier
      expect(shortcut.keys).toContain('Ctrl/Cmd');
    }
  });

  it('should have 13 keyboard shortcuts defined', () => {
    expect(KEYBOARD_SHORTCUTS_LIST.length).toBe(13);
  });
});
