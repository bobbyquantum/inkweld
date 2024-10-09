import { Component, ViewChild, ElementRef, Input, OnInit } from '@angular/core';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import {
  CdkDragDrop,
  DragDropModule,
  CdkDragMove,
  CdkDrag,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ArrayDataSource } from '@angular/cdk/collections';

export interface ProjectElement {
  id: string;
  name: string;
  children?: ProjectElement[];
  type: 'folder' | 'item';
  level: number;
  expandable?: boolean;
  expanded?: boolean;
  visible?: boolean;
}

@Component({
  standalone: true,
  imports: [MatTreeModule, DragDropModule, MatIconModule, MatButtonModule],
  selector: 'app-project-tree',
  templateUrl: './project-tree.component.html',
  styleUrls: ['./project-tree.component.scss'],
})
export class ProjectTreeComponent implements OnInit {
  @Input() treeData: ProjectElement[] = [];

  sourceData: ProjectElement[] = [];

  @ViewChild('tree')
  treeEl!: MatTree<ProjectElement>;

  @ViewChild('treeContainer', { static: true })
  treeContainer!: ElementRef;

  dataSource!: ArrayDataSource<ProjectElement>;

  currentDropLevel = 0;
  draggedNode: ProjectElement | null = null;
  targetNode: ProjectElement | null = null;

  ngOnInit() {
    this.sourceData = JSON.parse(JSON.stringify(this.treeData));
    this.updateDataSource();
  }

  updateDataSource() {
    this.dataSource = new ArrayDataSource<ProjectElement>(
      this.sourceData.filter(x => x.visible)
    );
  }

  levelAccessor(dataNode: ProjectElement): number {
    return dataNode.level;
  }

  hasChild = (_: number, node: ProjectElement) => node.expandable;

  parentExpanded = (_: number, node: ProjectElement) => {
    return this.getParentNode(node)?.expanded;
  };

  toggleExpanded(node: ProjectElement) {
    const nodeIndex = this.sourceData.indexOf(node);
    this.sourceData[nodeIndex].expanded = !this.sourceData[nodeIndex].expanded;
    for (let i = nodeIndex + 1; i < this.sourceData.length; i++) {
      if (this.sourceData[i].level > node.level) {
        this.sourceData[i].visible = this.sourceData[nodeIndex].expanded;
      } else {
        break;
      }
    }
    this.updateDataSource();
  }

  getParentNode(node: ProjectElement) {
    const nodeIndex = this.sourceData.indexOf(node);
    for (let i = nodeIndex - 1; i >= 0; i--) {
      if (this.sourceData[i].level === node.level - 1) {
        return this.sourceData[i];
      }
    }
    return null;
  }

  addItem(node: ProjectElement) {
    const newItem: ProjectElement = {
      id: 'aaaa',
      name: 'New Item',
      type: 'item',
      level: 1,
    };
    if (!node.children) {
      node.children = [];
    }
    if (node.children.length >= 5) {
      alert('Maximum number of children reached');
      return;
    }
    node.children.push(newItem);
  }

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

  visibleNodes(): ProjectElement[] {
    return this.sourceData.filter(x => x.visible);
  }

  getCondensedTreeSummary(): string {
    return this.sourceData
      .filter(node => node.visible)
      .map(node => `${node.level}${node.name}`)
      .join('\n');
  }
  calculateDropLevel(event: CdkDragMove<ProjectElement>) {
    const pointerY = event.pointerPosition.y;
    const pointerX = event.pointerPosition.x;

    // Get all visible node elements
    const nodeElements = Array.from(
      this.treeContainer.nativeElement.querySelectorAll('.mat-tree-node')
    ) as HTMLElement[];
    const visibleNodes = this.visibleNodes();

    // Find the closest node to the pointer
    let closestNodeIndex = -1;
    let minDistance = Infinity;

    nodeElements.forEach((nodeElement, index) => {
      const nodeRect = nodeElement.getBoundingClientRect();
      const nodeY = nodeRect.top + nodeRect.height / 2;
      const distance = Math.abs(pointerY - nodeY);

      if (distance < minDistance) {
        minDistance = distance;
        closestNodeIndex = index;
      }
    });

    if (closestNodeIndex >= 0) {
      const targetNode = visibleNodes[closestNodeIndex];
      const targetNodeLevel = targetNode.level;

      // Determine the index of the previous node
      const previousNodeIndex =
        closestNodeIndex > 0 ? closestNodeIndex - 1 : null;
      const previousNode =
        previousNodeIndex !== null ? visibleNodes[previousNodeIndex] : null;
      const previousNodeLevel = previousNode ? previousNode.level : null;

      // Set the targetNode and draggedNode
      this.targetNode = targetNode;
      this.draggedNode = event.source.data;

      // Calculate level based on pointerX position
      const treeRect = this.treeContainer.nativeElement.getBoundingClientRect();
      const levelWidth = 24; // Adjust if your indent per level is different
      const calculatedLevel = Math.floor(
        (pointerX - treeRect.left) / levelWidth
      );

      let possibleLevels: number[] = [];

      // Build possibleLevels based on targetNode and previousNode levels
      if (closestNodeIndex === 0) {
        // Only allow level 0 at the top of the list
        possibleLevels = [0];
      } else {
        // Possible levels are from minLevel to maxLevel
        const minLevel = previousNodeLevel !== null ? previousNodeLevel : 0;
        const maxLevel = targetNodeLevel + 1;

        for (let level = minLevel; level <= maxLevel; level++) {
          possibleLevels.push(level);
        }
      }

      // Remove invalid levels
      possibleLevels = possibleLevels.filter(level => level >= 0);

      // Now, select the closest level to calculatedLevel from possibleLevels
      this.currentDropLevel = possibleLevels.reduce((prev, curr) =>
        Math.abs(curr - calculatedLevel) < Math.abs(prev - calculatedLevel)
          ? curr
          : prev
      );

      // Validate the drop level using isValidDrop
      if (
        !this.isValidDrop(
          this.draggedNode,
          this.targetNode,
          this.currentDropLevel
        )
      ) {
        // If the calculated drop level is not valid, default to the closest valid level
        this.currentDropLevel =
          possibleLevels.find(level =>
            this.isValidDrop(this.draggedNode, this.targetNode!, level)
          ) ?? targetNode.level;
      }
    } else {
      // Default to root level if no node is close
      this.currentDropLevel = 0;
      this.targetNode = null;
      this.draggedNode = event.source.data;
    }

    console.log(`Calculated drop level: ${this.currentDropLevel}`);
  }

