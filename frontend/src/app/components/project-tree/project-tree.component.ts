import { Component, ViewChild, ElementRef, Input, OnInit } from '@angular/core';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import {
  CdkDragDrop,
  CdkDragMove,
  CdkDragSortEvent,
  CdkDropList,
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

    // Find the closest valid level to the intended level
    const selectedLevel = validLevels.reduce((prev, curr) =>
      Math.abs(curr - intendedLevel) < Math.abs(prev - intendedLevel)
        ? curr
        : prev
    );

    this.currentDropLevel = selectedLevel;

    // Update the placeholder indentation
    const placeholderElement = this.treeContainer.nativeElement.querySelector(
      '.cdk-drag-placeholder'
    );
    if (placeholderElement) {
      placeholderElement.style.marginLeft = `${selectedLevel * indentPerLevel}px`;
    }
  }

  sorted(event: CdkDragSortEvent<ArrayDataSource<ProjectElement>>) {
    const { previousIndex, currentIndex, container } = event;
    const sortedNodes = (
      container as CdkDropList<ArrayDataSource<ProjectElement>>
    )
      .getSortedItems()
      .map(dragItem => dragItem.data as ProjectElement)
      .filter(node => node.id !== this.draggedNode?.id);
    console.log('Sorted nodes: ' + sortedNodes.map(node => node.id).join(','));
    this.nodeAbove = sortedNodes[currentIndex - 1];
    this.nodeBelow = sortedNodes[currentIndex];

    const validLevels = new Set<number>();
    if (this.nodeAbove) {
      if (this.nodeAbove.expandable) {
        validLevels.add(this.nodeAbove.level + 1);
      } else {
        validLevels.add(this.nodeAbove.level);
      }
    } else {
      validLevels.add(0);
    }
    if (this.nodeBelow) {
      const minLevel = this.nodeBelow.level;
      const maxLevel = this.nodeAbove ? this.nodeAbove.level : 0;
      for (let level = minLevel; level < maxLevel; level++) {
        validLevels.add(level);
      }
    }
    this.validLevelsArray = Array.from(validLevels).sort((a, b) => a - b);
    this.currentDropLevel = this.validLevelsArray[0];
    console.log(
      `P:${previousIndex} C:${currentIndex} A:${this.nodeAbove?.id},${this.nodeAbove?.level} B:${this.nodeBelow?.id},${this.nodeBelow?.level} L: ${this.validLevelsArray}`
    );
  }

  drop(event: CdkDragDrop<ArrayDataSource<ProjectElement>>) {
    const node = event.item.data as ProjectElement;
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex === -1) {
      console.log('Node not found');
      return;
    }

    const nodeSubtree = this.getNodeSubtree(nodeIndex);
    this.sourceData.splice(nodeIndex, nodeSubtree.length);

    const targetIndex = event.currentIndex;

    const levelDifference = this.currentDropLevel - node.level;
    nodeSubtree.forEach(n => {
      n.level += levelDifference;
    });

    this.sourceData.splice(targetIndex, 0, ...nodeSubtree);

    this.updateVisibility();
    this.updateDataSource();

    this.draggedNode = null;
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
