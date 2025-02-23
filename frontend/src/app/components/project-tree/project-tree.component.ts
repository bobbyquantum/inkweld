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
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { ProjectStateService } from '@services/project-state.service';
import { SettingsService } from '@services/settings.service';
import { ProjectElementDto } from '@worm/index';
import { firstValueFrom } from 'rxjs';

import { ConfirmationDialogComponent } from '../../dialogs/confirmation-dialog/confirmation-dialog.component';
import {
  RenameDialogComponent,
  RenameDialogData,
} from '../../dialogs/rename-dialog/rename-dialog.component';
import {
  mapDtoToProjectElement,
  ProjectElement,
} from '../../models/project-element';
import { TreeNodeIconComponent } from './components/tree-node-icon/tree-node-icon.component';

/**
 * Component for displaying and managing the project tree.
 */
@Component({
  imports: [
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
    MatListModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    DragDropModule,
    CdkContextMenuTrigger,
    CdkMenu,
    CdkMenuItem,
    CdkDrag,
    CdkDragPreview,
    CdkDragPlaceholder,
    CdkDropList,
    TreeNodeIconComponent,
  ],
  selector: 'app-project-tree',
  templateUrl: './project-tree.component.html',
  styleUrls: ['./project-tree.component.scss'],
})
export class ProjectTreeComponent implements AfterViewInit {
  @ViewChild('tree') treeEl!: MatTree<ProjectElement>;
  @ViewChild('treeContainer', { static: true })
  treeContainer!: ElementRef<HTMLElement>;
  @ViewChild(CdkDropList) dropList!: CdkDropList<ProjectElement>;

  readonly projectStateService = inject(ProjectStateService);

  // Map DTOs to internal model
  readonly treeElements = computed(() => {
    const baseElements = this.projectStateService.elements().map(dto => {
      const element = mapDtoToProjectElement(dto);
      // Set expanded based on local state stored in expandedNodeIds for folder nodes
      element.expanded =
        element.expandable && this.expandedNodeIds.has(element.id);
      return element;
    });

    const result = [];
    const stack = [];
    // Compute visibility: a node is visible if all its ancestors are expanded
    for (const element of baseElements) {
      while (
        stack.length > 0 &&
        stack[stack.length - 1].level >= element.level
      ) {
        stack.pop();
      }
      let visible = true;
      for (const ancestor of stack) {
        if (!ancestor.expanded) {
          visible = false;
          break;
        }
      }
      element.visible = visible;
      result.push(element);
      if (element.expandable) {
        stack.push(element);
      }
    }
    return result;
  });

  // Other service signals
  readonly isLoading = this.projectStateService.isLoading;
  readonly isSaving = this.projectStateService.isSaving;
  readonly error = this.projectStateService.error;

  dataSource: ArrayDataSource<ProjectElement>;
  readonly settingsService = inject(SettingsService);

  selectedItem: ProjectElement | null = null;
  currentDropLevel = 0;
  validLevelsArray: number[] = [0];
  draggedNode: ProjectElement | null = null;
  levelWidth = 24; // Width in pixels for each level of indentation

  dialog = inject(MatDialog);
  contextItem: ProjectElement | null = null;
  private expandedNodeIds = new Set<string>();