  isValidDrop(
    node: ProjectElement | null,
    targetNode: ProjectElement | null,
    newLevel: number
  ): boolean {
    if (!node || !targetNode) {
      return newLevel === 0;
    }

    console.log('isValidDrop:', {
      node: node.name,
      nodeType: node.type,
      targetNode: targetNode.name,
      targetType: targetNode.type,
      newLevel,
      targetLevel: targetNode.level,
    });

    // Prevent dropping a node as its own descendant
    if (this.isDescendant(node, targetNode)) {
      return false;
    }

    // Don't allow dropping an item as a child of another item
    if (
      node.type === 'item' &&
      targetNode.type === 'item' &&
      newLevel > targetNode.level
    ) {
      return false;
    }

    // Don't allow dropping a folder as a child of an item
    if (targetNode.type === 'item' && newLevel > targetNode.level) {
      return false;
    }

    // Don't allow dropping at a level that would create invalid hierarchy
    if (newLevel < targetNode.level && targetNode.level > 0) {
      const previousNode = this.getPreviousVisibleNode(targetNode);
      if (previousNode && newLevel <= previousNode.level) {
        return false;
      }
    }

    return true;
  }
  getPreviousVisibleNode(node: ProjectElement): ProjectElement | null {
    const visibleNodes = this.visibleNodes();
    const index = visibleNodes.indexOf(node);
    if (index > 0) {
      return visibleNodes[index - 1];
    }
    return null;
  }

  isDescendant(node: ProjectElement, targetNode: ProjectElement): boolean {
    if (node === targetNode) {
      return true;
    }

    const nodeIndex = this.sourceData.indexOf(node);
    const targetIndex = this.sourceData.indexOf(targetNode);

    if (nodeIndex === -1 || targetIndex === -1) {
      return false;
    }

    const nodeSubtree = this.getNodeSubtree(nodeIndex);
    return nodeSubtree.includes(targetNode);
  }

  canEnterDropList = (drag: CdkDrag, drop: CdkDropList) => {
    const node = drag.data as ProjectElement;
    const targetNode = this.targetNode;

    return this.isValidDrop(node, targetNode, this.currentDropLevel);
  };

  drop(event: CdkDragDrop<ArrayDataSource<ProjectElement>>) {
    if (!event.isPointerOverContainer) return;

    // Get the node being dragged
    const node = event.item.data as ProjectElement;
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex === -1) return;

    // Get the node at the drop position
    const visibleNodes = this.visibleNodes();
    const targetNode = visibleNodes[event.currentIndex];
    if (!targetNode) return;

    const targetIndex = this.sourceData.findIndex(n => n.id === targetNode.id);
    if (targetIndex === -1) return;

    if (!this.isValidDrop(node, targetNode, this.currentDropLevel)) {
      console.log('Invalid drop operation');
      return;
    }

    // Remove the node and its subtree
    const nodeSubtree = this.getNodeSubtree(nodeIndex);
    this.sourceData.splice(nodeIndex, nodeSubtree.length);

    // Adjust the target index after removal
    let adjustedTargetIndex = targetIndex;
    if (nodeIndex < targetIndex) {
      adjustedTargetIndex -= nodeSubtree.length;
    }

    // Determine the insert index
    let insertIndex = adjustedTargetIndex;

    // Decide whether to insert before or after the targetNode
    if (
      this.currentDropLevel > targetNode.level ||
      event.currentIndex > event.previousIndex
    ) {
      // Insert after the target node and its subtree
      const targetSubtree = this.getNodeSubtree(adjustedTargetIndex);
      insertIndex = adjustedTargetIndex + targetSubtree.length;
    }

    // Adjust levels
    const levelDifference = this.currentDropLevel - node.level;
    for (const n of nodeSubtree) {
      n.level += levelDifference;
    }

    // Insert the node and its subtree
    this.sourceData.splice(insertIndex, 0, ...nodeSubtree);

    this.updateVisibility();
    this.updateDataSource();

    console.log('Tree after drag:');
    console.log(this.getCondensedTreeSummary());

    this.targetNode = null;
    this.draggedNode = null;
  }
}
