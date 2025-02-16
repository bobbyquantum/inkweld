import { ProjectElement } from '../../models/project-element';
import { TreeManipulator } from './tree-manipulator';

describe('TreeManipulator', () => {
  let manipulator: TreeManipulator;

  const createTestElement = (
    id: string,
    type: 'FOLDER' | 'ITEM' = 'FOLDER',
    level = 1,
    position = 0,
    name = `Test ${type} ${id}`
  ): ProjectElement => ({
    id,
    name,
    type,
    level,
    position,
    expandable: type === 'FOLDER',
    expanded: false,
    visible: true,
  });

  beforeEach(() => {
    const initialElements = [
      createTestElement('1', 'FOLDER', 1),
      createTestElement('2', 'ITEM', 2),
      createTestElement('3', 'FOLDER', 2),
    ];
    manipulator = new TreeManipulator(initialElements);
  });

  describe('getValidDropLevels', () => {
    it('should allow level 0 when no nodes', () => {
      const result = manipulator.getValidDropLevels(null, null);
      expect(result.levels).toEqual([0]);
      expect(result.defaultLevel).toBe(0);
    });

    it('should allow dropping inside a folder when nodes are at same level', () => {
      const folder: ProjectElement = {
        id: '1',
        name: 'Folder',
        type: 'FOLDER',
        level: 0,
        position: 0,
        expandable: true,
      };

      const item: ProjectElement = {
        id: '2',
        name: 'Item',
        type: 'ITEM',
        level: 0,
        position: 1,
      };

      const result = manipulator.getValidDropLevels(folder, item);
      expect(result.levels).toContain(0); // Same level
      expect(result.levels).toContain(1); // Inside folder
      expect(result.levels.length).toBe(2);
    });

    it('should not allow dropping inside an item when nodes are at same level', () => {
      const item1: ProjectElement = {
        id: '1',
        name: 'Item 1',
        type: 'ITEM',
        level: 0,
        position: 0,
      };

      const item2: ProjectElement = {
        id: '2',
        name: 'Item 2',
        type: 'ITEM',
        level: 0,
        position: 1,
      };

      const result = manipulator.getValidDropLevels(item1, item2);
      expect(result.levels).toEqual([0]); // Only same level allowed
    });

    it('should allow all levels between folder and deeper item', () => {
      const folder: ProjectElement = {
        id: '1',
        name: 'Folder',
        type: 'FOLDER',
        level: 0,
        position: 0,
        expandable: true,
      };

      const deeperItem: ProjectElement = {
        id: '2',
        name: 'Item',
        type: 'ITEM',
        level: 2,
        position: 1,
      };

      const result = manipulator.getValidDropLevels(folder, deeperItem);
      expect(result.levels).toContain(0); // Folder level
      expect(result.levels).toContain(1); // Inside folder
      expect(result.levels).toContain(2); // Deep item level
      expect(result.levels.length).toBe(3);
    });
  });

  describe('Node Creation', () => {
    it('should create new nodes with correct properties', () => {
      const parentNode = manipulator.getData()[0];

      const newItem = manipulator.addNode('ITEM', parentNode, 'Test Item');
      expect(newItem).toMatchObject({
        name: 'Test Item',
        type: 'ITEM',
        level: parentNode.level + 1,
        expandable: false,
      });

      const newFolder = manipulator.addNode(
        'FOLDER',
        parentNode,
        'Test Folder'
      );
      expect(newFolder).toMatchObject({
        name: 'Test Folder',
        type: 'FOLDER',
        level: parentNode.level + 1,
        expandable: true,
      });
    });
  });

  describe('Node Manipulation', () => {
    it('should handle node deletion with subtrees', () => {
      const parentNode = manipulator.getData()[0];
      const initialLength = manipulator.getData().length;

      manipulator.deleteNode(parentNode);

      expect(manipulator.getData().length).toBe(initialLength - 3);
    });

    it('should rename nodes', () => {
      const node = manipulator.getData()[0];
      const newName = 'Renamed Node';

      manipulator.renameNode(node, newName);

      expect(manipulator.getData()[0].name).toBe(newName);
    });

    it('should toggle node expansion', () => {
      const folder = manipulator.getData()[0];
      const initialState = folder.expanded;

      manipulator.toggleExpanded(folder);

      expect(folder.expanded).toBe(!initialState);
    });
  });

  describe('Tree Navigation', () => {
    it('should find parent nodes', () => {
      const child = manipulator.getData()[1];
      const parent = manipulator.getParentNode(child);

      expect(parent).toBeTruthy();
      expect(parent?.id).toBe('1');
    });

    it('should get node subtrees', () => {
      const subtree = manipulator.getNodeSubtree(0);

      expect(subtree.length).toBe(3);
      expect(subtree.map(node => node.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('Drag & Drop Operations', () => {
    it('should calculate valid drop levels', () => {
      const folder: ProjectElement = {
        id: '1',
        name: 'Folder',
        type: 'FOLDER',
        level: 2,
        position: 0,
        expandable: true,
      };

      const item: ProjectElement = {
        id: '2',
        name: 'Item',
        type: 'ITEM',
        level: 2,
        position: 1,
      };

      const result = manipulator.getValidDropLevels(folder, item);
      expect(result.levels).toContain(2); // Same level
      expect(result.levels).toContain(3); // Inside folder
      expect(result.levels.length).toBe(2);
    });

    it('should prevent dropping as child of item', () => {
      const itemNode = createTestElement('4', 'ITEM', 1);
      const { levels } = manipulator.getValidDropLevels(itemNode, null);

      expect(levels).not.toContain(2);
    });

    it('should validate drops', () => {
      const itemNode = createTestElement('6', 'ITEM', 2);
      const folderNode = createTestElement('7', 'FOLDER', 2);

      expect(manipulator.isValidDrop(itemNode, 3)).toBe(false);
      expect(manipulator.isValidDrop(folderNode, 3)).toBe(true);
    });

    it('should move nodes with their subtrees', () => {
      const node = manipulator.getData()[0];
      const initialLength = manipulator.getData().length;
      const newLevel = 2;
      const targetIndex = 2;

      manipulator.moveNode(node, targetIndex, newLevel);

      const movedNode = manipulator.getData().find(n => n.id === node.id);
      expect(movedNode?.level).toBe(newLevel);
      expect(manipulator.getData().length).toBe(initialLength);
    });
  });

  describe('Visibility Management', () => {
    it('should update visibility based on parent expansion', () => {
      const parent = manipulator.getData()[0];
      parent.expanded = true;
      manipulator.updateVisibility();

      const children = manipulator.getData().slice(1);
      expect(children.every(child => child.visible)).toBe(true);

      parent.expanded = false;
      manipulator.updateVisibility();

      expect(children.every(child => !child.visible)).toBe(true);
    });
  });
});
