import { ProjectElement } from './project-element';

/**
 * Class for manipulating the tree structure.
 */
export class TreeManipulator {
  sourceData: ProjectElement[] = [];

  constructor(treeData?: ProjectElement[]) {
    if (treeData) {
      this.sourceData = JSON.parse(
        JSON.stringify(treeData)
      ) as ProjectElement[];
      this.updateVisibility();
    }
  }

  /**
   * Retrieves the manipulated tree data.
   * @returns The array of ProjectElements.
   */
  getData(): ProjectElement[] {
    return this.sourceData;
  }

  /**
   * Toggles the expanded state of a node.
   * @param node The project element to toggle.
   */
  toggleExpanded(node: ProjectElement) {
    const nodeIndex = this.sourceData.indexOf(node);
    if (nodeIndex === -1) {
      return;
    }
    this.sourceData[nodeIndex].expanded = !this.sourceData[nodeIndex].expanded;
    for (let i = nodeIndex + 1; i < this.sourceData.length; i++) {
      if (this.sourceData[i].level > node.level) {
        this.sourceData[i].visible = this.sourceData[nodeIndex].expanded;
      } else {
        break;
      }
    }
    this.updateVisibility();
  }

  /**
   * Updates the visibility of nodes based on their expanded state.
   */
  updateVisibility() {
    const stack: { level: number; expanded?: boolean }[] = [];
    for (const node of this.sourceData) {
      while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }
      node.visible = stack.every(parent => parent.expanded !== false);
      if (node.expandable) {
        stack.push({ level: node.level, expanded: node.expanded });
      }
    }
  }

  /**
   * Adds a new item as a child to the specified node.
   * @param node The parent node to add a new item to.
   */
  addItem(node: ProjectElement) {
    const nodeIndex = this.sourceData.indexOf(node);
    if (nodeIndex === -1) {
      return;
    }
    const newItem: ProjectElement = {
      id: 'new-item-' + Math.random().toString(36).substr(2, 9),
      name: 'New Item',
      type: 'ITEM',
      level: node.level + 1,
      position: 0,
      expandable: false,
      expanded: true,
      visible: true,
    };
    this.sourceData.splice(nodeIndex + 1, 0, newItem);
    this.updateVisibility();
  }

  /**
   * Retrieves the parent node of a given node.
   * @param node The node to find the parent of.
   * @returns The parent node, or null if not found.
   */
  getParentNode(node: ProjectElement): ProjectElement | null {
    const nodeIndex = this.sourceData.indexOf(node);
    for (let i = nodeIndex - 1; i >= 0; i--) {
      if (this.sourceData[i].level === node.level - 1) {
        return this.sourceData[i];
      }
    }
    return null;
  }

  /**
   * Retrieves the subtree of nodes starting from a given index.
   * @param nodeIndex The index of the starting node.
   * @returns An array of nodes in the subtree.
   */
  getNodeSubtree(nodeIndex: number): ProjectElement[] {
    const subtree = [this.sourceData[nodeIndex]];
    const nodeLevel = this.sourceData[nodeIndex].level;
    for (let i = nodeIndex + 1; i < this.sourceData.length; i++) {
      if (this.sourceData[i].level > nodeLevel) {
        subtree.push(this.sourceData[i]);
      } else {
        break;
      }
    }
    return subtree;
  }

  /**
   * Deletes a node and its subtree.
   * @param node The node to delete.
   */
  deleteNode(node: ProjectElement) {
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex !== -1) {
      const nodeSubtree = this.getNodeSubtree(nodeIndex);
      this.sourceData.splice(nodeIndex, nodeSubtree.length);
      this.updateVisibility();
    }
  }

  /**
   * Renames a node.
   * @param node The node to rename.
   * @param newName The new name for the node.
   */
  renameNode(node: ProjectElement, newName: string) {
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex !== -1) {
      this.sourceData[nodeIndex].name = newName.trim();
    }
  }

  /**
   * Moves a node to a new position and level.
   * @param node The node to move.
   * @param targetIndex The index to move the node to.
   * @param newLevel The new level of the node.
   */
  moveNode(node: ProjectElement, targetIndex: number, newLevel: number) {
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex === -1) {
      return;
    }
    const nodeSubtree = this.getNodeSubtree(nodeIndex);
    const nodeSubtreeLength = nodeSubtree.length;
    this.sourceData.splice(nodeIndex, nodeSubtreeLength);
    const levelDifference = newLevel - node.level;
    nodeSubtree.forEach(n => {
      n.level += levelDifference;
    });
    if (targetIndex > nodeIndex) {
      targetIndex -= nodeSubtreeLength;
    }
    this.sourceData.splice(targetIndex, 0, ...nodeSubtree);
    this.updateVisibility();
  }
}
