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

    // Find the insertion point - it should be right after the parent node
    const insertionIndex = nodeIndex + 1;

    // Increment positions of all subsequent items at the new level
    for (let i = insertionIndex; i < this.sourceData.length; i++) {
      if (this.sourceData[i].level === node.level + 1) {
        this.sourceData[i].position++;
      } else if (this.sourceData[i].level <= node.level) {
        break;
      }
    }

    const newItem: ProjectElement = {
      id: 'new-item-' + Math.random().toString(36).substr(2, 9),
      name: 'New Item',
      type: 'ITEM',
      level: node.level + 1,
      position: 0, // New items always start at position 0
      expandable: false,
      expanded: true,
      visible: true,
    };

    // Insert the new item right after its parent
    this.sourceData.splice(insertionIndex, 0, newItem);
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
    if (nodeIndex < 0 || nodeIndex >= this.sourceData.length) {
      return [];
    }
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

      // Update positions of remaining siblings
      const siblings = this.getSiblings(nodeIndex);
      if (siblings.length > 0) {
        this.updateSiblingPositions(siblings);
      }

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

    // Get the subtree before moving
    const nodeSubtree = this.getNodeSubtree(nodeIndex);
    const nodeSubtreeLength = nodeSubtree.length;

    // Remove the subtree from its current position
    this.sourceData.splice(nodeIndex, nodeSubtreeLength);

    // Update the level of all nodes in the subtree
    const levelDifference = newLevel - node.level;
    nodeSubtree.forEach(n => {
      n.level += levelDifference;
    });

    // Adjust target index if needed
    if (targetIndex > nodeIndex) {
      targetIndex -= nodeSubtreeLength;
    }

    // Insert the subtree at the new position
    this.sourceData.splice(targetIndex, 0, ...nodeSubtree);

    // Update positions of all siblings at the new location
    const newSiblings = this.getSiblings(targetIndex);
    if (newSiblings.length > 0) {
      this.updateSiblingPositions(newSiblings);
    }

    // If we moved from a different parent, update positions of old siblings
    if (nodeIndex < targetIndex) {
      const oldSiblings = this.getSiblings(nodeIndex);
      if (oldSiblings.length > 0) {
        this.updateSiblingPositions(oldSiblings);
      }
    }

    this.updateVisibility();
  }

  /**
   * Gets all siblings of a node at the same level
   * @param nodeIndex Index of the node
   * @returns Array of sibling nodes including the target node
   */
  private getSiblings(nodeIndex: number): ProjectElement[] {
    if (nodeIndex < 0 || nodeIndex >= this.sourceData.length) {
      return [];
    }

    const node = this.sourceData[nodeIndex];
    const siblings: ProjectElement[] = [];

    // Look backwards for siblings
    for (let i = nodeIndex; i >= 0; i--) {
      if (this.sourceData[i].level === node.level) {
        siblings.unshift(this.sourceData[i]);
      } else if (this.sourceData[i].level < node.level) {
        break;
      }
    }

    // Look forwards for siblings
    for (let i = nodeIndex + 1; i < this.sourceData.length; i++) {
      if (this.sourceData[i].level === node.level) {
        siblings.push(this.sourceData[i]);
      } else if (this.sourceData[i].level < node.level) {
        break;
      }
    }

    return siblings;
  }

  /**
   * Updates positions for a group of sibling nodes
   * @param siblings Array of sibling nodes to update
   */
  private updateSiblingPositions(siblings: ProjectElement[]) {
    siblings.forEach((sibling, index) => {
      sibling.position = index;
    });
  }
}