  constructor() {
    // Initialize tree with current elements
    this.initializeTree();
    this.dataSource = new ArrayDataSource<ProjectElement>([]);

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
      // this.beforeDragStarted();
    });
  }

  /**
   * Updates the data source based on visibility.
   */
  updateDataSource(): void {
    this.dataSource = new ArrayDataSource<ProjectElement>(
      this.treeElements().filter(x => x.visible)
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
    this.projectStateService.toggleExpanded(node);
    // Track expanded state
    if (node.id) {
      if (node.expanded) {
        this.expandedNodeIds.add(node.id);
      } else {
        this.expandedNodeIds.delete(node.id);
      }
    }
    this.updateDataSource();
  }

  /**
   * Creates a new item as a child of the specified node.
   * @param node The parent node to add a new item to.
   */
  public onNewItem(node: ProjectElement) {
    this.projectStateService.showNewElementDialog(node);
  }

  /**
   * Creates a new folder as a child of the specified node.
   * @param node The parent node to add a new folder to.
   */
  public onNewFolder(node: ProjectElement) {
    this.projectStateService.showNewElementDialog(node);
  }

  /**
   * Handles the mousedown event on a node.
   * @param node The node that is being pressed.
   */
  public onNodeDown(node: ProjectElement) {
    this.selectedItem = node;
  }

  /**
   * Handles the drag start event.
   * @param node The node being dragged.
   */
  public dragStarted(node: ProjectElement) {
    this.draggedNode = node;
    this.currentDropLevel = node.level;
    this.validLevelsArray = [node.level];
  }

  /**
   * Handles the drag move event to adjust the placeholder position.
   * @param event The drag move event.
   */
  public dragMove(event: CdkDragMove<ArrayDataSource<ProjectElement>>) {
    const pointerX = event.pointerPosition.x;

    const treeRect = this.treeContainer.nativeElement.getBoundingClientRect();
    const indentPerLevel = this.levelWidth;
    const relativeX = pointerX - treeRect.left;
    const intendedLevel = Math.floor(relativeX / indentPerLevel); // Allow any level based on horizontal position
    const validLevels = this.validLevelsArray;

    // Debug logging
    console.log('Drag Debug:', {
      intendedLevel,
      relativeX,
      validLevels,
      draggedNode: this.draggedNode?.name,
    });

    const selectedLevel = validLevels.reduce((prev, curr) =>
      Math.abs(curr - intendedLevel) < Math.abs(prev - intendedLevel)
        ? curr
        : prev
    );

    // Debug level selection
    console.log('Level Selection:', {
      selectedLevel,
      validLevels,
      currentDropLevel: this.currentDropLevel,
    });

    this.currentDropLevel = selectedLevel;
    const placeholderElement = this.treeContainer.nativeElement.querySelector(
      '.cdk-drag-placeholder'
    ) as HTMLElement;
    if (placeholderElement) {
      placeholderElement.style.marginLeft = `${Math.max(0, selectedLevel * indentPerLevel)}px`;
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
      .map(dragItem => dragItem.data as ProjectElement);
    const filteredNodes = sortedNodes.filter(
      node => node.id !== this.draggedNode?.id
    );

    const nodeAbove = filteredNodes[currentIndex - 1] || null;
    const nodeBelow = filteredNodes[currentIndex] || null;

    // Debug valid levels calculation
    console.log('Valid Levels:', {
      nodeAbove: nodeAbove?.name,
      nodeAboveType: nodeAbove?.type,
      nodeBelow: nodeBelow?.name,
    });

    const { levels, defaultLevel } =
      this.projectStateService.getValidDropLevels(nodeAbove, nodeBelow);
    this.validLevelsArray = levels;
    this.currentDropLevel = defaultLevel;
  }

  /**
   * Handles the drop event to rearrange nodes.
   * @param event The drag drop event.
   */
  public async drop(event: CdkDragDrop<ArrayDataSource<ProjectElement>>) {
    const { currentIndex, container, item } = event;
    const sortedNodes = container
      .getSortedItems()
      .map(dragItem => dragItem.data as ProjectElement)
      .filter(node => node.id !== this.draggedNode?.id);
    const nodeAbove = sortedNodes[currentIndex - 1] || null;
    const node = item.data as ProjectElement;

    // Always validate the drop before confirmation
    if (
      !this.projectStateService.isValidDrop(nodeAbove, this.currentDropLevel)
    ) {
      return;
    }

    // Check if confirmation is enabled after validating drop
    const confirmElementMoves = this.settingsService.getSetting<boolean>(
      'confirmElementMoves',
      false
    );
    if (confirmElementMoves) {
      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        data: {
          title: 'Confirm Move',
          message: 'Are you sure you want to move this item?',
          confirmText: 'Move',
          cancelText: 'Cancel',
        },
      });
      const result = (await firstValueFrom(dialogRef.afterClosed())) as boolean;
      if (!result) return;
    }

    const insertIndex = this.projectStateService.getDropInsertIndex(
      nodeAbove,
      this.currentDropLevel
    );

    await this.projectStateService.moveTreeElement(
      node,
      insertIndex,
      this.currentDropLevel
    );
    this.draggedNode = null;
    this.updateDataSource();
    await this.saveChanges();
  }

  /**
   * Handles the rename action from the context menu.
   * @param node The node to rename.
   */
  public async onRename(node: ProjectElement) {
    const dialogRef = this.dialog.open<
      RenameDialogComponent,
      RenameDialogData,
      string
    >(RenameDialogComponent, {
      data: {
        currentName: node.name,
        title: `Rename ${node.expandable ? 'Folder' : 'Item'}`,
      },
    });

    const newName = await firstValueFrom(dialogRef.afterClosed());
    if (newName) {
      await this.projectStateService.renameTreeElement(node, newName);
      await this.saveChanges();
    }
  }

  /**
   * Handles the delete action from the context menu.
   * @param node The node to delete.
   */
  public async onDelete(node: ProjectElement) {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Confirm Delete' as const,
        message:
          `Are you sure you want to delete "${node.name}"? This action cannot be undone.` as const,
        confirmText: 'Delete' as const,
        cancelText: 'Cancel' as const,
      },
    });

    const result = (await firstValueFrom(dialogRef.afterClosed())) as boolean;
    if (result) {
      await this.projectStateService.deleteTreeElement(node);
      await this.saveChanges();
    }
  }

  /**
   * Opens the context menu for a node.
   * @param data The node for which the context menu is opened.
   */
  public onContextMenuOpen(data: ProjectElement) {
    this.contextItem = data;
  }

  /**
   * Closes the context menu.
   */
  public onContextMenuClose() {
    this.contextItem = null;
  }

  public editProject() {
    this.projectStateService.showEditProjectDialog();
  }

  /**
   * Opens a file in the editor.
   * @param node The node to open.
   */
  public onOpenFile(node: ProjectElement) {
    // Convert ProjectElement back to ProjectElementDto
    const dto: ProjectElementDto = {
      id: node.id ?? '',
      name: node.name,
      type: node.type,
      level: node.level,
      position: node.position,
      version: 0,
      expandable: node.expandable || false,
      metadata: {},
    };
    this.projectStateService.openFile(dto);
  }

  /**
   * Initializes or reinitializes the tree with current data.
   */
  private initializeTree() {
    // Restore expanded state for nodes from expandedNodeIds
    this.treeElements().forEach(node => {
      if (node.id && this.expandedNodeIds.has(node.id)) {
        node.expanded = true;
      }
    });
    this.updateDataSource();
  }

  /**
   * Saves the current tree state to the backend.
   */
  private async saveChanges() {
    const elements = this.treeElements();

    // Get project info from URL or service
    const urlParts = window.location.pathname.split('/');
    const username = urlParts[2];
    const slug = urlParts[3];
    await this.projectStateService.saveProjectElements(
      username,
      slug,
      elements
    );
    console.log('Changes saved');
  }
}
