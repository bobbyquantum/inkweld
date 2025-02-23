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
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { ProjectStateService } from '@services/project-state.service';
import { SettingsService } from '@services/settings.service';
import { ProjectElementDto } from '@worm/index';

import { ProjectElement } from '../../models/project-element';
import { DialogGatewayService } from '../../services/dialog-gateway.service';
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
export class ProjectTreeComponent {
  @ViewChild('tree') treeEl!: MatTree<ProjectElement>;
  @ViewChild('treeContainer', { static: true })
  treeContainer!: ElementRef<HTMLElement>;
  @ViewChild(CdkDropList) dropList!: CdkDropList<ProjectElement>;

  readonly projectStateService = inject(ProjectStateService);

  // Map DTOs to internal model
  readonly treeElements = computed(() => {
    return this.projectStateService.visibleElements();
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

  contextItem: ProjectElement | null = null;
  private dialogGateway = inject(DialogGatewayService);

  constructor() {
    this.dataSource = new ArrayDataSource<ProjectElement>([]);
    effect(() => {
      console.log(
        'Visible elements changed',
        this.projectStateService.visibleElements()
      );
      this.dataSource = new ArrayDataSource<ProjectElement>(
        this.projectStateService.visibleElements()
      );
    });
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
    this.projectStateService.toggleExpanded(node.id);
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
      const confirmed = await this.dialogGateway.openConfirmationDialog({
        title: 'Confirm Move',
        message: 'Are you sure you want to move this item?',
        confirmText: 'Move',
        cancelText: 'Cancel',
      });

      if (!confirmed) return;
    }

    const insertIndex = this.projectStateService.getDropInsertIndex(
      nodeAbove,
      this.currentDropLevel
    );

    this.projectStateService.moveElement(
      node.id,
      insertIndex,
      this.currentDropLevel
    );
    this.draggedNode = null;
    // this.updateDataSource();
    // await this.saveChanges();
  }

  /**
   * Handles the rename action from the context menu.
   * @param node The node to rename.
   */
  public async onRename(node: ProjectElement) {
    const newName = await this.dialogGateway.openRenameDialog({
      currentName: node.name,
      title: `Rename ${node.expandable ? 'Folder' : 'Item'}`,
    });

    if (newName) {
      // await this.projectStateService.renameTreeElement(node, newName);
      // await this.saveChanges();
    }
  }

  /**
   * Handles the delete action from the context menu.
   * @param node The node to delete.
   */
  public async onDelete(node: ProjectElement) {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Confirm Delete',
      message: `Are you sure you want to delete "${node.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    const result = confirmed;
    if (result) {
      this.projectStateService.deleteElement(node.id);
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
}
