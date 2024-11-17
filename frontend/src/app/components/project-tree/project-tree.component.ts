import { ArrayDataSource } from '@angular/cdk/collections';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragMove,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDragSortEvent,
  CdkDragStart,
  CdkDropList,
  DragDropModule,
} from '@angular/cdk/drag-drop';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnInit,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInput, MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatTree, MatTreeModule } from '@angular/material/tree';

import { ProjectElement } from './ProjectElement';

@Component({
  standalone: true,
  imports: [
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatListModule,
    MatMenuModule,
    DragDropModule,
    CdkContextMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    CdkDrag,
    CdkDragPreview,
    CdkDragPlaceholder,
    CdkDropList,
  ],
  selector: 'app-project-tree',
  templateUrl: './project-tree.component.html',
  styleUrls: ['./project-tree.component.scss'],
})
export class ProjectTreeComponent implements OnInit, AfterViewInit {
  @Input() treeData: ProjectElement[] = [];

  @ViewChild('tree') treeEl!: MatTree<ProjectElement>;
  @ViewChild('treeContainer', { static: true })
  treeContainer!: ElementRef<HTMLElement>;
  @ViewChild('editInput') inputEl!: MatInput;
  @ViewChild(CdkDropList) dropList!: CdkDropList<ProjectElement>;

  dataSource!: ArrayDataSource<ProjectElement>;
  sourceData: ProjectElement[] = [];

  selectedItem: ProjectElement | null = null;

  editingNode: string | null = null;

  currentDropLevel = 0;
  validLevelsArray: number[] = [0];
  draggedNode: ProjectElement | null = null;

  nodeBelow: ProjectElement | null = null;
  nodeAbove: ProjectElement | null = null;
  contextItem: ProjectElement | null = null;
  wasExpandedNodeIds = new Set<string>();
  collapseTimer: NodeJS.Timeout | null = null;

  ngOnInit() {
    this.sourceData = JSON.parse(
      JSON.stringify(this.treeData)
    ) as ProjectElement[];
    this.updateDataSource();
  }
  ngAfterViewInit() {
    // Subscribe to beforeStarted event on the DropListRef
    this.dropList._dropListRef.beforeStarted.subscribe(() => {
      this.beforeDragStarted();
    });
  }
  updateDataSource() {
    this.dataSource = new ArrayDataSource<ProjectElement>(
      this.sourceData.filter(x => x.visible)
    );
  }

  levelAccessor(dataNode: ProjectElement): number {
    return dataNode.level;
  }

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
    // this.updateDataSource();
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

  // Add mousedown and mouseup handlers
  onNodeDown(node: ProjectElement) {
    this.selectedItem = node;
    if (node.type === 'folder' && node.expanded) {
      // Start a timer to collapse the node after a short delay
      this.collapseTimer = setTimeout(() => {
        // Collapse the node
        this.wasExpandedNodeIds.add(node.id);
        this.toggleExpanded(node);
        this.updateVisibility();
        this.updateDataSource();
        this.draggedNode = node;
      }, 950); // Delay slightly less than drag start delay
    }
  }

  onNodeUp() {
    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
  }

  beforeDragStarted() {
    if (this.selectedItem?.type === 'folder' && this.selectedItem.expanded) {
      // Remember that we collapsed this node
      this.wasExpandedNodeIds.add(this.selectedItem.id);
      this.toggleExpanded(this.selectedItem);
      this.updateVisibility();
      this.updateDataSource();
    }
  }

