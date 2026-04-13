/**
 * Tests for Element Reference ProseMirror Plugin
 */
import { Schema } from 'prosemirror-model';
import {
  EditorState,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import { DecorationSet, type EditorView } from 'prosemirror-view';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementType } from '../../../api-client';
import { type ElementRefNodeAttrs } from './element-ref.model';
import {
  cancelElementRef,
  createElementRefPlugin,
  deleteElementRef,
  type ElementRefPluginCallbacks,
  elementRefPluginKey,
  getElementRefState,
  insertElementRef,
  isElementRefActive,
  updateElementRefText,
} from './element-ref-plugin';
import {
  ELEMENT_REF_NODE_NAME,
  elementRefNodeSpec,
} from './element-ref-schema';

// Create a schema with elementRef node for testing
const testSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0];
      },
    },
    text: { group: 'inline' },
    [ELEMENT_REF_NODE_NAME]: elementRefNodeSpec,
  },
  marks: {},
});

describe('ElementRefPlugin', () => {
  let callbacks: ElementRefPluginCallbacks;

  beforeEach(() => {
    callbacks = {
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onQueryChange: vi.fn(),
      onRefClick: vi.fn(),
      onRefHover: vi.fn(),
      onRefHoverEnd: vi.fn(),
    };
  });

  describe('createElementRefPlugin', () => {
    it('should create a plugin with the correct key', () => {
      const plugin = createElementRefPlugin(callbacks);
      expect(plugin.spec.key).toBe(elementRefPluginKey);
    });

    it('should initialize with inactive state', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello world')]),
        ]),
        plugins: [plugin],
      });

      const pluginState = elementRefPluginKey.getState(state);
      expect(pluginState).toBeDefined();
      expect(pluginState!.active).toBe(false);
      expect(pluginState!.triggerPos).toBeNull();
      expect(pluginState!.query).toBe('');
      expect(pluginState!.popupPosition).toBeNull();
    });
  });

  describe('Plugin State Management', () => {
    it('should handle activate action', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
        plugins: [plugin],
      });

      const tr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 5,
        popupPosition: { x: 100, y: 200 },
      });

      const newState = state.apply(tr);
      const pluginState = elementRefPluginKey.getState(newState);

      expect(pluginState!.active).toBe(true);
      expect(pluginState!.triggerPos).toBe(5);
      expect(pluginState!.query).toBe('');
      expect(pluginState!.popupPosition).toEqual({ x: 100, y: 200 });
    });

    it('should handle updateQuery action', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello @john')]),
        ]),
        plugins: [plugin],
      });

      // First activate
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 6,
        popupPosition: { x: 100, y: 200 },
      });
      const activeState = state.apply(activateTr);

      // Then update query
      const queryTr = activeState.tr.setMeta(elementRefPluginKey, {
        type: 'updateQuery',
        query: 'john',
      });
      const newState = activeState.apply(queryTr);
      const pluginState = elementRefPluginKey.getState(newState);

      expect(pluginState!.query).toBe('john');
    });

    it('should handle deactivate action', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
        plugins: [plugin],
      });

      // First activate
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 5,
        popupPosition: { x: 100, y: 200 },
      });
      const activeState = state.apply(activateTr);

      // Then deactivate
      const deactivateTr = activeState.tr.setMeta(elementRefPluginKey, {
        type: 'deactivate',
      });
      const newState = activeState.apply(deactivateTr);
      const pluginState = elementRefPluginKey.getState(newState);

      expect(pluginState!.active).toBe(false);
      expect(pluginState!.triggerPos).toBeNull();
      expect(pluginState!.query).toBe('');
      expect(pluginState!.popupPosition).toBeNull();
    });

    it('should handle insert action (deactivates state)', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
        plugins: [plugin],
      });

      // First activate
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 5,
        popupPosition: { x: 100, y: 200 },
      });
      const activeState = state.apply(activateTr);

      // Then insert (just deactivates in state)
      const insertTr = activeState.tr.setMeta(elementRefPluginKey, {
        type: 'insert',
        attrs: { elementId: 'test-id', displayText: 'Test' },
      });
      const newState = activeState.apply(insertTr);
      const pluginState = elementRefPluginKey.getState(newState);

      expect(pluginState!.active).toBe(false);
    });

    it('should deactivate when cursor moves before trigger position', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello @world')]),
        ]),
        plugins: [plugin],
      });

      // Activate at position 7 (after @)
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 7,
        popupPosition: { x: 100, y: 200 },
      });
      const activeState = state.apply(activateTr);

      // Move selection to position 3 (before trigger)
      const { tr } = activeState;
      tr.setSelection(TextSelection.near(activeState.doc.resolve(3)));

      const newState = activeState.apply(tr);
      const pluginState = elementRefPluginKey.getState(newState);

      expect(pluginState!.active).toBe(false);
      expect(callbacks.onClose).toHaveBeenCalled();
    });
  });

  describe('getElementRefState', () => {
    it('should return undefined when plugin is not installed', () => {
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
      });

      expect(getElementRefState(state)).toBeUndefined();
    });

    it('should return plugin state when installed', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
        plugins: [plugin],
      });

      const pluginState = getElementRefState(state);
      expect(pluginState).toBeDefined();
      expect(pluginState!.active).toBe(false);
    });
  });

  describe('isElementRefActive', () => {
    it('should return false when plugin is not installed', () => {
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
      });

      expect(isElementRefActive(state)).toBe(false);
    });

    it('should return false when inactive', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
        plugins: [plugin],
      });

      expect(isElementRefActive(state)).toBe(false);
    });

    it('should return true when active', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
        plugins: [plugin],
      });

      const tr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 5,
        popupPosition: { x: 100, y: 200 },
      });
      const newState = state.apply(tr);

      expect(isElementRefActive(newState)).toBe(true);
    });
  });

  describe('Decoration Management', () => {
    it('should create trigger decoration when activated', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello @')]),
        ]),
        plugins: [plugin],
      });

      const tr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 7,
        popupPosition: { x: 100, y: 200 },
      });
      const newState = state.apply(tr);
      const pluginState = elementRefPluginKey.getState(newState);

      expect(pluginState!.decorations).not.toBe(DecorationSet.empty);
    });

    it('should expand decoration as query grows', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello @john')]),
        ]),
        plugins: [plugin],
      });

      // Activate
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 7,
        popupPosition: { x: 100, y: 200 },
      });
      const activeState = state.apply(activateTr);

      // Update query
      const queryTr = activeState.tr.setMeta(elementRefPluginKey, {
        type: 'updateQuery',
        query: 'john',
      });
      const newState = activeState.apply(queryTr);
      const pluginState = elementRefPluginKey.getState(newState);

      // Decoration should exist and cover @john
      expect(pluginState!.decorations).not.toBe(DecorationSet.empty);
    });

    it('should clear decorations when deactivated', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello @')]),
        ]),
        plugins: [plugin],
      });

      // Activate
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 7,
        popupPosition: { x: 100, y: 200 },
      });
      const activeState = state.apply(activateTr);

      // Deactivate
      const deactivateTr = activeState.tr.setMeta(elementRefPluginKey, {
        type: 'deactivate',
      });
      const newState = activeState.apply(deactivateTr);
      const pluginState = elementRefPluginKey.getState(newState);

      expect(pluginState!.decorations).toBe(DecorationSet.empty);
    });
  });

  describe('Query Updates from Document Changes', () => {
    it('should deactivate when space is typed in query', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello @john')]),
        ]),
        plugins: [plugin],
      });

      // Activate at position 7
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 7,
        popupPosition: { x: 100, y: 200 },
      });
      let currentState = state.apply(activateTr);

      // Insert space after @john (simulating typing space)
      const spaceDoc = testSchema.node('doc', null, [
        testSchema.node('paragraph', null, [
          testSchema.text('Hello @john doe'),
        ]),
      ]);
      const spaceTr = currentState.tr.replaceWith(
        1,
        currentState.doc.content.size - 1,
        spaceDoc.content
      );
      // Move selection to end
      spaceTr.setSelection(
        TextSelection.near(spaceTr.doc.resolve(spaceTr.doc.content.size - 1))
      );
      currentState = currentState.apply(spaceTr);
      const pluginState = elementRefPluginKey.getState(currentState);

      expect(pluginState!.active).toBe(false);
      expect(callbacks.onClose).toHaveBeenCalled();
    });

    it('should update query via setMeta action', () => {
      const plugin = createElementRefPlugin(callbacks);

      let state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello @j')]),
        ]),
        plugins: [plugin],
      });

      // Activate at position 7 (the @)
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 7,
        popupPosition: { x: 100, y: 200 },
      });
      state = state.apply(activateTr);

      // Update query via setMeta
      const updateQueryTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'updateQuery',
        query: 'joh',
      });
      state = state.apply(updateQueryTr);

      const pluginState = elementRefPluginKey.getState(state);

      // Query should be updated in state
      // Note: setMeta updateQuery doesn't trigger onQueryChange callback
      // That only happens when query is extracted from document changes
      expect(pluginState!.query).toBe('joh');
    });

    it('should keep state unchanged for non-active plugin with no action', () => {
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello world')]),
        ]),
        plugins: [plugin],
      });

      // Apply a regular transaction with no plugin meta (not active)
      const tr = state.tr.insertText('!', 12);
      const newState = state.apply(tr);
      const pluginState = elementRefPluginKey.getState(newState);

      expect(pluginState!.active).toBe(false);
      expect(pluginState!.triggerPos).toBeNull();
    });

    it('should map decorations when active and no doc/selection change', () => {
      const plugin = createElementRefPlugin(callbacks);
      let state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello @j')]),
        ]),
        plugins: [plugin],
      });

      // Activate
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 7,
        popupPosition: { x: 100, y: 200 },
      });
      state = state.apply(activateTr);

      // Apply a metadata-only transaction (no doc change, no selection change)
      const metaTr = state.tr.setMeta('someOtherPlugin', true);
      const newState = state.apply(metaTr);
      const pluginState = elementRefPluginKey.getState(newState);

      expect(pluginState!.active).toBe(true);
      expect(pluginState!.triggerPos).toBe(7);
    });

    it('should deactivate when newline is typed in query', () => {
      const plugin = createElementRefPlugin(callbacks);
      let state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello @john')]),
          testSchema.node('paragraph', null, [testSchema.text('new line')]),
        ]),
        plugins: [plugin],
      });

      // Activate at position 7
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 7,
        popupPosition: { x: 100, y: 200 },
      });
      state = state.apply(activateTr);

      // Insert a newline after @john by replacing with text containing \n
      const nlDoc = testSchema.node('doc', null, [
        testSchema.node('paragraph', null, [
          testSchema.text('Hello @john\nnew'),
        ]),
      ]);
      const nlTr = state.tr.replaceWith(
        1,
        state.doc.content.size - 1,
        nlDoc.content
      );
      nlTr.setSelection(
        TextSelection.near(nlTr.doc.resolve(nlTr.doc.content.size - 1))
      );
      state = state.apply(nlTr);
      const pluginState = elementRefPluginKey.getState(state);

      expect(pluginState!.active).toBe(false);
      expect(callbacks.onClose).toHaveBeenCalled();
    });

    it('should call onQueryChange when query changes from document edits', () => {
      const plugin = createElementRefPlugin(callbacks);
      let state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello @j')]),
        ]),
        plugins: [plugin],
      });

      // Activate at position 7 (the @)
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 7,
        popupPosition: { x: 100, y: 200 },
      });
      state = state.apply(activateTr);

      // Simulate typing 'o' after @j to make @jo
      const typeTr = state.tr.insertText('o', 9);
      typeTr.setSelection(TextSelection.near(typeTr.doc.resolve(10)));
      state = state.apply(typeTr);
      const pluginState = elementRefPluginKey.getState(state);

      expect(pluginState!.query).toBe('jo');
      expect(callbacks.onQueryChange).toHaveBeenCalledWith('jo');
    });

    it('should not update state when query has not changed', () => {
      const plugin = createElementRefPlugin(callbacks);
      let state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello @jo')]),
        ]),
        plugins: [plugin],
      });

      // Activate at position 7 (the @)
      const activateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 7,
        popupPosition: { x: 100, y: 200 },
      });
      state = state.apply(activateTr);

      // Update query to 'jo'
      const queryTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'updateQuery',
        query: 'jo',
      });
      state = state.apply(queryTr);

      // Now move selection to same position (query stays 'jo')
      const selTr = state.tr.setSelection(
        TextSelection.near(state.doc.resolve(10))
      );
      const newState = state.apply(selTr);
      const pluginState = elementRefPluginKey.getState(newState);

      // Query should remain the same, no extra onQueryChange calls
      expect(pluginState!.query).toBe('jo');
      expect(pluginState!.active).toBe(true);
    });
  });
});

