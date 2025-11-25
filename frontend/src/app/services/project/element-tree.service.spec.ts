import { TestBed } from '@angular/core/testing';
import { Element, ElementType } from '@inkweld/index';

import { ElementTreeService } from './element-tree.service';

describe('ElementTreeService', () => {
  let service: ElementTreeService;

  // Helper to create test elements with all required properties
  const createElement = (
    id: string,
    name: string,
    level: number,
    type: ElementType = ElementType.Item,
    order = 0
  ): Element => ({
    id,
    name,
    level,
    type,
    order,
    parentId: null,
    expandable: type === ElementType.Folder,
    version: 1,
    metadata: {},
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ElementTreeService],
    });
    service = TestBed.inject(ElementTreeService);
  });

  describe('isValidDrop', () => {
    describe('when nodeAbove is null', () => {
      it('should allow level 0 (root level)', () => {
        expect(service.isValidDrop(null, 0)).toBe(true);
      });

      it('should allow level 1', () => {
        expect(service.isValidDrop(null, 1)).toBe(true);
      });

      it('should not allow level 2 or deeper', () => {
        expect(service.isValidDrop(null, 2)).toBe(false);
        expect(service.isValidDrop(null, 3)).toBe(false);
      });
    });

    describe('when nodeAbove is an Item', () => {
      const item = createElement('1', 'Item', 1, ElementType.Item);

      it('should allow dropping at same level', () => {
        expect(service.isValidDrop(item, 1)).toBe(true);
      });

      it('should allow dropping at shallower level', () => {
        expect(service.isValidDrop(item, 0)).toBe(true);
      });

      it('should not allow dropping deeper (items cannot have children)', () => {
        expect(service.isValidDrop(item, 2)).toBe(false);
        expect(service.isValidDrop(item, 3)).toBe(false);
      });
    });

    describe('when nodeAbove is a Folder', () => {
      const folder = createElement('1', 'Folder', 1, ElementType.Folder);

      it('should allow dropping at same level', () => {
        expect(service.isValidDrop(folder, 1)).toBe(true);
      });

      it('should allow dropping one level deeper (as child)', () => {
        expect(service.isValidDrop(folder, 2)).toBe(true);
      });

      it('should not allow dropping more than one level deeper', () => {
        expect(service.isValidDrop(folder, 3)).toBe(false);
      });

      it('should allow dropping at shallower level', () => {
        expect(service.isValidDrop(folder, 0)).toBe(true);
      });
    });

    describe('negative levels', () => {
      it('should not allow negative levels', () => {
        const item = createElement('1', 'Item', 0, ElementType.Item);
        expect(service.isValidDrop(item, -1)).toBe(false);
        expect(service.isValidDrop(null, -1)).toBe(false);
      });
    });
  });

  describe('getValidDropLevels', () => {
    describe('when both nodes exist', () => {
      it('should return nodeBelow level when nodeAbove is at lower level and is a folder with immediate child', () => {
        const folder = createElement('1', 'Folder', 0, ElementType.Folder);
        const child = createElement('2', 'Child', 1, ElementType.Item);

        const result = service.getValidDropLevels(folder, child);

        expect(result.levels).toEqual([1]);
        expect(result.defaultLevel).toBe(1);
      });

      it('should return multiple levels when folder has gap to nodeBelow', () => {
        const folder = createElement('1', 'Folder', 0, ElementType.Folder);
        const deepChild = createElement('2', 'Deep', 2, ElementType.Item);

        const result = service.getValidDropLevels(folder, deepChild);

        expect(result.levels).toEqual([0, 1]);
        expect(result.defaultLevel).toBe(0);
      });

      it('should return nodeBelow level when nodeAbove is item at lower level', () => {
        const item = createElement('1', 'Item', 0, ElementType.Item);
        const other = createElement('2', 'Other', 1, ElementType.Item);

        const result = service.getValidDropLevels(item, other);

        expect(result.levels).toEqual([1]);
      });

      it('should return same level when nodes are at equal level', () => {
        const item1 = createElement('1', 'Item1', 1, ElementType.Item);
        const item2 = createElement('2', 'Item2', 1, ElementType.Item);

        const result = service.getValidDropLevels(item1, item2);

        expect(result.levels).toEqual([1]);
        expect(result.defaultLevel).toBe(1);
      });

      it('should allow inside folder when nodes at same level and above is folder', () => {
        const folder = createElement('1', 'Folder', 1, ElementType.Folder);
        const item = createElement('2', 'Item', 1, ElementType.Item);

        const result = service.getValidDropLevels(folder, item);

        expect(result.levels).toContain(1);
        expect(result.levels).toContain(2);
      });

      it('should return all levels between nodes when above is higher than below', () => {
        const deepItem = createElement('1', 'Deep', 3, ElementType.Item);
        const rootItem = createElement('2', 'Root', 0, ElementType.Item);

        const result = service.getValidDropLevels(deepItem, rootItem);

        expect(result.levels).toEqual([0, 1, 2, 3]);
        expect(result.defaultLevel).toBe(0);
      });
    });

    describe('when only nodeAbove exists (at end of list)', () => {
      it('should return all levels from 0 to nodeAbove level', () => {
        const item = createElement('1', 'Item', 2, ElementType.Item);

        const result = service.getValidDropLevels(item, null);

        expect(result.levels).toEqual([0, 1, 2]);
      });

      it('should include one deeper level if nodeAbove is folder', () => {
        const folder = createElement('1', 'Folder', 2, ElementType.Folder);

        const result = service.getValidDropLevels(folder, null);

        expect(result.levels).toEqual([0, 1, 2, 3]);
      });
    });

    describe('when only nodeBelow exists (at start of list)', () => {
      it('should return only nodeBelow level', () => {
        const item = createElement('1', 'Item', 1, ElementType.Item);

        const result = service.getValidDropLevels(null, item);

        expect(result.levels).toEqual([1]);
        expect(result.defaultLevel).toBe(1);
      });
    });

    describe('when neither node exists', () => {
      it('should return only root level', () => {
        const result = service.getValidDropLevels(null, null);

        expect(result.levels).toEqual([0]);
        expect(result.defaultLevel).toBe(0);
      });
    });
  });

  describe('getDropInsertIndex', () => {
    const elements = [
      createElement('1', 'Root Folder', 0, ElementType.Folder, 0),
      createElement('2', 'Child 1', 1, ElementType.Item, 1),
      createElement('3', 'Child 2', 1, ElementType.Item, 2),
      createElement('4', 'Root Item', 0, ElementType.Item, 3),
    ];

    it('should return 0 when nodeAbove is null', () => {
      expect(service.getDropInsertIndex(elements, null, 0)).toBe(0);
    });

    it('should return array length when nodeAbove is not found', () => {
      const unknown = createElement('999', 'Unknown', 0);
      expect(service.getDropInsertIndex(elements, unknown, 0)).toBe(4);
    });

    it('should return index after nodeAbove when dropping deeper', () => {
      // Dropping inside the folder at level 1
      expect(service.getDropInsertIndex(elements, elements[0], 1)).toBe(1);
    });

    it('should return index after subtree when dropping at same level', () => {
      // Dropping after the folder (and its children) at level 0
      // Subtree has 3 elements: Root Folder + Child 1 + Child 2 = indices 0,1,2
      // So insert index = 0 + 3 = 3
      expect(service.getDropInsertIndex(elements, elements[0], 0)).toBe(3);
    });

    it('should return index after subtree when dropping at shallower level', () => {
      // Dropping after Child 1 at level 0 should skip to after the subtree
      expect(service.getDropInsertIndex(elements, elements[1], 0)).toBe(2);
    });
  });

  describe('getSubtree', () => {
    const elements = [
      createElement('1', 'Root Folder', 0, ElementType.Folder, 0),
      createElement('2', 'Child 1', 1, ElementType.Item, 1),
      createElement('3', 'Nested Folder', 1, ElementType.Folder, 2),
      createElement('4', 'Grandchild', 2, ElementType.Item, 3),
      createElement('5', 'Root Item', 0, ElementType.Item, 4),
    ];

    it('should return only the element when it has no children', () => {
      const subtree = service.getSubtree(elements, 4);
      expect(subtree).toEqual([elements[4]]);
    });

    it('should return element and all nested children', () => {
      const subtree = service.getSubtree(elements, 0);
      expect(subtree.length).toBe(4);
      expect(subtree.map(e => e.id)).toEqual(['1', '2', '3', '4']);
    });

    it('should stop at same level element', () => {
      const subtree = service.getSubtree(elements, 2);
      expect(subtree.length).toBe(2);
      expect(subtree.map(e => e.id)).toEqual(['3', '4']);
    });

    it('should return empty array for invalid index', () => {
      expect(service.getSubtree(elements, -1)).toEqual([]);
      expect(service.getSubtree(elements, 100)).toEqual([]);
    });
  });

  describe('recomputeOrder', () => {
    it('should assign sequential order starting from 0', () => {
      const elements = [
        createElement('1', 'A', 0, ElementType.Item, 5),
        createElement('2', 'B', 0, ElementType.Item, 10),
        createElement('3', 'C', 0, ElementType.Item, 15),
      ];

      const result = service.recomputeOrder(elements);

      expect(result[0].order).toBe(0);
      expect(result[1].order).toBe(1);
      expect(result[2].order).toBe(2);
    });

    it('should preserve other element properties', () => {
      const elements = [createElement('1', 'Test', 2, ElementType.Folder, 99)];

      const result = service.recomputeOrder(elements);

      expect(result[0].id).toBe('1');
      expect(result[0].name).toBe('Test');
      expect(result[0].level).toBe(2);
      expect(result[0].type).toBe(ElementType.Folder);
    });

    it('should return empty array for empty input', () => {
      expect(service.recomputeOrder([])).toEqual([]);
    });
  });

  describe('moveElement', () => {
    const createTree = () => [
      createElement('1', 'Folder A', 0, ElementType.Folder, 0),
      createElement('2', 'Child A1', 1, ElementType.Item, 1),
      createElement('3', 'Child A2', 1, ElementType.Item, 2),
      createElement('4', 'Folder B', 0, ElementType.Folder, 3),
      createElement('5', 'Child B1', 1, ElementType.Item, 4),
    ];

    it('should return original array if element not found', () => {
      const elements = createTree();
      const result = service.moveElement(elements, 'nonexistent', 0, 0);
      expect(result).toEqual(elements);
    });

    it('should move single element to new position', () => {
      const elements = createTree();
      // Move Child A1 (id '2', index 1) to after Folder B's children
      // After removing element at index 1, indices shift:
      // ['1','3','4','5'] - want to insert after '5' which is now index 3
      // So target index should be 4 to insert at end
      const result = service.moveElement(elements, '2', 5, 1);

      const ids = result.map(e => e.id);
      expect(ids).toEqual(['1', '3', '4', '5', '2']);
    });

    it('should move element and update its level', () => {
      const elements = createTree();
      // Move Child A1 to be a root item
      const result = service.moveElement(elements, '2', 0, 0);

      const movedElement = result.find(e => e.id === '2');
      expect(movedElement?.level).toBe(0);
    });

    it('should move folder with all its children', () => {
      const elements = createTree();
      // Move Folder A (with children) to the end
      const result = service.moveElement(elements, '1', 5, 0);

      const ids = result.map(e => e.id);
      expect(ids).toEqual(['4', '5', '1', '2', '3']);
    });

    it('should update children levels when moving folder to new level', () => {
      const elements = createTree();
      // Move Folder A inside Folder B (level 1)
      const result = service.moveElement(elements, '1', 4, 1);

      // Folder A should be level 1, children should be level 2
      const folderA = result.find(e => e.id === '1');
      const childA1 = result.find(e => e.id === '2');
      const childA2 = result.find(e => e.id === '3');

      expect(folderA?.level).toBe(1);
      expect(childA1?.level).toBe(2);
      expect(childA2?.level).toBe(2);
    });

    it('should recompute order after move', () => {
      const elements = createTree();
      const result = service.moveElement(elements, '2', 4, 1);

      // All order values should be sequential
      result.forEach((el, index) => {
        expect(el.order).toBe(index);
      });
    });
  });

  describe('findParent', () => {
    const elements = [
      createElement('1', 'Root', 0, ElementType.Folder, 0),
      createElement('2', 'Child', 1, ElementType.Folder, 1),
      createElement('3', 'Grandchild', 2, ElementType.Item, 2),
      createElement('4', 'Another Root', 0, ElementType.Item, 3),
    ];

    it('should return null for root level element', () => {
      expect(service.findParent(elements, 0)).toBeNull();
      expect(service.findParent(elements, 3)).toBeNull();
    });

    it('should find immediate parent', () => {
      const parent = service.findParent(elements, 1);
      expect(parent?.id).toBe('1');
    });

    it('should find parent for deeply nested element', () => {
      const parent = service.findParent(elements, 2);
      expect(parent?.id).toBe('2');
    });

    it('should return null for invalid index', () => {
      expect(service.findParent(elements, -1)).toBeNull();
      expect(service.findParent(elements, 100)).toBeNull();
    });
  });

  describe('getAncestors', () => {
    const elements = [
      createElement('1', 'Root', 0, ElementType.Folder, 0),
      createElement('2', 'Child', 1, ElementType.Folder, 1),
      createElement('3', 'Grandchild', 2, ElementType.Folder, 2),
      createElement('4', 'Great-grandchild', 3, ElementType.Item, 3),
    ];

    it('should return empty array for root element', () => {
      const ancestors = service.getAncestors(elements, 0);
      expect(ancestors).toEqual([]);
    });

    it('should return single parent for first-level element', () => {
      const ancestors = service.getAncestors(elements, 1);
      expect(ancestors.length).toBe(1);
      expect(ancestors[0].id).toBe('1');
    });

    it('should return all ancestors in order from parent to root', () => {
      const ancestors = service.getAncestors(elements, 3);
      expect(ancestors.length).toBe(3);
      expect(ancestors.map(a => a.id)).toEqual(['3', '2', '1']);
    });
  });

  describe('isDescendantOf', () => {
    const elements = [
      createElement('1', 'Root', 0, ElementType.Folder, 0),
      createElement('2', 'Child', 1, ElementType.Folder, 1),
      createElement('3', 'Grandchild', 2, ElementType.Item, 2),
      createElement('4', 'Another Root', 0, ElementType.Item, 3),
    ];

    it('should return true for direct child', () => {
      expect(service.isDescendantOf(elements, '2', '1')).toBe(true);
    });

    it('should return true for nested descendant', () => {
      expect(service.isDescendantOf(elements, '3', '1')).toBe(true);
    });

    it('should return false for non-descendant', () => {
      expect(service.isDescendantOf(elements, '4', '1')).toBe(false);
    });

    it('should return false for same element', () => {
      expect(service.isDescendantOf(elements, '1', '1')).toBe(false);
    });

    it('should return false for ancestor (reverse relationship)', () => {
      expect(service.isDescendantOf(elements, '1', '2')).toBe(false);
    });

    it('should return false if descendant not found', () => {
      expect(service.isDescendantOf(elements, 'nonexistent', '1')).toBe(false);
    });
  });
});
