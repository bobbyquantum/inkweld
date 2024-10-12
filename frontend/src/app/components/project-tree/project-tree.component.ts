import { Component, ViewChild, ElementRef, Input, OnInit } from '@angular/core';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import {
  CdkDragDrop,
  DragDropModule,
  CdkDragMove,
} from '@angular/cdk/drag-drop';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ArrayDataSource } from '@angular/cdk/collections';
import { ProjectElement } from './ProjectElement';
import { MatInputModule } from '@angular/material/input';

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

  @ViewChild('tree')
  treeEl!: MatTree<ProjectElement>;

  @ViewChild('treeContainer', { static: true })
  treeContainer!: ElementRef;

  dataSource!: ArrayDataSource<ProjectElement>;

  currentDropLevel = 0;
  draggedNode: ProjectElement | null = null;
  targetNode: ProjectElement | null = null;
  editingNode: string | null = null;

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

  parentExpanded = (_: number, node: ProjectElement) =>
    this.getParentNode(node)?.expanded;

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

  visibleNodes(): ProjectElement[] {
    return this.sourceData.filter(x => x.visible);
  }

  getCondensedTreeSummary(data: ProjectElement[]): string {
    return data
      .filter(node => node.visible)
      .map(node => `${node.level}${node.name}`)
      .join('\n');
  }

  isValidDrop(
    node: ProjectElement | null,
    targetNode: ProjectElement | null,
    newLevel: number
  ): boolean {
    if (!node) {
      return false;
    }

    // Prevent dropping a node as its own descendant
    if (targetNode && this.isDescendant(node, targetNode)) {
      return false;
    }

    // Ensure the node is not being dropped into an invalid level
    if (newLevel < 0) {
      return false;
    }

    // Prevent making an item a child of another item
    if (newLevel > 0) {
      const parentNode = this.getParentAtLevel(targetNode, newLevel - 1);
      if (parentNode && parentNode.type === 'item') {
        return false;
      }
    }

    return true;
  }
  getParentAtLevel(
    node: ProjectElement | null,
    level: number
  ): ProjectElement | null {
    if (!node) return null;
    const index = this.sourceData.indexOf(node);
    for (let i = index - 1; i >= 0; i--) {
      if (this.sourceData[i].level === level) {
        return this.sourceData[i];
      }
    }
    return null;
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

  dragStarted(node: ProjectElement) {
    this.draggedNode = node;
    //we need to collapse this node if it's a folder and expanded
    if (node.type === 'folder' && node.expanded) {
      this.toggleExpanded(node);
    }
  }

  dragMove(event: CdkDragMove<ProjectElement>) {
    console.log('Drag move event: ', event);

    const pointerX = event.pointerPosition.x;
    const pointerY = event.pointerPosition.y;
    const treeRect = this.treeContainer.nativeElement.getBoundingClientRect();
    const levelWidth = 24; // Indent per level

    // Include placeholders in the node elements
    const nodeElements = Array.from(
      this.treeContainer.nativeElement.querySelectorAll(
        '.mat-tree-node, .cdk-drag-placeholder'
      )
    ) as HTMLElement[];

    const visibleNodes = this.visibleNodes();

    // Exclude the dragged node from visibleNodes to realign indices
    const adjustedVisibleNodes = visibleNodes.filter(
      node => node !== this.draggedNode
    );

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

    if (
      closestNodeIndex >= 0 &&
      closestNodeIndex < adjustedVisibleNodes.length
    ) {
      this.targetNode = adjustedVisibleNodes[closestNodeIndex];
    } else {
      this.targetNode = null;
    }
    console.log('Target node: ', this.targetNode?.id);
    this.draggedNode = event.source.data;

    // Calculate the intended level based on horizontal position
    const calculatedLevel = Math.floor((pointerX - treeRect.left) / levelWidth);
    const maxLevel = Math.max(...this.sourceData.map(n => n.level)) + 1;
    this.currentDropLevel = Math.max(0, Math.min(calculatedLevel, maxLevel));
  }
  drop(event: CdkDragDrop<ArrayDataSource<ProjectElement>>) {
    console.log('Drop event: ', event);
    const node = event.item.data as ProjectElement;
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex === -1) {
      console.log('Node not found');
      return;
    }
    console.log(
      'Source data at drop: ',
      this.getCondensedTreeSummary(this.sourceData)
    );
    console.log('nodeIndex', nodeIndex);

    // Remove node and its subtree
    const nodeSubtree = this.getNodeSubtree(nodeIndex);
    this.sourceData.splice(nodeIndex, nodeSubtree.length);

    // Find the drop index in the source data
    const visibleNodes = this.visibleNodes();
    console.log('Visible Nodes: ', this.getCondensedTreeSummary(visibleNodes));
    const targetIndex = event.currentIndex;

    console.log('targetIndex', targetIndex);

    const insertIndex = targetIndex;

    console.log('insertIndex', insertIndex);

    // Adjust levels
    const levelDifference = this.currentDropLevel - node.level;
    nodeSubtree.forEach(n => {
      n.level += levelDifference;
    });

    // Insert node and its subtree
    this.sourceData.splice(insertIndex, 0, ...nodeSubtree);

    this.updateVisibility();
    this.updateDataSource();
    console.log(
      'Source data after drop: ',
      this.getCondensedTreeSummary(this.sourceData)
    );
    // Reset drag variables
    this.targetNode = null;
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
