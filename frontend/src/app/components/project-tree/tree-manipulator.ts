import { nanoid } from 'nanoid';

import { ProjectElement } from '../../models/project-element';
export interface ValidDropLevels {
  levels: number[];
  defaultLevel: number;
}

/**
 * Class for manipulating and validating tree operations.
 */
export class TreeManipulator {
  private sourceData: ProjectElement[] = [];

  constructor(treeData?: ProjectElement[]) {
    if (treeData) {
      this.sourceData = JSON.parse(
        JSON.stringify(treeData)
      ) as ProjectElement[];
      this.updateVisibility();
      this.updateGlobalPositions();
    }
  }

  // QUERYING METHODS

  getData(): ProjectElement[] {
    return this.sourceData;
  }

  getParentNode(node: ProjectElement): ProjectElement | null {
    const nodeIndex = this.sourceData.indexOf(node);
    for (let i = nodeIndex - 1; i >= 0; i--) {
      if (this.sourceData[i].level === node.level - 1) {
        return this.sourceData[i];
      }
    }
    return null;
  }

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

  // NODE CREATION METHODS

  createNode(
    type: 'ITEM' | 'FOLDER',
    parentNode: ProjectElement,
    name?: string
  ): ProjectElement {
    return {
      id: nanoid(),
      name: name || (type === 'ITEM' ? 'New Item' : 'New Folder'),
      type,
      level: parentNode.level + 1,
      position: 0,
      expandable: type === 'FOLDER',
      expanded: false,
      visible: true,
    };
  }

  addNode(
    type: 'ITEM' | 'FOLDER',
    parentNode: ProjectElement,
    name?: string
  ): ProjectElement {
    const nodeIndex = this.sourceData.indexOf(parentNode);
    if (nodeIndex === -1) return null!;

    const newNode = this.createNode(type, parentNode, name);

    // If adding to a folder, ensure it's expanded
    if (parentNode.expandable && !parentNode.expanded) {
      this.toggleExpanded(parentNode);
    }

    // Insert after parent node
    this.sourceData.splice(nodeIndex + 1, 0, newNode);
    this.updateVisibility();
    this.updateGlobalPositions();

    return newNode;
  }

  // NODE MODIFICATION METHODS

  toggleExpanded(node: ProjectElement) {
    const nodeIndex = this.sourceData.indexOf(node);
    if (nodeIndex === -1) return;

    this.sourceData[nodeIndex].expanded = !this.sourceData[nodeIndex].expanded;
    this.updateSubtreeVisibility(nodeIndex, node.level);
    this.updateVisibility();
  }

  renameNode(node: ProjectElement, newName: string) {
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex !== -1) {
      this.sourceData[nodeIndex].name = newName.trim();
    }
  }

  deleteNode(node: ProjectElement) {
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex !== -1) {
      const nodeSubtree = this.getNodeSubtree(nodeIndex);
      this.sourceData.splice(nodeIndex, nodeSubtree.length);
      this.updateGlobalPositions();
      this.updateVisibility();
    }
  }

  // DRAG & DROP OPERATIONS

  getValidDropLevels(
    nodeAbove: ProjectElement | null,
    nodeBelow: ProjectElement | null
  ): ValidDropLevels {
    const validLevels = new Set<number>();

    if (nodeAbove && nodeBelow) {
      if (nodeAbove.level < nodeBelow.level) {
        if (nodeAbove.expandable) {
          validLevels.add(nodeAbove.level + 1);
        }
        validLevels.add(nodeBelow.level);
      } else if (nodeAbove.level === nodeBelow.level) {
        validLevels.add(nodeAbove.level);
      } else {
        for (let level = nodeBelow.level; level <= nodeAbove.level; level++) {
          validLevels.add(level);
        }
      }
    } else if (nodeAbove && !nodeBelow) {
      for (let level = 1; level <= nodeAbove.level; level++) {
        validLevels.add(level);
      }
      if (nodeAbove.expandable) {
        validLevels.add(nodeAbove.level + 1);
      }
    } else if (!nodeAbove && nodeBelow) {
      validLevels.add(nodeBelow.level);
    } else {
      validLevels.add(1);
    }

    const levels = Array.from(validLevels).sort((a, b) => a - b);

    // Default level should be the first level in the array, or 1 if array is empty
    const defaultLevel = levels.length > 0 ? levels[0] : 1;
    return {
      levels,
      defaultLevel,
    };
  }

  getDropInsertIndex(
    nodeAbove: ProjectElement | null,
    currentLevel: number
  ): number {
    if (!nodeAbove) return 0;

    const nodeAboveIndex = this.sourceData.findIndex(
      n => n.id === nodeAbove.id
    );
    if (nodeAboveIndex === -1) return this.sourceData.length;

    if (currentLevel > nodeAbove.level) {
      return nodeAboveIndex + 1;
    }

    return nodeAboveIndex + this.getNodeSubtree(nodeAboveIndex).length;
  }

  isValidDrop(nodeAbove: ProjectElement | null, targetLevel: number): boolean {
    if (!nodeAbove) return targetLevel === 1;
    if (nodeAbove.type === 'ITEM' && targetLevel > nodeAbove.level) {
      return false;
    }
    if (nodeAbove.type === 'FOLDER' && targetLevel > nodeAbove.level + 1) {
      return false;
    }
    return true;
  }

  moveNode(node: ProjectElement, targetIndex: number, newLevel: number) {
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex === -1) return;

    const nodeSubtree = this.getNodeSubtree(nodeIndex);
    const nodeSubtreeLength = nodeSubtree.length;

    // Remove the subtree
    this.sourceData.splice(nodeIndex, nodeSubtreeLength);

    // Update levels
    const levelDifference = newLevel - node.level;
    nodeSubtree.forEach(n => {
      n.level += levelDifference;
    });

    // Adjust target index if needed
    if (targetIndex > nodeIndex) {
      targetIndex -= nodeSubtreeLength;
    }

    // Insert the subtree
    this.sourceData.splice(targetIndex, 0, ...nodeSubtree);

    this.updateGlobalPositions();
    this.updateVisibility();
  }

  // VISIBILITY & POSITION UPDATES

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

  private updateSubtreeVisibility(nodeIndex: number, nodeLevel: number) {
    for (let i = nodeIndex + 1; i < this.sourceData.length; i++) {
      if (this.sourceData[i].level > nodeLevel) {
        this.sourceData[i].visible = this.sourceData[nodeIndex].expanded;
      } else {
        break;
      }
    }
  }

  private updateGlobalPositions() {
    this.sourceData.forEach((node, index) => {
      node.position = index;
    });
  }
}
