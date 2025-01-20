import { ProjectElement } from './project-element';
import { TreeManipulator } from './tree-manipulator';

describe('TreeManipulator', () => {
  let treeManipulator: TreeManipulator;

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
    treeManipulator = new TreeManipulator(initialElements);
  });

  describe('Node Creation', () => {
    it('should create new nodes with correct properties', () => {
      const parentNode = treeManipulator.getData()[0];

      const newItem = treeManipulator.addNode('ITEM', parentNode, 'Test Item');
      expect(newItem).toMatchObject({
        name: 'Test Item',
        type: 'ITEM',
        level: parentNode.level + 1,
        expandable: false,
      });

      const newFolder = treeManipulator.addNode(
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
      const parentNode = treeManipulator.getData()[0];
      const initialLength = treeManipulator.getData().length;

      treeManipulator.deleteNode(parentNode);

      expect(treeManipulator.getData().length).toBe(initialLength - 3);
    });

    it('should rename nodes', () => {
      const node = treeManipulator.getData()[0];
      const newName = 'Renamed Node';

      treeManipulator.renameNode(node, newName);

      expect(treeManipulator.getData()[0].name).toBe(newName);
    });

    it('should toggle node expansion', () => {
      const folder = treeManipulator.getData()[0];
      const initialState = folder.expanded;

      treeManipulator.toggleExpanded(folder);

      expect(folder.expanded).toBe(!initialState);
    });
  });

  describe('Tree Navigation', () => {
    it('should find parent nodes', () => {
      const child = treeManipulator.getData()[1];
      const parent = treeManipulator.getParentNode(child);

      expect(parent).toBeTruthy();
      expect(parent?.id).toBe('1');
    });

    it('should get node subtrees', () => {
      const subtree = treeManipulator.getNodeSubtree(0);

      expect(subtree.length).toBe(3);
      expect(subtree.map(node => node.id)).toEqual(['1', '2', '3']);
    });
  });

  describe('Drag & Drop Operations', () => {
    it('should calculate valid drop levels', () => {
      const nodeAbove = createTestElement('4', 'FOLDER', 2);
      const nodeBelow = createTestElement('5', 'FOLDER', 2); // Same level as nodeAbove

      const { levels, defaultLevel } = treeManipulator.getValidDropLevels(
        nodeAbove,
        nodeBelow
      );

      expect(levels).toEqual([2]); // Should only contain same level
      expect(defaultLevel).toBe(2);
    });

    it('should allow dropping as child of folder', () => {
      const folderNode = createTestElement('4', 'FOLDER', 1);
      const { levels } = treeManipulator.getValidDropLevels(folderNode, null);

      expect(levels).toContain(2);
    });

    it('should prevent dropping as child of item', () => {
      const itemNode = createTestElement('4', 'ITEM', 1);
      const { levels } = treeManipulator.getValidDropLevels(itemNode, null);

      expect(levels).not.toContain(2);
    });

    it('should validate drops', () => {
      const itemNode = createTestElement('6', 'ITEM', 2);
      const folderNode = createTestElement('7', 'FOLDER', 2);

      expect(treeManipulator.isValidDrop(itemNode, 3)).toBe(false);
      expect(treeManipulator.isValidDrop(folderNode, 3)).toBe(true);
    });

    it('should calculate correct insertion indices', () => {
      const nodeAbove = treeManipulator.getData()[0];

      const indexAtSameLevel = treeManipulator.getDropInsertIndex(nodeAbove, 1);
      const indexAsChild = treeManipulator.getDropInsertIndex(nodeAbove, 2);

      expect(indexAtSameLevel).toBeGreaterThan(indexAsChild);
    });

    it('should move nodes with their subtrees', () => {
      const node = treeManipulator.getData()[0];
      const initialLength = treeManipulator.getData().length;
      const newLevel = 2;
      const targetIndex = 2;

      treeManipulator.moveNode(node, targetIndex, newLevel);

      const movedNode = treeManipulator.getData().find(n => n.id === node.id);
      expect(movedNode?.level).toBe(newLevel);
      expect(treeManipulator.getData().length).toBe(initialLength);
    });
  });

  describe('Visibility Management', () => {
    it('should update visibility based on parent expansion', () => {
      const parent = treeManipulator.getData()[0];
      parent.expanded = true;

      treeManipulator.updateVisibility();

      const children = treeManipulator.getData().slice(1);
      expect(children.every(child => child.visible)).toBe(true);

      parent.expanded = false;
      treeManipulator.updateVisibility();

      expect(children.every(child => !child.visible)).toBe(true);
    });
  });
});
