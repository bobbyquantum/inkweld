import { Component, ViewChild, ElementRef, Input, OnInit } from '@angular/core';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import {
  CdkDragDrop,
  CdkDragMove,
  CdkDragSortEvent,
  DragDropModule,
} from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ArrayDataSource } from '@angular/cdk/collections';
import { MatInputModule } from '@angular/material/input';
import { ProjectElement } from './ProjectElement';

@Component({
  standalone: true,
  imports: [
    MatTreeModule,
    DragDropModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
  ],
  selector: 'app-project-tree',
  templateUrl: './project-tree.component.html',
  styleUrls: ['./project-tree.component.scss'],
})
export class ProjectTreeComponent implements OnInit {
  @Input() treeData: ProjectElement[] = [];
  sourceData: ProjectElement[] = [];

  @ViewChild('tree') treeEl!: MatTree<ProjectElement>;
  @ViewChild('treeContainer', { static: true }) treeContainer!: ElementRef;

  dataSource!: ArrayDataSource<ProjectElement>;
  currentDropLevel = 0;
  draggedNode: ProjectElement | null = null;
  editingNode: string | null = null;
  validLevelsArray: number[] = [0];
  nodeBelow: ProjectElement | null = null;
  nodeAbove: ProjectElement | null = null;

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
    this.updateVisibility();
    this.updateDataSource();
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