describe('Plugin Public API', () => {
  let callbacks: ElementRefPluginCallbacks;
  let mockView: Partial<EditorView>;
  let dispatchedTransactions: Transaction[];

  beforeEach(() => {
    callbacks = {
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onQueryChange: vi.fn(),
      onRefClick: vi.fn(),
    };
    dispatchedTransactions = [];
  });

  function createMockView(
    doc: string,
    pluginActive: boolean = false,
    triggerPos: number | null = null
  ): EditorView {
    const plugin = createElementRefPlugin(callbacks);
    let state = EditorState.create({
      schema: testSchema,
      doc: testSchema.node('doc', null, [
        testSchema.node('paragraph', null, [testSchema.text(doc)]),
      ]),
      plugins: [plugin],
    });

    if (pluginActive && triggerPos !== null) {
      const tr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos,
        popupPosition: { x: 100, y: 200 },
      });
      state = state.apply(tr);
    }

    return {
      state,
      dispatch: vi.fn((tr: Transaction) => {
        dispatchedTransactions.push(tr);
        state = state.apply(tr);
        (mockView as EditorView).state = state;
      }),
      focus: vi.fn(),
    } as unknown as EditorView;
  }

  describe('insertElementRef', () => {
    it('should return false when not in active state', () => {
      const view = createMockView('Hello world', false);
      const attrs: ElementRefNodeAttrs = {
        elementId: 'test-id',
        elementType: ElementType.Worldbuilding,
        displayText: 'John',
        originalName: 'John',
        relationshipTypeId: 'referenced-in',
      };

      const result = insertElementRef(view, attrs);
      expect(result).toBe(false);
    });

    it('should return false when triggerPos is null', () => {
      const plugin = createElementRefPlugin(callbacks);
      let state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
        plugins: [plugin],
      });

      // Manually set active but with null triggerPos (edge case)
      const tr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos: 5,
        popupPosition: { x: 100, y: 200 },
      });
      state = state.apply(tr);

      // Now deactivate to get null triggerPos
      const deactivateTr = state.tr.setMeta(elementRefPluginKey, {
        type: 'deactivate',
      });
      state = state.apply(deactivateTr);

      const view = {
        state,
        dispatch: vi.fn(),
        focus: vi.fn(),
      } as unknown as EditorView;

      const attrs: ElementRefNodeAttrs = {
        elementId: 'test-id',
        elementType: ElementType.Worldbuilding,
        displayText: 'John',
        originalName: 'John',
        relationshipTypeId: 'referenced-in',
      };

      const result = insertElementRef(view, attrs);
      expect(result).toBe(false);
    });

    it('should insert element ref and deactivate when in active state', () => {
      const view = createMockView('Hello @jo', true, 7);
      mockView = view;

      // Update query to 'jo'
      const queryTr = view.state.tr.setMeta(elementRefPluginKey, {
        type: 'updateQuery',
        query: 'jo',
      });
      view.dispatch(queryTr);

      const attrs: ElementRefNodeAttrs = {
        elementId: 'test-id',
        elementType: ElementType.Worldbuilding,
        displayText: 'John',
        originalName: 'John',
        relationshipTypeId: 'referenced-in',
      };

      const result = insertElementRef(view, attrs);
      expect(result).toBe(true);
      expect(view.dispatch).toHaveBeenCalled();
      expect(view.focus).toHaveBeenCalled();
    });
  });

  describe('cancelElementRef', () => {
    it('should dispatch deactivate and focus', () => {
      const view = createMockView('Hello @', true, 7);

      cancelElementRef(view);

      expect(view.dispatch).toHaveBeenCalled();
      expect(view.focus).toHaveBeenCalled();

      // Check that deactivate was dispatched
      const lastTr = dispatchedTransactions[dispatchedTransactions.length - 1];
      const action = lastTr.getMeta(elementRefPluginKey);
      expect(action).toEqual({ type: 'deactivate' });
    });
  });

  describe('updateElementRefText', () => {
    it('should return false when position is at text node', () => {
      const view = createMockView('Hello world', false);

      // Position 1 is inside the text node, not an elementRef
      const result = updateElementRefText(view, 1, 'New Text');
      expect(result).toBe(false);
    });

    it('should return false when node is not elementRef', () => {
      const view = createMockView('Hello world', false);

      const result = updateElementRefText(view, 1, 'New Text');
      expect(result).toBe(false);
    });

    it('should update displayText on elementRef node', () => {
      const plugin = createElementRefPlugin(callbacks);
      const elementRefNode = testSchema.nodes[ELEMENT_REF_NODE_NAME].create({
        elementId: 'test-id',
        elementType: ElementType.Worldbuilding,
        displayText: 'Old Name',
        originalName: 'Old Name',
        relationshipTypeId: 'referenced-in',
      });

      let state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [
            testSchema.text('Hello '),
            elementRefNode,
            testSchema.text(' world'),
          ]),
        ]),
        plugins: [plugin],
      });

      const view = {
        state,
        dispatch: vi.fn((tr: Transaction) => {
          state = state.apply(tr);
        }),
      } as unknown as EditorView;

      // Position 7 is where the elementRef starts (after "Hello ")
      const result = updateElementRefText(view, 7, 'New Name');
      expect(result).toBe(true);
      expect(view.dispatch).toHaveBeenCalled();
    });
  });

  describe('deleteElementRef', () => {
    it('should return false when position is at text node', () => {
      const view = createMockView('Hello world', false);

      // Position 1 is inside the text node, not an elementRef
      const result = deleteElementRef(view, 1);
      expect(result).toBe(false);
    });

    it('should return false when node is not elementRef', () => {
      const view = createMockView('Hello world', false);

      const result = deleteElementRef(view, 1);
      expect(result).toBe(false);
    });

    it('should delete elementRef node', () => {
      const plugin = createElementRefPlugin(callbacks);
      const elementRefNode = testSchema.nodes[ELEMENT_REF_NODE_NAME].create({
        elementId: 'test-id',
        elementType: ElementType.Worldbuilding,
        displayText: 'John',
        originalName: 'John',
        relationshipTypeId: 'referenced-in',
      });

      let state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [
            testSchema.text('Hello '),
            elementRefNode,
            testSchema.text(' world'),
          ]),
        ]),
        plugins: [plugin],
      });

      const view = {
        state,
        dispatch: vi.fn((tr: Transaction) => {
          state = state.apply(tr);
        }),
        focus: vi.fn(),
      } as unknown as EditorView;

      // Position 7 is where the elementRef starts
      const result = deleteElementRef(view, 7);
      expect(result).toBe(true);
      expect(view.dispatch).toHaveBeenCalled();
      expect(view.focus).toHaveBeenCalled();
    });
  });
});

