import { ArrayDataSource } from '@angular/cdk/collections';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragMove,
  CdkDragPlaceholder,
  CdkDragPreview,
  CdkDragSortEvent,
  CdkDropList,
  DragDropModule,
} from '@angular/cdk/drag-drop';
import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInput, MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { ProjectTreeService } from '@services/project-tree.service';

import { mapDtoToProjectElement, ProjectElement } from './project-element';
import { TreeManipulator } from './tree-manipulator';

/**
 * Component for displaying and managing the project tree.
 */
@Component({
  standalone: true,
  imports: [
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatListModule,
    MatMenuModule,
    MatProgressSpinner,
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
export class ProjectTreeComponent implements AfterViewInit {
  @ViewChild('tree') treeEl!: MatTree<ProjectElement>;
  @ViewChild('treeContainer', { static: true })
  treeContainer!: ElementRef<HTMLElement>;
  @ViewChild('editInput') inputEl!: MatInput;
  @ViewChild(CdkDropList) dropList!: CdkDropList<ProjectElement>;

  readonly treeService = inject(ProjectTreeService);

  // Map DTOs to internal model
  readonly treeElements = computed(() =>
    this.treeService.elements().map(mapDtoToProjectElement)
  );

  // Other service signals
  readonly isLoading = this.treeService.isLoading;
  readonly isSaving = this.treeService.isSaving;
  readonly error = this.treeService.error;

  dataSource!: ArrayDataSource<ProjectElement>;
  treeManipulator!: TreeManipulator;

  selectedItem: ProjectElement | null = null;
  editingNode: string | null = null;
  currentDropLevel = 0;
  validLevelsArray: number[] = [0];
  draggedNode: ProjectElement | null = null;

  contextItem: ProjectElement | null = null;
  wasExpandedNodeIds = new Set<string>();
  collapseTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Initialize tree with current elements
    this.initializeTree();

    // Update tree when elements change
    effect(() => {
      this.initializeTree();
    });
  }

  /**
   * Lifecycle hook after the view is initialized.
   */
  ngAfterViewInit() {
    // Subscribe to beforeStarted event on the DropListRef
    this.dropList._dropListRef.beforeStarted.subscribe(() => {
      this.beforeDragStarted();
    });
  }

  /**
   * Updates the data source based on visibility.
   */
  updateDataSource() {
    this.dataSource = new ArrayDataSource<ProjectElement>(
      this.treeManipulator.getData().filter(x => x.visible)
    );
  }

  /**
   * Accessor for node levels.
   * @param dataNode The project element node.
   * @returns The level of the node.
   */
  levelAccessor(dataNode: ProjectElement): number {
    return dataNode.level;
  }

  /**
   * Toggles the expanded state of a node.
   * @param node The project element to toggle.
   */
  toggleExpanded(node: ProjectElement) {
    this.treeManipulator.toggleExpanded(node);
    this.updateDataSource();
  }

  /**
   * Adds a new item as a child to the specified node.
   * @param node The parent node to add a new item to.
   */
  addItem(node: ProjectElement) {
    this.treeManipulator.addItem(node);
    this.updateDataSource();
  }

  /**
   * Retrieves the parent node of a given node.
   * @param node The node to find the parent of.
   * @returns The parent node, or null if not found.
   */
  getParentNode(node: ProjectElement): ProjectElement | null {
    return this.treeManipulator.getParentNode(node);
  }

  /**
   * Handles the mousedown event on a node.
   * @param node The node that is being pressed.
   */
  onNodeDown(node: ProjectElement) {
    this.selectedItem = node;
    if (node.type === 'FOLDER' && node.expanded) {
      // Start a timer to collapse the node after a short delay
      this.collapseTimer = setTimeout(() => {
        // Collapse the node
        this.wasExpandedNodeIds.add(node.id);
        this.toggleExpanded(node);
        this.draggedNode = node;
      }, 950); // Delay slightly less than drag start delay
    }
  }

  /**
   * Handles the mouseup event on a node.
   */
  onNodeUp() {
    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
  }

  /**
   * Prepares for drag start by collapsing expanded nodes if necessary.
   */
  beforeDragStarted() {
    if (this.selectedItem?.type === 'FOLDER' && this.selectedItem.expanded) {
      // Remember that we collapsed this node
      this.wasExpandedNodeIds.add(this.selectedItem.id);
      this.toggleExpanded(this.selectedItem);
    }
  }

  /**
   * Handles the drag start event.
   * @param node The node being dragged.
   */
  dragStarted(node: ProjectElement) {
    this.draggedNode = node;
    this.currentDropLevel = node.level;
    this.validLevelsArray = [node.level];

    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
  }

  /**
   * Handles the drag move event to adjust the placeholder position.
   * @param event The drag move event.
   */
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

  /**
   * Handles the sort event during drag and drop.
   * @param event The drag sort event.
   */
  sorted(event: CdkDragSortEvent<ArrayDataSource<ProjectElement>>) {
    const { currentIndex, container } = event;
    const sortedNodes = container
      .getSortedItems()
      .map(dragItem => dragItem.data as ProjectElement)
      .filter(node => node.id !== this.draggedNode?.id);
    const nodeAbove = sortedNodes[currentIndex - 1] || null;
    const nodeBelow = sortedNodes[currentIndex] || null;
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
      for (let level = 0; level <= nodeAbove.level; level++) {
        validLevels.add(level);
      }
      if (nodeAbove.expandable) {
        validLevels.add(nodeAbove.level + 1);
      }
    } else if (!nodeAbove && nodeBelow) {
      validLevels.add(nodeBelow.level);
    } else {
      validLevels.add(0);
    }

    this.validLevelsArray = Array.from(validLevels).sort((a, b) => a - b);
    this.currentDropLevel = this.validLevelsArray[0];
  }

  /**
   * Resets the state after a drop operation.
   */
  resetDropState() {
    this.draggedNode = null;
  }

  /**
   * Handles the drop event to rearrange nodes.
   * @param event The drag drop event.
   */
  drop(event: CdkDragDrop<ArrayDataSource<ProjectElement>>) {
    const { currentIndex, container, item } = event;
    const sortedNodes = container
      .getSortedItems()
      .map(dragItem => dragItem.data as ProjectElement)
      .filter(node => node.id !== this.draggedNode?.id);
    const nodeAbove = sortedNodes[currentIndex - 1] || null;
    const nodeBelow = sortedNodes[currentIndex] || null;

    // Check if trying to drop as child of an item
    if (
      nodeAbove &&
      nodeAbove.type === 'ITEM' &&
      this.currentDropLevel > nodeAbove.level
    ) {
      throw new Error('Cannot drop as child of an item');
    }

    const node = item.data as ProjectElement;

    if (this.currentDropLevel < 0) {
      return;
    }

    let insertIndex: number;

    if (nodeAbove) {
      const nodeAboveIndex = this.treeManipulator
        .getData()
        .findIndex(n => n.id === nodeAbove?.id);
      if (nodeAboveIndex === -1) {
        return;
      }

      if (this.currentDropLevel > nodeAbove.level) {
        insertIndex = nodeAboveIndex + 1;
      } else {
        const nodeAboveSubtree =
          this.treeManipulator.getNodeSubtree(nodeAboveIndex);
        insertIndex = nodeAboveIndex + nodeAboveSubtree.length;
      }
    } else if (nodeBelow) {
      const nodeBelowIndex = this.treeManipulator
        .getData()
        .findIndex(n => n.id === nodeBelow?.id);
      if (nodeBelowIndex === -1) {
        return;
      }
      insertIndex = nodeBelowIndex;
    } else {
      insertIndex = this.treeManipulator.getData().length;
    }

    this.treeManipulator.moveNode(node, insertIndex, this.currentDropLevel);
    this.resetDropState();
    this.updateDataSource();
  }

  /**
   * Handles the drag end event.
   */
  dragEnded() {
    if (this.draggedNode && this.wasExpandedNodeIds.has(this.draggedNode.id)) {
      this.toggleExpanded(this.draggedNode);
      this.wasExpandedNodeIds.delete(this.draggedNode.id);
    }
  }

  /**
   * Initiates editing of a node's name.
   * @param node The node to edit.
   */
  startEditing(node: ProjectElement) {
    this.editingNode = node.id;
  }

  /**
   * Completes editing of a node's name.
   * @param node The node being edited.
   * @param newName The new name for the node.
   */
  finishEditing(node: ProjectElement, newName: string) {
    if (newName.trim() !== '') {
      this.treeManipulator.renameNode(node, newName.trim());
    }
    this.editingNode = null;
    this.updateDataSource();
  }

  /**
   * Cancels editing of a node's name.
   */
  cancelEditing() {
    this.editingNode = null;
  }

  /**
   * Handles the rename action from the context menu.
   * @param node The node to rename.
   */
  onRename(node: ProjectElement) {
    this.startEditing(node);
  }

  /**
   * Handles the delete action from the context menu.
   * @param node The node to delete.
   */
  onDelete(node: ProjectElement) {
    this.treeManipulator.deleteNode(node);
    this.updateDataSource();
  }

  /**
   * Opens the context menu for a node.
   * @param data The node for which the context menu is opened.
   */
  onContextMenuOpen(data: ProjectElement) {
    this.contextItem = data;
  }

  /**
   * Closes the context menu.
   */
  onContextMenuClose() {
    this.contextItem = null;
  }

  /**
   * Initializes or reinitializes the tree with current data.
   */
  private initializeTree() {
    this.treeManipulator = new TreeManipulator(this.treeElements());
    this.updateDataSource();
  }
}
