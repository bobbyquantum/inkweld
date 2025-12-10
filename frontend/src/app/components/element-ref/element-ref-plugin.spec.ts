/**
 * Tests for Element Reference ProseMirror Plugin
 */
import { Schema } from 'prosemirror-model';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { DecorationSet, EditorView } from 'prosemirror-view';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementType } from '../../../api-client';
import { ElementRefNodeAttrs } from './element-ref.model';
import {
  cancelElementRef,
  createElementRefPlugin,
  deleteElementRef,
  ElementRefPluginCallbacks,
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
        elementType: ElementType.Character,
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
        elementType: ElementType.Character,
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
        elementType: ElementType.Character,
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
        elementType: ElementType.Character,
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
        elementType: ElementType.Character,
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
      elementType: ElementType.Character,
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
    expect(attrs['data-element-type']).toBe(ElementType.Character);
    expect(attrs['data-original-name']).toBe('John Smith');
    expect(attrs['data-relationship-id']).toBe('rel-1');
    expect(attrs['data-relationship-note']).toBe('Main character');
    expect(attrs['class']).toContain('element-ref');
    expect(attrs['class']).toContain('element-ref--character');
    expect(attrs['class']).toContain('element-ref--has-note');

    // Text content
    expect(domArray[2]).toBe('John Smith');
  });

  it('should add deleted class when elementId is missing', () => {
    const node = testSchema.nodes[ELEMENT_REF_NODE_NAME].create({
      elementId: '',
      elementType: ElementType.Character,
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
            'data-element-type': ElementType.Location,
            'data-original-name': 'Castle',
            'data-relationship-id': 'rel-2',
            'data-relationship-type': 'contains',
            'data-relationship-note': 'Setting',
          };
          return attrs[attr] || '';
        }),
        textContent: 'Castle Blackwood',
      } as unknown as HTMLElement;

      const parsedAttrs = (
        parseDOM.getAttrs as (dom: HTMLElement) => ElementRefNodeAttrs
      )(mockElement);

      expect(parsedAttrs.elementId).toBe('parsed-id');
      expect(parsedAttrs.elementType).toBe(ElementType.Location);
      expect(parsedAttrs.displayText).toBe('Castle Blackwood');
      expect(parsedAttrs.originalName).toBe('Castle');
      expect(parsedAttrs.relationshipId).toBe('rel-2');
      expect(parsedAttrs.relationshipTypeId).toBe('contains');
      expect(parsedAttrs.relationshipNote).toBe('Setting');
    });
  });
});