describe('elementRefNodeSpec', () => {
  it('should be inline and atomic', () => {
    expect(elementRefNodeSpec.group).toBe('inline');
    expect(elementRefNodeSpec.inline).toBe(true);
    expect(elementRefNodeSpec.atom).toBe(true);
  });

  it('should have correct default attributes', () => {
    expect(elementRefNodeSpec.attrs).toBeDefined();
    expect(elementRefNodeSpec.attrs!['elementId']).toEqual({ default: null });
    expect(elementRefNodeSpec.attrs!['elementType']).toEqual({ default: null });
    expect(elementRefNodeSpec.attrs!['displayText']).toEqual({ default: '' });
    expect(elementRefNodeSpec.attrs!['originalName']).toEqual({ default: '' });
    expect(elementRefNodeSpec.attrs!['relationshipId']).toEqual({
      default: null,
    });
    expect(elementRefNodeSpec.attrs!['relationshipTypeId']).toEqual({
      default: 'referenced-in',
    });
    expect(elementRefNodeSpec.attrs!['relationshipNote']).toEqual({
      default: null,
    });
  });

  it('should serialize to DOM with correct structure', () => {
    const node = testSchema.nodes[ELEMENT_REF_NODE_NAME].create({
      elementId: 'test-id',
      elementType: ElementType.Worldbuilding,
      displayText: 'John Smith',
      originalName: 'John Smith',
      relationshipId: 'rel-1',
      relationshipNote: 'Main character',
    });

    const toDOM = elementRefNodeSpec.toDOM!(node);
    expect(toDOM).toBeDefined();
    expect(Array.isArray(toDOM)).toBe(true);

    // Cast to array type for easier access (DOMOutputSpec is readonly tuple)
    const domArray = toDOM as unknown as unknown[];
    expect(domArray[0]).toBe('span');

    const attrs = domArray[1] as Record<string, string>;
    expect(attrs['data-element-ref']).toBe('true');
    expect(attrs['data-element-id']).toBe('test-id');
    expect(attrs['data-element-type']).toBe(ElementType.Worldbuilding);
    expect(attrs['data-original-name']).toBe('John Smith');
    expect(attrs['data-relationship-id']).toBe('rel-1');
    expect(attrs['data-relationship-note']).toBe('Main character');
    expect(attrs['class']).toContain('element-ref');
    expect(attrs['class']).toContain('element-ref--worldbuilding');
    expect(attrs['class']).toContain('element-ref--has-note');

    // Text content
    expect(domArray[2]).toBe('John Smith');
  });

  it('should add deleted class when elementId is missing', () => {
    const node = testSchema.nodes[ELEMENT_REF_NODE_NAME].create({
      elementId: '',
      elementType: ElementType.Worldbuilding,
      displayText: 'Deleted Reference',
      originalName: 'Deleted Reference',
    });

    const toDOM = elementRefNodeSpec.toDOM!(node);
    const domArray = toDOM as unknown as unknown[];
    const attrs = domArray[1] as Record<string, string>;
    expect(attrs['class']).toContain('element-ref--deleted');
  });

  it('should show ??? when displayText is empty', () => {
    const node = testSchema.nodes[ELEMENT_REF_NODE_NAME].create({
      elementId: 'test-id',
      elementType: ElementType.Item,
      displayText: '',
      originalName: '',
    });

    const toDOM = elementRefNodeSpec.toDOM!(node);
    const domArray = toDOM as unknown as unknown[];
    expect(domArray[2]).toBe('???');
  });

  describe('parseDOM', () => {
    it('should parse from DOM element', () => {
      const parseDOM = elementRefNodeSpec.parseDOM![0];
      expect(parseDOM.tag).toBe('span[data-element-ref]');

      // Create a mock DOM element
      const mockElement = {
        getAttribute: vi.fn((attr: string) => {
          const attrs: Record<string, string> = {
            'data-element-id': 'parsed-id',
            'data-element-type': ElementType.Worldbuilding,
            'data-original-name': 'Castle',
            'data-relationship-id': 'rel-2',
            'data-relationship-type': 'contains',
            'data-relationship-note': 'Setting',
          };
          return attrs[attr] || '';
        }),
        dataset: {
          elementId: 'parsed-id',
          elementType: ElementType.Worldbuilding,
          originalName: 'Castle',
          relationshipId: 'rel-2',
          relationshipType: 'contains',
          relationshipNote: 'Setting',
        },
        textContent: 'Castle Blackwood',
      } as unknown as HTMLElement;

      const parsedAttrs = (
        parseDOM.getAttrs as (dom: HTMLElement) => ElementRefNodeAttrs
      )(mockElement);

      expect(parsedAttrs.elementId).toBe('parsed-id');
      expect(parsedAttrs.elementType).toBe(ElementType.Worldbuilding);
      expect(parsedAttrs.displayText).toBe('Castle Blackwood');
      expect(parsedAttrs.originalName).toBe('Castle');
      expect(parsedAttrs.relationshipId).toBe('rel-2');
      expect(parsedAttrs.relationshipTypeId).toBe('contains');
      expect(parsedAttrs.relationshipNote).toBe('Setting');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Plugin Props Handlers
// ─────────────────────────────────────────────────────────────────────────────

describe('Plugin Props Handlers', () => {
  let callbacks: ElementRefPluginCallbacks;

  beforeEach(() => {
    callbacks = {
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onQueryChange: vi.fn(),
      onRefClick: vi.fn(),
      onRefHover: vi.fn(),
      onRefHoverEnd: vi.fn(),
    };
  });

  function createStateWithPlugin(
    docContent: string,
    active = false,
    triggerPos: number | null = null
  ) {
    const plugin = createElementRefPlugin(callbacks);
    let state = EditorState.create({
      schema: testSchema,
      doc: testSchema.node('doc', null, [
        testSchema.node('paragraph', null, [testSchema.text(docContent)]),
      ]),
      plugins: [plugin],
    });

    if (active && triggerPos !== null) {
      const tr = state.tr.setMeta(elementRefPluginKey, {
        type: 'activate',
        triggerPos,
        popupPosition: { x: 100, y: 200 },
      });
      state = state.apply(tr);
    }

    return { state, plugin };
  }

  function createStateWithElementRef() {
    const plugin = createElementRefPlugin(callbacks);
    const elementRefNode = testSchema.nodes[ELEMENT_REF_NODE_NAME].create({
      elementId: 'test-id',
      elementType: ElementType.Worldbuilding,
      displayText: 'John Smith',
      originalName: 'John Smith',
      relationshipId: 'rel-1',
      relationshipTypeId: 'referenced-in',
    });

    const state = EditorState.create({
      schema: testSchema,
      doc: testSchema.node('doc', null, [
        testSchema.node('paragraph', null, [
          testSchema.text('Hello '),
          elementRefNode,
          testSchema.text(' world'),
        ]),
      ]),
      plugins: [plugin],
    });

    return { state, plugin };
  }

  describe('handleKeyDown', () => {
    it('should close popup on Escape when active', () => {
      const { state, plugin } = createStateWithPlugin('Hello @', true, 7);
      const dispatched: Transaction[] = [];

      const view = {
        state,
        dispatch: vi.fn((tr: Transaction) => {
          dispatched.push(tr);
        }),
      } as unknown as EditorView;

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      const result = plugin.props.handleKeyDown!.call(plugin, view, event);

      expect(result).toBe(true);
      expect(view.dispatch).toHaveBeenCalled();
      const action = dispatched[0].getMeta(elementRefPluginKey);
      expect(action).toEqual({ type: 'deactivate' });
    });

    it('should return false on Escape when not active', () => {
      const { state, plugin } = createStateWithPlugin('Hello world');

      const view = {
        state,
        dispatch: vi.fn(),
      } as unknown as EditorView;

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      const result = plugin.props.handleKeyDown!.call(plugin, view, event);

      expect(result).toBe(false);
      expect(view.dispatch).not.toHaveBeenCalled();
    });

    it('should return false for non-Escape keys when active', () => {
      const { state, plugin } = createStateWithPlugin('Hello @', true, 7);

      const view = {
        state,
        dispatch: vi.fn(),
      } as unknown as EditorView;

      const event = new KeyboardEvent('keydown', { key: 'a' });
      const result = plugin.props.handleKeyDown!.call(plugin, view, event);

      expect(result).toBe(false);
    });
  });

  describe('handleTextInput', () => {
    it('should activate plugin when @ is typed', () => {
      const { state, plugin } = createStateWithPlugin('Hello ');
      const dispatched: Transaction[] = [];

      const view = {
        state,
        dispatch: vi.fn((tr: Transaction) => {
          dispatched.push(tr);
        }),
        coordsAtPos: vi.fn(() => ({
          left: 50,
          right: 55,
          top: 10,
          bottom: 20,
        })),
      } as unknown as EditorView;

      const result = plugin.props.handleTextInput!.call(
        plugin,
        view,
        7,
        7,
        '@',
        () => view.state.tr
      );

      expect(result).toBe(false); // Returns false to let @ be inserted normally
      expect(view.dispatch).toHaveBeenCalled();
      const action = dispatched[0].getMeta(elementRefPluginKey);
      expect(action.type).toBe('activate');
      expect(action.triggerPos).toBe(7);
      expect(callbacks.onOpen).toHaveBeenCalledWith(
        { x: 50, y: 24 }, // bottom + 4
        ''
      );
    });

    it('should not re-trigger when @ is typed while already active', () => {
      const { state, plugin } = createStateWithPlugin('Hello @', true, 7);

      const view = {
        state,
        dispatch: vi.fn(),
        coordsAtPos: vi.fn(() => ({
          left: 50,
          right: 55,
          top: 10,
          bottom: 20,
        })),
      } as unknown as EditorView;

      const result = plugin.props.handleTextInput!.call(
        plugin,
        view,
        8,
        8,
        '@',
        () => view.state.tr
      );

      expect(result).toBe(false);
      expect(view.dispatch).not.toHaveBeenCalled();
      expect(callbacks.onOpen).not.toHaveBeenCalled();
    });

    it('should return false for non-@ text', () => {
      const { state, plugin } = createStateWithPlugin('Hello');

      const view = {
        state,
        dispatch: vi.fn(),
      } as unknown as EditorView;

      const result = plugin.props.handleTextInput!.call(
        plugin,
        view,
        6,
        6,
        'a',
        () => view.state.tr
      );

      expect(result).toBe(false);
      expect(view.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('handleClick', () => {
    it('should call onRefClick when clicking on an elementRef node', () => {
      const { state, plugin } = createStateWithElementRef();

      const mouseEvent = new MouseEvent('click');
      const view = { state } as unknown as EditorView;

      // Position 7 is where the elementRef node starts (after "Hello ")
      const result = plugin.props.handleClick!.call(
        plugin,
        view,
        7,
        mouseEvent
      );

      expect(result).toBe(true);
      expect(callbacks.onRefClick).toHaveBeenCalledWith(
        expect.objectContaining({
          elementId: 'test-id',
          elementType: ElementType.Worldbuilding,
          displayText: 'John Smith',
          originalName: 'John Smith',
          relationshipId: 'rel-1',
          nodePos: 7,
          mouseEvent,
          isContextMenu: false,
        })
      );
    });

    it('should return false when clicking on a text node', () => {
      const { state, plugin } = createStateWithPlugin('Hello world');

      const mouseEvent = new MouseEvent('click');
      const view = { state } as unknown as EditorView;

      const result = plugin.props.handleClick!.call(
        plugin,
        view,
        3,
        mouseEvent
      );

      expect(result).toBe(false);
      expect(callbacks.onRefClick).not.toHaveBeenCalled();
    });
  });

  describe('handleDOMEvents.contextmenu', () => {
    it('should handle right-click on a span with data-element-ref via DOM target', () => {
      const { state, plugin } = createStateWithElementRef();
      const contextmenuHandler =
        plugin.props.handleDOMEvents!['contextmenu']!.bind(plugin);

      const refSpan = document.createElement('span');
      refSpan.setAttribute('data-element-ref', 'true');
      refSpan.dataset['elementId'] = 'dom-id';
      refSpan.dataset['elementType'] = ElementType.Item;
      refSpan.dataset['originalName'] = 'Jane';
      refSpan.dataset['relationshipId'] = 'rel-3';
      refSpan.textContent = 'Jane Doe';

      const event = new MouseEvent('contextmenu', {
        clientX: 50,
        clientY: 100,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: refSpan });

      const view = {
        state,
        posAtDOM: vi.fn(() => 7),
      } as unknown as EditorView;

      const result = contextmenuHandler(view, event as unknown as PointerEvent);

      expect(result).toBe(true);
      expect(callbacks.onRefClick).toHaveBeenCalledWith(
        expect.objectContaining({
          elementId: 'dom-id',
          elementType: ElementType.Item,
          displayText: 'Jane Doe',
          originalName: 'Jane',
          relationshipId: 'rel-3',
          isContextMenu: true,
        })
      );
    });

    it('should handle right-click when posAtDOM throws', () => {
      const { state, plugin } = createStateWithElementRef();
      const contextmenuHandler =
        plugin.props.handleDOMEvents!['contextmenu']!.bind(plugin);

      const refSpan = document.createElement('span');
      refSpan.setAttribute('data-element-ref', 'true');
      refSpan.dataset['elementId'] = 'dom-id';
      refSpan.dataset['elementType'] = ElementType.Item;
      refSpan.textContent = 'Item';

      const event = new MouseEvent('contextmenu', { bubbles: true });
      Object.defineProperty(event, 'target', { value: refSpan });

      const view = {
        state,
        posAtDOM: vi.fn(() => {
          throw new Error('Position resolution failed');
        }),
      } as unknown as EditorView;

      const result = contextmenuHandler(view, event as unknown as PointerEvent);

      expect(result).toBe(true);
      expect(callbacks.onRefClick).toHaveBeenCalledWith(
        expect.objectContaining({
          nodePos: -1,
          isContextMenu: true,
        })
      );
    });

    it('should fall back to coordinate-based resolution for elementRef', () => {
      const { state, plugin } = createStateWithElementRef();
      const contextmenuHandler =
        plugin.props.handleDOMEvents!['contextmenu']!.bind(plugin);

      // Target is NOT a span[data-element-ref]
      const target = document.createElement('div');
      const event = new MouseEvent('contextmenu', {
        clientX: 50,
        clientY: 100,
        bubbles: true,
      });
      Object.defineProperty(event, 'target', { value: target });

      const view = {
        state,
        posAtCoords: vi.fn(() => ({ pos: 7, inside: -1 })),
      } as unknown as EditorView;

      const result = contextmenuHandler(view, event as unknown as PointerEvent);

      expect(result).toBe(true);
      expect(callbacks.onRefClick).toHaveBeenCalledWith(
        expect.objectContaining({
          elementId: 'test-id',
          nodePos: 7,
          isContextMenu: true,
        })
      );
    });

    it('should return false when coordinate fallback finds no elementRef', () => {
      const { state, plugin } = createStateWithPlugin('Hello world');
      const contextmenuHandler =
        plugin.props.handleDOMEvents!['contextmenu']!.bind(plugin);

      const target = document.createElement('div');
      const event = new MouseEvent('contextmenu', { bubbles: true });
      Object.defineProperty(event, 'target', { value: target });

      const view = {
        state,
        posAtCoords: vi.fn(() => ({ pos: 3, inside: -1 })),
      } as unknown as EditorView;

      const result = contextmenuHandler(view, event as unknown as PointerEvent);

      expect(result).toBe(false);
    });

    it('should return false when posAtCoords returns null', () => {
      const { state, plugin } = createStateWithPlugin('Hello world');
      const contextmenuHandler =
        plugin.props.handleDOMEvents!['contextmenu']!.bind(plugin);

      const target = document.createElement('div');
      const event = new MouseEvent('contextmenu', { bubbles: true });
      Object.defineProperty(event, 'target', { value: target });

      const view = {
        state,
        posAtCoords: vi.fn(() => null),
      } as unknown as EditorView;

      const result = contextmenuHandler(view, event as unknown as PointerEvent);

      expect(result).toBe(false);
    });
  });

  describe('handleDOMEvents.touchstart', () => {
    it('should set up long-press timer on elementRef node', () => {
      vi.useFakeTimers();
      const { state, plugin } = createStateWithElementRef();
      const touchHandler =
        plugin.props.handleDOMEvents!['touchstart']!.bind(plugin);

      const dom = document.createElement('div');

      const view = {
        state,
        posAtCoords: vi.fn(() => ({ pos: 7, inside: -1 })),
        dom,
      } as unknown as EditorView;

      const touch = { clientX: 50, clientY: 100 };
      const event = {
        touches: [touch],
        preventDefault: vi.fn(),
      } as unknown as TouchEvent;

      touchHandler(view, event);

      // Before 500ms, onRefClick should NOT have been called
      expect(callbacks.onRefClick).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);

      expect(callbacks.onRefClick).toHaveBeenCalledWith(
        expect.objectContaining({
          elementId: 'test-id',
          nodePos: 7,
          isContextMenu: true,
        })
      );

      vi.useRealTimers();
    });

    it('should cancel long-press on touchend', () => {
      vi.useFakeTimers();
      const { state, plugin } = createStateWithElementRef();
      const touchHandler =
        plugin.props.handleDOMEvents!['touchstart']!.bind(plugin);

      const dom = document.createElement('div');

      const view = {
        state,
        posAtCoords: vi.fn(() => ({ pos: 7, inside: -1 })),
        dom,
      } as unknown as EditorView;

      const touch = { clientX: 50, clientY: 100 };
      const event = {
        touches: [touch],
        preventDefault: vi.fn(),
      } as unknown as TouchEvent;

      touchHandler(view, event);

      // Simulate touchend before 500ms
      dom.dispatchEvent(new Event('touchend'));
      vi.advanceTimersByTime(500);

      expect(callbacks.onRefClick).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should cancel long-press on touchmove', () => {
      vi.useFakeTimers();
      const { state, plugin } = createStateWithElementRef();
      const touchHandler =
        plugin.props.handleDOMEvents!['touchstart']!.bind(plugin);

      const dom = document.createElement('div');

      const view = {
        state,
        posAtCoords: vi.fn(() => ({ pos: 7, inside: -1 })),
        dom,
      } as unknown as EditorView;

      const touch = { clientX: 50, clientY: 100 };
      const event = {
        touches: [touch],
        preventDefault: vi.fn(),
      } as unknown as TouchEvent;

      touchHandler(view, event);

      dom.dispatchEvent(new Event('touchmove'));
      vi.advanceTimersByTime(500);

      expect(callbacks.onRefClick).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should return false when touch is not on elementRef', () => {
      const { state, plugin } = createStateWithPlugin('Hello world');
      const touchHandler =
        plugin.props.handleDOMEvents!['touchstart']!.bind(plugin);

      const dom = document.createElement('div');

      const view = {
        state,
        posAtCoords: vi.fn(() => ({ pos: 3, inside: -1 })),
        dom,
      } as unknown as EditorView;

      const touch = { clientX: 50, clientY: 100 };
      const event = {
        touches: [touch],
        preventDefault: vi.fn(),
      } as unknown as TouchEvent;

      const result = touchHandler(view, event);

      expect(result).toBe(false);
    });

    it('should return false for multi-touch events', () => {
      const { state, plugin } = createStateWithPlugin('Hello world');
      const touchHandler =
        plugin.props.handleDOMEvents!['touchstart']!.bind(plugin);

      const view = {
        state,
        dom: document.createElement('div'),
      } as unknown as EditorView;

      const event = {
        touches: [
          { clientX: 50, clientY: 100 },
          { clientX: 60, clientY: 110 },
        ],
        preventDefault: vi.fn(),
      } as unknown as TouchEvent;

      const result = touchHandler(view, event);

      expect(result).toBe(false);
    });

    it('should return false when posAtCoords returns null', () => {
      const { state, plugin } = createStateWithPlugin('Hello');
      const touchHandler =
        plugin.props.handleDOMEvents!['touchstart']!.bind(plugin);

      const view = {
        state,
        posAtCoords: vi.fn(() => null),
        dom: document.createElement('div'),
      } as unknown as EditorView;

      const touch = { clientX: 50, clientY: 100 };
      const event = {
        touches: [touch],
        preventDefault: vi.fn(),
      } as unknown as TouchEvent;

      const result = touchHandler(view, event);

      expect(result).toBe(false);
    });
  });

  describe('handleDOMEvents.mouseover', () => {
    it('should call onRefHover when hovering over an elementRef span', () => {
      const { state, plugin } = createStateWithElementRef();
      const mouseoverHandler =
        plugin.props.handleDOMEvents!['mouseover']!.bind(plugin);

      const refSpan = document.createElement('span');
      refSpan.setAttribute('data-element-ref', 'true');
      refSpan.getBoundingClientRect = vi.fn(() => ({
        left: 10,
        right: 50,
        top: 5,
        bottom: 20,
        width: 40,
        height: 15,
        x: 10,
        y: 5,
        toJSON: vi.fn(),
      }));

      const event = new MouseEvent('mouseover');
      Object.defineProperty(event, 'target', { value: refSpan });

      const view = {
        state,
        posAtDOM: vi.fn(() => 7),
      } as unknown as EditorView;

      const result = mouseoverHandler(view, event);

      expect(result).toBe(true);
      expect(callbacks.onRefHover).toHaveBeenCalledWith(
        expect.objectContaining({
          elementId: 'test-id',
          displayText: 'John Smith',
          originalName: 'John Smith',
          elementType: ElementType.Worldbuilding,
          position: { x: 30, y: 20 }, // left + width/2, bottom
        })
      );
    });

    it('should return false when target is not an elementRef span', () => {
      const { state, plugin } = createStateWithPlugin('Hello world');
      const mouseoverHandler =
        plugin.props.handleDOMEvents!['mouseover']!.bind(plugin);

      const target = document.createElement('div');
      const event = new MouseEvent('mouseover');
      Object.defineProperty(event, 'target', { value: target });

      const view = { state } as unknown as EditorView;

      const result = mouseoverHandler(view, event);

      expect(result).toBe(false);
    });

    it('should return false when onRefHover callback is not provided', () => {
      callbacks.onRefHover = undefined;
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
        plugins: [plugin],
      });
      const mouseoverHandler =
        plugin.props.handleDOMEvents!['mouseover']!.bind(plugin);

      const refSpan = document.createElement('span');
      refSpan.setAttribute('data-element-ref', 'true');
      const event = new MouseEvent('mouseover');
      Object.defineProperty(event, 'target', { value: refSpan });

      const view = { state } as unknown as EditorView;

      const result = mouseoverHandler(view, event);

      expect(result).toBe(false);
    });
  });

  describe('handleDOMEvents.mouseout', () => {
    it('should call onRefHoverEnd when leaving an elementRef span', () => {
      const { state, plugin } = createStateWithPlugin('Hello');
      const mouseoutHandler =
        plugin.props.handleDOMEvents!['mouseout']!.bind(plugin);

      const refSpan = document.createElement('span');
      refSpan.setAttribute('data-element-ref', 'true');

      const unrelatedTarget = document.createElement('div');

      const event = new MouseEvent('mouseout', {
        relatedTarget: unrelatedTarget,
      });
      Object.defineProperty(event, 'target', { value: refSpan });

      const view = { state } as unknown as EditorView;

      const result = mouseoutHandler(view, event);

      expect(result).toBe(false); // Returns false per implementation
      expect(callbacks.onRefHoverEnd).toHaveBeenCalled();
    });

    it('should not call onRefHoverEnd when moving to tooltip', () => {
      const { state, plugin } = createStateWithPlugin('Hello');
      const mouseoutHandler =
        plugin.props.handleDOMEvents!['mouseout']!.bind(plugin);

      const refSpan = document.createElement('span');
      refSpan.setAttribute('data-element-ref', 'true');

      const tooltip = document.createElement('div');
      tooltip.classList.add('element-ref-tooltip');

      const event = new MouseEvent('mouseout', { relatedTarget: tooltip });
      Object.defineProperty(event, 'target', { value: refSpan });

      const view = { state } as unknown as EditorView;

      const result = mouseoutHandler(view, event);

      expect(result).toBe(false);
      expect(callbacks.onRefHoverEnd).not.toHaveBeenCalled();
    });

    it('should return false when target is not an elementRef span', () => {
      const { state, plugin } = createStateWithPlugin('Hello');
      const mouseoutHandler =
        plugin.props.handleDOMEvents!['mouseout']!.bind(plugin);

      const target = document.createElement('div');
      const event = new MouseEvent('mouseout');
      Object.defineProperty(event, 'target', { value: target });

      const view = { state } as unknown as EditorView;

      const result = mouseoutHandler(view, event);

      expect(result).toBe(false);
      expect(callbacks.onRefHoverEnd).not.toHaveBeenCalled();
    });

    it('should return false when onRefHoverEnd callback is not provided', () => {
      callbacks.onRefHoverEnd = undefined;
      const plugin = createElementRefPlugin(callbacks);
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
        plugins: [plugin],
      });
      const mouseoutHandler =
        plugin.props.handleDOMEvents!['mouseout']!.bind(plugin);

      const refSpan = document.createElement('span');
      refSpan.setAttribute('data-element-ref', 'true');
      const event = new MouseEvent('mouseout');
      Object.defineProperty(event, 'target', { value: refSpan });

      const view = { state } as unknown as EditorView;

      const result = mouseoutHandler(view, event);

      expect(result).toBe(false);
    });
  });

  describe('props.decorations', () => {
    it('should return plugin decorations from state', () => {
      const { state, plugin } = createStateWithPlugin('Hello @', true, 7);

      const decorations = plugin.props.decorations!.call(plugin, state);

      expect(decorations).not.toBe(DecorationSet.empty);
    });

    it('should return empty DecorationSet when plugin state is missing', () => {
      // State without the plugin installed
      const state = EditorState.create({
        schema: testSchema,
        doc: testSchema.node('doc', null, [
          testSchema.node('paragraph', null, [testSchema.text('Hello')]),
        ]),
      });

      const plugin = createElementRefPlugin(callbacks);
      const decorations = plugin.props.decorations!.call(plugin, state);

      expect(decorations).toBe(DecorationSet.empty);
    });
  });
});