  dragStarted(
    node: ProjectElement,
    event: CdkDragStart<ArrayDataSource<ProjectElement>>
  ) {
    const { source } = event;
    console.log('Drag started', event);
    console.log('Source', source);
    this.draggedNode = node;
    this.currentDropLevel = node.level;
    this.validLevelsArray = [node.level];

    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
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
    ) as HTMLElement;
    if (placeholderElement) {
      placeholderElement.style.marginLeft = `${selectedLevel * indentPerLevel}px`;
    }
  }

  sorted(event: CdkDragSortEvent<ArrayDataSource<ProjectElement>>) {
    const { currentIndex, container } = event;
    const sortedNodes = container
      .getSortedItems()
      .map(dragItem => dragItem.data as ProjectElement)
      .filter(node => node.id !== this.draggedNode?.id);
    // console.log(
    //   'Sorted nodes: ' +
    //     sortedNodes.map((node, i) => `${i}:${node.id}`).join(',')
    // );
    this.nodeAbove = sortedNodes[currentIndex - 1] || null;
    this.nodeBelow = sortedNodes[currentIndex] || null;
    const validLevels = new Set<number>();
    if (this.nodeAbove && this.nodeBelow) {
      if (this.nodeAbove.level < this.nodeBelow.level) {
        if (this.nodeAbove.expandable) {
          validLevels.add(this.nodeAbove.level + 1);
        }
        validLevels.add(this.nodeBelow.level);
      } else if (this.nodeAbove.level === this.nodeBelow.level) {
        validLevels.add(this.nodeAbove.level);
      } else {
        for (
          let level = this.nodeBelow.level;
          level <= this.nodeAbove.level;
          level++
        ) {
          validLevels.add(level);
        }
      }
    } else if (this.nodeAbove && !this.nodeBelow) {
      for (let level = 0; level <= this.nodeAbove.level; level++) {
        validLevels.add(level);
      }
      if (this.nodeAbove.expandable) {
        validLevels.add(this.nodeAbove.level + 1);
      }
    } else if (!this.nodeAbove && this.nodeBelow) {
      validLevels.add(this.nodeBelow.level);
    } else {
      validLevels.add(0);
    }

    this.validLevelsArray = Array.from(validLevels).sort((a, b) => a - b);
    this.currentDropLevel = this.validLevelsArray[0];
    // console.log(
    //   `P:${previousIndex} C:${currentIndex} A:${this.nodeAbove?.id},${this.nodeAbove?.level} B:${this.nodeBelow?.id},${this.nodeBelow?.level} L: ${this.validLevelsArray}`
    // );
  }

  resetDropState() {
    this.updateVisibility();
    this.updateDataSource();
    this.draggedNode = null;
    this.nodeAbove = null;
    this.nodeBelow = null;
  }

  drop(event: CdkDragDrop<ArrayDataSource<ProjectElement>>) {
    const { currentIndex, container, item } = event;
    const sortedNodes = container
      .getSortedItems()
      .map(dragItem => dragItem.data as ProjectElement)
      .filter(node => node.id !== this.draggedNode?.id);
    this.nodeAbove = sortedNodes[currentIndex - 1] || null;
    this.nodeBelow = sortedNodes[currentIndex] || null;

    // Check if trying to drop as child of an item
    if (
      this.nodeAbove &&
      this.nodeAbove.type === 'item' &&
      this.currentDropLevel > this.nodeAbove.level
    ) {
      throw new Error('Cannot drop as child of an item');
    }

    const node = item.data as ProjectElement;
    const nodeIndex = this.sourceData.findIndex(n => n.id === node.id);
    if (nodeIndex === -1) {
      console.log('Node not found');
      return;
    }

    if (this.currentDropLevel < 0) {
      console.log('Invalid drop level');
      return;
    }
    const nodeSubtree = this.getNodeSubtree(nodeIndex);
    const nodeSubtreeLength = nodeSubtree.length;
    this.sourceData.splice(nodeIndex, nodeSubtreeLength);
    let insertIndex: number;

    if (this.nodeAbove) {
      const nodeAboveIndex = this.sourceData.findIndex(
        n => n.id === this.nodeAbove?.id
      );
      if (nodeAboveIndex === -1) {
        // this.sourceData.splice(0, 0, ...nodeSubtree);
        return;
      }

      if (this.currentDropLevel > this.nodeAbove.level) {
        insertIndex = nodeAboveIndex + 1;
      } else {
        const nodeAboveSubtree = this.getNodeSubtree(nodeAboveIndex);
        insertIndex = nodeAboveIndex + nodeAboveSubtree.length;
      }
    } else if (this.nodeBelow) {
      const nodeBelowIndex = this.sourceData.findIndex(
        n => n.id === this.nodeBelow?.id
      );
      if (nodeBelowIndex === -1) {
        return;
      }
      insertIndex = nodeBelowIndex;
    } else {
      insertIndex = this.sourceData.length;
    }
    const levelDifference = this.currentDropLevel - node.level;
    nodeSubtree.forEach(n => {
      n.level += levelDifference;
    });
    this.sourceData.splice(insertIndex, 0, ...nodeSubtree);
    this.resetDropState();
  }

  dragEnded() {
    if (this.draggedNode && this.wasExpandedNodeIds.has(this.draggedNode.id)) {
      this.toggleExpanded(this.draggedNode);
      this.updateVisibility();
      this.updateDataSource();
      this.wasExpandedNodeIds.delete(this.draggedNode.id);
    }
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

  onRename(node: unknown) {
    console.log(`Rename ${String(node)}`);
    this.startEditing(node as ProjectElement);
  }

  onDelete(node: ProjectElement) {
    const index = this.sourceData.findIndex(n => n.id === node.id);
    if (index !== -1) {
      this.sourceData.splice(index, 1);
      this.updateVisibility();
      this.updateDataSource();
    }
  }

  onContextMenuOpen(data: ProjectElement) {
    this.contextItem = data;
  }
  onContextMenuClose() {
    this.contextItem = null;
  }
}