  addItem(node: ProjectElement) {
    const nodeIndex = this.sourceData.indexOf(node);
    const newItem: ProjectElement = {
      id: 'new-item-' + Math.random().toString(36).substr(2, 9),
      name: 'New Item',
      type: 'item',
      level: node.level + 1,
      expandable: false,
      expanded: true,
      visible: true,
    };
    this.sourceData.splice(nodeIndex + 1, 0, newItem);
    this.updateVisibility();
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

  dragStarted(node: ProjectElement) {
    this.draggedNode = node;
    this.currentDropLevel = node.level;
    this.validLevelsArray = [node.level];
    if (node.type === 'folder' && node.expanded) {
      this.toggleExpanded(node);
    }
  }

  dragMove(event: CdkDragMove<ArrayDataSource<ProjectElement>>) {
    const pointerX = event.pointerPosition.x;
    const treeRect = this.treeContainer.nativeElement.getBoundingClientRect();
    const indentPerLevel = 24;
    const relativeX = pointerX - treeRect.left;
    const intendedLevel = Math.max(0, Math.floor(relativeX / indentPerLevel));
    const validLevels = this.validLevelsArray;
    const selectedLevel = validLevels.reduce((prev, curr) =>
      Math.abs(curr - intendedLevel) < Math.abs(prev - intendedLevel)
        ? curr
        : prev
    );
    this.currentDropLevel = selectedLevel;
    const placeholderElement = this.treeContainer.nativeElement.querySelector(
      '.cdk-drag-placeholder'
    );
    if (placeholderElement) {
      placeholderElement.style.marginLeft = `${selectedLevel * indentPerLevel}px`;
    }
  }
  sorted(event: CdkDragSortEvent<ArrayDataSource<ProjectElement>>) {
    const { previousIndex, currentIndex, container } = event;
    const sortedNodes = container
      .getSortedItems()
      .map(dragItem => dragItem.data as ProjectElement)
      .filter(node => node.id !== this.draggedNode?.id);
    console.log('Sorted nodes: ' + sortedNodes.map(node => node.id).join(','));
    this.nodeAbove = sortedNodes[currentIndex - 1] || null;
    this.nodeBelow = sortedNodes[currentIndex] || null;

    const validLevels = new Set<number>();

    if (this.nodeAbove && this.nodeBelow) {
      if (this.nodeAbove.level < this.nodeBelow.level) {
        // Case where nodeBelow is deeper level than nodeAbove
        // Valid level is nodeAbove.level + 1 (inside nodeAbove if expandable)
        if (this.nodeAbove.expandable) {
          validLevels.add(this.nodeAbove.level + 1);
        }
        // Also consider nodeBelow.level (same level as nodeBelow)
        validLevels.add(this.nodeBelow.level);
      } else if (this.nodeAbove.level === this.nodeBelow.level) {
        // Same level, valid level is nodeAbove.level
        validLevels.add(this.nodeAbove.level);
      } else {
        // nodeAbove.level > nodeBelow.level
        // Valid levels from nodeBelow.level up to nodeAbove.level
        for (
          let level = this.nodeBelow.level;
          level <= this.nodeAbove.level;
          level++
        ) {
          validLevels.add(level);
        }
      }
    } else if (this.nodeAbove && !this.nodeBelow) {
      // At the end of the list
      // Valid levels from 0 up to nodeAbove.level
      for (let level = 0; level <= this.nodeAbove.level; level++) {
        validLevels.add(level);
      }
      // If nodeAbove is expandable, include nodeAbove.level + 1
      if (this.nodeAbove.expandable) {
        validLevels.add(this.nodeAbove.level + 1);
      }
    } else if (!this.nodeAbove && this.nodeBelow) {
      // At the top of the list
      // Valid level is nodeBelow.level
      validLevels.add(this.nodeBelow.level);
      // If nodeBelow is expandable, include nodeBelow.level + 1
      // if (this.nodeBelow.expandable) {
      //   validLevels.add(this.nodeBelow.level + 1);
      // }
    } else {
      // Both nodeAbove and nodeBelow are null (empty list)
      validLevels.add(0);
    }

    this.validLevelsArray = Array.from(validLevels).sort((a, b) => a - b);
    this.currentDropLevel = this.validLevelsArray[0];
    console.log(
      `P:${previousIndex} C:${currentIndex} A:${this.nodeAbove?.id},${this.nodeAbove?.level} B:${this.nodeBelow?.id},${this.nodeBelow?.level} L: ${this.validLevelsArray}`
    );
  }
  resetDropState() {
    this.updateVisibility();
    this.updateDataSource();
    this.draggedNode = null;
    this.nodeAbove = null;
    this.nodeBelow = null;
  }
  drop(event: CdkDragDrop<ArrayDataSource<ProjectElement>>) {
    console.debug('Drop event', event);

    const node = event.item.data as ProjectElement;
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex === -1) {
      console.log('Node not found');
      return;
    }

    const nodeSubtree = this.getNodeSubtree(nodeIndex);
    const nodeSubtreeLength = nodeSubtree.length;

    if (this.currentDropLevel < 0) {
      // Invalid level, cancel the drop
      this.sourceData.splice(nodeIndex, 0, ...nodeSubtree);
      this.resetDropState();
      return;
    }
    // Remove the nodeSubtree from sourceData
    this.sourceData.splice(nodeIndex, nodeSubtreeLength);

    // Adjust targetIndex if necessary
    let adjustedTargetIndex = event.currentIndex;
    if (nodeIndex < event.currentIndex) {
      adjustedTargetIndex = event.currentIndex - nodeSubtreeLength + 1;
    }

    // Ensure adjustedTargetIndex is within bounds
    if (adjustedTargetIndex < 0) {
      adjustedTargetIndex = 0;
    }

    // Get the parent node at the currentDropLevel
    const potentialParentIndex = adjustedTargetIndex - 1;
    let potentialParent: ProjectElement | null = null;
    if (
      potentialParentIndex >= 0 &&
      potentialParentIndex < this.sourceData.length
    ) {
      for (let i = potentialParentIndex; i >= 0; i--) {
        if (this.sourceData[i].level === this.currentDropLevel - 1) {
          potentialParent = this.sourceData[i];
          break;
        }
      }
    }
    console.debug('Potential parent', potentialParent);
    // If the potential parent is not expandable, prevent the drop
    if (
      this.currentDropLevel > 0 &&
      potentialParent &&
      !potentialParent.expandable
    ) {
      // Cancel the drop and reinsert the node at its original position
      this.sourceData.splice(nodeIndex, 0, ...nodeSubtree);
      this.resetDropState();
      return;
    }

    const levelDifference = this.currentDropLevel - node.level;
    nodeSubtree.forEach(n => {
      n.level += levelDifference;
    });

    this.sourceData.splice(adjustedTargetIndex, 0, ...nodeSubtree);
    this.resetDropState();
  }

  startEditing(node: ProjectElement) {
    this.editingNode = node.id;
  }

  finishEditing(node: ProjectElement, newName: string) {
    if (newName.trim() !== '') {
      node.name = newName.trim();
    }
    this.editingNode = null;
    this.updateDataSource();
  }

  cancelEditing() {
    this.editingNode = null;
  }
}
