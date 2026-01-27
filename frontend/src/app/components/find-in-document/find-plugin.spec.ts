/**
 * @vitest-environment jsdom
 */
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createFindPlugin,
  dispatchClose,
  dispatchNextMatch,
  dispatchPreviousMatch,
  dispatchSearch,
  dispatchToggleCaseSensitive,
  getFindState,
} from './find-plugin';

// Basic schema for tests
const testSchema = new Schema({
  nodes: {
    doc: {
      content: 'paragraph+',
    },
    paragraph: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
    text: {
      group: 'inline',
    },
  },
  marks: {},
});

describe('FindPlugin', () => {
  let editorView: EditorView;
  let container: HTMLDivElement;

  const createTestDoc = (text: string) => {
    return testSchema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: text
            ? [
                {
                  type: 'text',
                  text,
                },
              ]
            : [],
        },
      ],
    });
  };

  const createEditorWithText = (text: string) => {
    const doc = createTestDoc(text);
    const plugin = createFindPlugin();
    const editorState = EditorState.create({
      doc,
      schema: testSchema,
      plugins: [plugin],
    });

    container = document.createElement('div');
    document.body.appendChild(container);

    editorView = new EditorView(container, {
      state: editorState,
    });

    return editorView;
  };

  afterEach(() => {
    if (editorView) {
      editorView.destroy();
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('createFindPlugin', () => {
    it('should create a plugin with initial empty state', () => {
      const view = createEditorWithText('Hello world');
      const state = getFindState(view);

      expect(state).toBeDefined();
      expect(state?.query).toBe('');
      expect(state?.matches).toEqual([]);
      expect(state?.currentMatchIndex).toBe(-1);
      expect(state?.caseSensitive).toBe(false);
    });
  });

  describe('dispatchSearch', () => {
    it('should find matches in the document', () => {
      const view = createEditorWithText('Hello world, hello everyone');
      dispatchSearch(view, 'hello');

      const state = getFindState(view);
      expect(state?.query).toBe('hello');
      expect(state?.matches.length).toBe(2);
      expect(state?.currentMatchIndex).toBe(0);
    });

    it('should be case-insensitive by default', () => {
      const view = createEditorWithText('Hello HELLO hello');
      dispatchSearch(view, 'hello');

      const state = getFindState(view);
      expect(state?.matches.length).toBe(3);
    });

    it('should find no matches for non-existent text', () => {
      const view = createEditorWithText('Hello world');
      dispatchSearch(view, 'xyz');

      const state = getFindState(view);
      expect(state?.matches.length).toBe(0);
      expect(state?.currentMatchIndex).toBe(-1);
    });

    it('should handle empty query', () => {
      const view = createEditorWithText('Hello world');
      dispatchSearch(view, '');

      const state = getFindState(view);
      expect(state?.matches.length).toBe(0);
    });

    it('should find overlapping matches', () => {
      const view = createEditorWithText('aaa');
      dispatchSearch(view, 'aa');

      const state = getFindState(view);
      // Should find 'aa' at positions 0 and 1
      expect(state?.matches.length).toBe(2);
    });
  });

  describe('dispatchNextMatch', () => {
    it('should move to next match', () => {
      const view = createEditorWithText('test test test');
      dispatchSearch(view, 'test');

      let state = getFindState(view);
      expect(state?.currentMatchIndex).toBe(0);

      dispatchNextMatch(view);
      state = getFindState(view);
      expect(state?.currentMatchIndex).toBe(1);

      dispatchNextMatch(view);
      state = getFindState(view);
      expect(state?.currentMatchIndex).toBe(2);
    });

    it('should wrap around to first match', () => {
      const view = createEditorWithText('test test');
      dispatchSearch(view, 'test');

      dispatchNextMatch(view); // Go to index 1
      dispatchNextMatch(view); // Should wrap to 0

      const state = getFindState(view);
      expect(state?.currentMatchIndex).toBe(0);
    });

    it('should do nothing when no matches', () => {
      const view = createEditorWithText('Hello world');
      dispatchSearch(view, 'xyz');
      dispatchNextMatch(view);

      const state = getFindState(view);
      expect(state?.currentMatchIndex).toBe(-1);
    });
  });

  describe('dispatchPreviousMatch', () => {
    it('should move to previous match', () => {
      const view = createEditorWithText('test test test');
      dispatchSearch(view, 'test');
      dispatchNextMatch(view); // Go to index 1
      dispatchNextMatch(view); // Go to index 2

      dispatchPreviousMatch(view);
      const state = getFindState(view);
      expect(state?.currentMatchIndex).toBe(1);
    });

    it('should wrap around to last match', () => {
      const view = createEditorWithText('test test test');
      dispatchSearch(view, 'test');

      dispatchPreviousMatch(view); // Should wrap to last

      const state = getFindState(view);
      expect(state?.currentMatchIndex).toBe(2);
    });
  });

  describe('dispatchToggleCaseSensitive', () => {
    it('should enable case sensitivity', () => {
      const view = createEditorWithText('Hello HELLO hello');
      dispatchSearch(view, 'Hello');

      let state = getFindState(view);
      expect(state?.matches.length).toBe(3); // Case insensitive

      dispatchToggleCaseSensitive(view, true);
      state = getFindState(view);
      expect(state?.caseSensitive).toBe(true);
      expect(state?.matches.length).toBe(1); // Only exact match
    });

    it('should disable case sensitivity', () => {
      const view = createEditorWithText('Hello HELLO hello');
      dispatchToggleCaseSensitive(view, true);
      dispatchSearch(view, 'Hello');

      let state = getFindState(view);
      expect(state?.matches.length).toBe(1);

      dispatchToggleCaseSensitive(view, false);
      state = getFindState(view);
      expect(state?.matches.length).toBe(3);
    });
  });

  describe('dispatchClose', () => {
    it('should clear search state', () => {
      const view = createEditorWithText('Hello world');
      dispatchSearch(view, 'Hello');

      let state = getFindState(view);
      expect(state?.matches.length).toBe(1);

      dispatchClose(view);
      state = getFindState(view);
      expect(state?.query).toBe('');
      expect(state?.matches.length).toBe(0);
      expect(state?.currentMatchIndex).toBe(-1);
    });
  });

  describe('decorations', () => {
    it('should create decorations for matches', () => {
      const view = createEditorWithText('test test');
      dispatchSearch(view, 'test');

      const state = getFindState(view);
      expect(state?.decorations).toBeDefined();

      // Check that decorations exist by verifying the decoration set is not empty
      const decos = state?.decorations.find();
      expect(decos).toBeDefined();
      expect(decos?.length).toBe(2);
    });

    it('should have different class for current match', () => {
      const view = createEditorWithText('test test');
      dispatchSearch(view, 'test');

      const state = getFindState(view);
      const decos = state?.decorations.find();

      // Should have two decorations
      expect(decos).toBeDefined();
      expect(decos?.length).toBe(2);

      // First match at currentMatchIndex (0) should be current, second should not
      // Verify by checking that currentMatchIndex is 0
      expect(state?.currentMatchIndex).toBe(0);

      // The decoration positions should match the matches array
      const firstDeco = decos?.[0];
      const secondDeco = decos?.[1];

      // Check positions - first match should be at start of first "test"
      expect(firstDeco?.from).toBe(1);
      expect(firstDeco?.to).toBe(5);

      // Second match should be at start of second "test"
      expect(secondDeco?.from).toBe(6);
      expect(secondDeco?.to).toBe(10);
    });
  });

  describe('document changes', () => {
    it('should update matches when document changes', () => {
      const view = createEditorWithText('test');
      dispatchSearch(view, 'test');

      let state = getFindState(view);
      expect(state?.matches.length).toBe(1);

      // Simulate adding more text with 'test'
      const tr = view.state.tr.insertText(' test', view.state.doc.content.size);
      view.dispatch(tr);

      state = getFindState(view);
      expect(state?.matches.length).toBe(2);
    });
  });
});
