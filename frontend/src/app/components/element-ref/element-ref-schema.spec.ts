/**
 * Element Reference Schema Tests
 */

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';

import { ElementType } from '../../../api-client';
import {
  ELEMENT_REF_NODE_NAME,
  elementRefNodeSpec,
  elementRefSchemaExtension,
  elementRefStyles,
} from './element-ref-schema';

describe('element-ref-schema', () => {
  describe('elementRefNodeSpec', () => {
    describe('attributes', () => {
      it('should have correct default values', () => {
        const attrs = elementRefNodeSpec.attrs as Record<
          string,
          { default: unknown }
        >;
        expect(attrs['elementId'].default).toBeNull();
        expect(attrs['elementType'].default).toBeNull();
        expect(attrs['displayText'].default).toBe('');
        expect(attrs['originalName'].default).toBe('');
        expect(attrs['relationshipId'].default).toBeNull();
        expect(attrs['relationshipTypeId'].default).toBe('referenced-in');
        expect(attrs['relationshipNote'].default).toBeNull();
      });

      it('should be inline and atomic', () => {
        expect(elementRefNodeSpec.inline).toBe(true);
        expect(elementRefNodeSpec.atom).toBe(true);
        expect(elementRefNodeSpec.group).toBe('inline');
      });
    });

    describe('parseDOM', () => {
      it('should have parseDOM configuration', () => {
        expect(elementRefNodeSpec.parseDOM).toBeDefined();
        expect(elementRefNodeSpec.parseDOM!.length).toBeGreaterThan(0);
      });

      it('should parse element ref from DOM', () => {
        const getAttrs = elementRefNodeSpec.parseDOM![0].getAttrs as (
          dom: HTMLElement
        ) => Record<string, unknown>;

        const mockElement = document.createElement('span');
        mockElement.setAttribute('data-element-ref', 'true');
        mockElement.setAttribute('data-element-id', 'test-id');
        mockElement.setAttribute('data-element-type', ElementType.Character);
        mockElement.setAttribute('data-original-name', 'Original Name');
        mockElement.setAttribute('data-relationship-id', 'rel-123');
        mockElement.setAttribute('data-relationship-type', 'appears-in');
        mockElement.setAttribute('data-relationship-note', 'A note');
        mockElement.textContent = 'Display Text';

        const attrs = getAttrs(mockElement);

        expect(attrs['elementId']).toBe('test-id');
        expect(attrs['elementType']).toBe(ElementType.Character);
        expect(attrs['displayText']).toBe('Display Text');
        expect(attrs['originalName']).toBe('Original Name');
        expect(attrs['relationshipId']).toBe('rel-123');
        expect(attrs['relationshipTypeId']).toBe('appears-in');
        expect(attrs['relationshipNote']).toBe('A note');
      });

      it('should handle missing attributes with defaults', () => {
        const getAttrs = elementRefNodeSpec.parseDOM![0].getAttrs as (
          dom: HTMLElement
        ) => Record<string, unknown>;

        const mockElement = document.createElement('span');
        mockElement.setAttribute('data-element-ref', 'true');

        const attrs = getAttrs(mockElement);

        expect(attrs['elementId']).toBe('');
        expect(attrs['elementType']).toBeNull();
        expect(attrs['displayText']).toBe('');
        expect(attrs['originalName']).toBe('');
        expect(attrs['relationshipId']).toBeUndefined();
        expect(attrs['relationshipTypeId']).toBe('referenced-in');
        expect(attrs['relationshipNote']).toBeUndefined();
      });
    });

    describe('toDOM', () => {
      const createMockNode = (attrs: Record<string, unknown>) => ({
        attrs,
      });

      // Helper to cast DOMOutputSpec to array for testing
      const getResult = (node: {
        attrs: Record<string, unknown>;
      }): unknown[] => {
        return elementRefNodeSpec.toDOM!(
          node as unknown as ProseMirrorNode
        ) as unknown as unknown[];
      };

      it('should generate DOM for complete element ref', () => {
        const node = createMockNode({
          elementId: 'test-id',
          elementType: ElementType.Character,
          displayText: 'Test Character',
          originalName: 'Test Character',
          relationshipId: 'rel-123',
          relationshipTypeId: 'appears-in',
          relationshipNote: 'An important note',
        });

        const result = getResult(node);

        expect(result[0]).toBe('span');
        expect(result[2]).toBe('Test Character');

        const domAttrs = result[1] as Record<string, string>;
        expect(domAttrs['data-element-ref']).toBe('true');
        expect(domAttrs['data-element-id']).toBe('test-id');
        expect(domAttrs['data-element-type']).toBe(ElementType.Character);
        expect(domAttrs['data-original-name']).toBe('Test Character');
        expect(domAttrs['data-relationship-id']).toBe('rel-123');
        expect(domAttrs['data-relationship-type']).toBe('appears-in');
        expect(domAttrs['data-relationship-note']).toBe('An important note');
        expect(domAttrs['class']).toContain('element-ref');
        expect(domAttrs['class']).toContain('element-ref--character');
        expect(domAttrs['class']).toContain('element-ref--has-note');
        expect(domAttrs['aria-label']).toContain('Test Character');
        expect(domAttrs['aria-label']).toContain('Character');
        expect(domAttrs['aria-label']).toContain('An important note');
      });

      it('should show deleted class when elementId is null', () => {
        const node = createMockNode({
          elementId: null,
          elementType: ElementType.Location,
          displayText: 'Deleted Ref',
        });

        const result = getResult(node);
        const domAttrs = result[1] as Record<string, string>;

        expect(domAttrs['class']).toContain('element-ref--deleted');
      });

      it('should show fallback text when displayText is empty', () => {
        const node = createMockNode({
          elementId: 'test-id',
          elementType: ElementType.Item,
          displayText: '',
        });

        const result = getResult(node);

        expect(result[2]).toBe('???');
      });

      it('should handle missing elementType', () => {
        const node = createMockNode({
          elementId: 'test-id',
          elementType: null,
          displayText: 'Test',
        });

        const result = getResult(node);
        const domAttrs = result[1] as Record<string, string>;

        expect(domAttrs['class']).toContain('element-ref--unknown');
        expect(domAttrs['data-element-type']).toBe('');
      });

      it('should not include optional data attributes when not provided', () => {
        const node = createMockNode({
          elementId: 'test-id',
          elementType: ElementType.Folder,
          displayText: 'Test Folder',
          relationshipId: null,
          relationshipNote: null,
        });

        const result = getResult(node);
        const domAttrs = result[1] as Record<string, string>;

        expect(domAttrs['data-relationship-id']).toBeUndefined();
        expect(domAttrs['data-relationship-note']).toBeUndefined();
      });

      it('should build aria-label with displayText only', () => {
        const node = createMockNode({
          elementId: 'test-id',
          elementType: null,
          displayText: 'Just Display',
          relationshipNote: null,
        });

        const result = getResult(node);
        const domAttrs = result[1] as Record<string, string>;

        expect(domAttrs['aria-label']).toBe('Just Display');
      });

      it('should build aria-label with displayText and type', () => {
        const node = createMockNode({
          elementId: 'test-id',
          elementType: ElementType.Character,
          displayText: 'My Character',
          relationshipNote: null,
        });

        const result = getResult(node);
        const domAttrs = result[1] as Record<string, string>;

        // Type is included as-is (e.g., "CHARACTER") not formatted
        expect(domAttrs['aria-label']).toBe(
          `My Character (${ElementType.Character})`
        );
      });

      it('should build aria-label fallback when all empty', () => {
        const node = createMockNode({
          elementId: 'test-id',
          elementType: null,
          displayText: '',
          relationshipNote: null,
        });

        const result = getResult(node);
        const domAttrs = result[1] as Record<string, string>;

        expect(domAttrs['aria-label']).toBe('Element reference');
      });

      it('should have correct ARIA attributes', () => {
        const node = createMockNode({
          elementId: 'test-id',
          elementType: ElementType.Item,
          displayText: 'Test',
        });

        const result = getResult(node);
        const domAttrs = result[1] as Record<string, string>;

        expect(domAttrs['role']).toBe('link');
        expect(domAttrs['tabindex']).toBe('0');
        expect(domAttrs['contenteditable']).toBe('false');
      });
    });
  });

  describe('exports', () => {
    it('should export ELEMENT_REF_NODE_NAME constant', () => {
      expect(ELEMENT_REF_NODE_NAME).toBe('elementRef');
    });

    it('should export elementRefSchemaExtension', () => {
      expect(elementRefSchemaExtension).toBeDefined();
      expect(elementRefSchemaExtension.nodes).toBeDefined();
      expect(elementRefSchemaExtension.nodes.elementRef).toBe(
        elementRefNodeSpec
      );
    });

    it('should export elementRefStyles', () => {
      expect(elementRefStyles).toBeDefined();
      expect(typeof elementRefStyles).toBe('string');
      expect(elementRefStyles).toContain('.element-ref');
      expect(elementRefStyles).toContain('.element-ref--character');
      expect(elementRefStyles).toContain('.element-ref--location');
      expect(elementRefStyles).toContain('.element-ref--deleted');
      expect(elementRefStyles).toContain('.element-ref--has-note');
    });
  });
});
