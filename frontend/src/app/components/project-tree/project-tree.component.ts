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
  EventEmitter,
  inject,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { Router } from '@angular/router';
import { GetApiV1ProjectsUsernameSlugElements200ResponseInner } from '@inkweld/index';
import { ProjectStateService } from '@services/project-state.service';
import { SettingsService } from '@services/settings.service';

import { ProjectElement } from '../../models/project-element';
import { isWorldbuildingType } from '../../models/worldbuilding-schemas';
import { DialogGatewayService } from '../../services/dialog-gateway.service';
import { LoggerService } from '../../services/logger.service';
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
export class ProjectTreeComponent implements AfterViewInit, OnDestroy {
  private dialogGateway = inject(DialogGatewayService);
  private logger = inject(LoggerService);

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
  protected readonly router = inject(Router);

  selectedItem: ProjectElement | null = null;
  indicatorTop: number = 0;
  indicatorHeight: number = 0;

  private updateIndicator(): void {
    const selectedEl = this.treeContainer.nativeElement.querySelector(
      '.selected-item'
    ) as HTMLElement;
    if (selectedEl) {
      const containerRect =
        this.treeContainer.nativeElement.getBoundingClientRect();
      const elRect = selectedEl.getBoundingClientRect();
      this.indicatorTop = elRect.top - containerRect.top;
      this.indicatorHeight = elRect.height;
    } else {
      this.indicatorHeight = 0;
      this.indicatorTop = 0;
    }
  }

  public ngAfterViewInit(): void {
    // Position the indicator on initial load
    setTimeout(() => this.updateIndicator());
  }

  public ngOnDestroy(): void {
    // Clean up any pending timeout
    if (this.touchTimeout) {
      clearTimeout(this.touchTimeout);
      this.touchTimeout = null;
    }
  }
  currentDropLevel = 0;
  validLevelsArray: number[] = [0];
  draggedNode: ProjectElement | null = null;
  levelWidth = 24; // Width in pixels for each level of indentation

  contextItem: ProjectElement | null = null;
  private recentTouchNodeId: string | null = null;
  private touchTimeout: number | null = null;

  @Output() documentOpened = new EventEmitter<GetApiV1ProjectsUsernameSlugElements200ResponseInner>();

  constructor() {
    this.dataSource = new ArrayDataSource<ProjectElement>([]);
    effect(() => {
      this.logger.debug(
        'ProjectTree',
        'Visible elements changed',
        this.projectStateService.visibleElements()
      );
      this.dataSource = new ArrayDataSource<ProjectElement>(
        this.projectStateService.visibleElements()
      );
    });

    let tabsReady = false;
    // only update indicator after tabs load from storage
    effect(() => {
      const tabs = this.projectStateService.openTabs();
      if (!tabsReady && tabs.length > 0) {
        tabsReady = true;
      }
      if (tabsReady) {
        const idx = this.projectStateService.selectedTabIndex();
        // Account for Home fixed tab at index 0
        const tab = idx > 0 ? tabs[idx - 1] : null;
        let elemId: string | null = null;
        if (tab?.type === 'document' && tab.element) {
          elemId = tab.element.id;
        }
        this.selectedItem = elemId
          ? this.projectStateService
              .visibleElements()
              .find(el => el.id === elemId) || null
          : null;
        setTimeout(() => this.updateIndicator());
      }
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
   * Handles touch-based toggle to prevent double-firing with click events.
   * @param node The project element to toggle.
   * @param event The touch event.
   */
  toggleExpandedTouch(node: ProjectElement, event: TouchEvent) {
    event.preventDefault();
    event.stopPropagation();

    // Clear any existing timeout
    if (this.touchTimeout) {
      clearTimeout(this.touchTimeout);
    }

    // Set the recent touch node to prevent click event
    this.recentTouchNodeId = node.id;

    // Toggle the node
    this.projectStateService.toggleExpanded(node.id);

    // Clear the recent touch flag after a short delay
    this.touchTimeout = window.setTimeout(() => {
      this.recentTouchNodeId = null;
      this.touchTimeout = null;
    }, 300);
  }

  /**
   * Handles click-based toggle, but only if not recently handled by touch.
   * @param node The project element to toggle.
   * @param event The click event.
   */
  toggleExpandedClick(node: ProjectElement, event: MouseEvent) {
    event.stopPropagation();

    // Don't handle click if we recently handled a touch event for this node
    if (this.recentTouchNodeId === node.id) {
      return;
    }

    this.projectStateService.toggleExpanded(node.id);
  }

  /**
   * Handles the mousedown event on a node.
   * @param node The node that is being pressed.
   */
  public onNodeDown(node: ProjectElement) {
    this.selectedItem = node;
    setTimeout(() => this.updateIndicator());
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
    // console.log('Drag Debug:', {
    //   intendedLevel,
    //   relativeX,
    //   validLevels,
    //   draggedNode: this.draggedNode?.name,
    // });

    const selectedLevel = validLevels.reduce((prev, curr) =>
      Math.abs(curr - intendedLevel) < Math.abs(prev - intendedLevel)
        ? curr
        : prev
    );

    // Debug level selection
    // console.log('Level Selection:', {
    //   selectedLevel,
    //   validLevels,
    //   currentDropLevel: this.currentDropLevel,
    // });

    this.currentDropLevel = selectedLevel;
    const placeholderElement = this.treeContainer.nativeElement.querySelector(
      '.cdk-drag-placeholder'
    ) as HTMLElement;
    if (placeholderElement) {
      placeholderElement.style.marginLeft = `${Math.max(0, selectedLevel * indentPerLevel)}px`;
    }
  }

  /**
   * Handles the sort event during drag and drop to determine valid drop levels.
   *
   * @param event The drag sort event.
   */
  sorted(event: CdkDragSortEvent<ArrayDataSource<ProjectElement>>) {
    const { previousIndex, currentIndex, container, item } = event;

    // Item being dragged
    const draggedItem = item.data as unknown as ProjectElement;

    // Determine if dragging up or down
    const isDraggingDown = previousIndex < currentIndex;

    this.logger.debug('ProjectTree', 'Sorted event', {
      previousIndex,
      currentIndex,
      isDraggingDown,
      draggedItem: draggedItem.name,
    });

    const sortedNodes = container
      .getSortedItems()
      .map(dragItem => dragItem.data as ProjectElement);

    // Filter out the dragged item
    const filteredNodes = sortedNodes.filter(
      node => node.id !== draggedItem.id
    );

    // Determine nodes above and below based on the filtered list
    let nodeAbove = null;
    let nodeBelow = null;

    if (currentIndex > 0) {
      nodeAbove =
        currentIndex - 1 < filteredNodes.length
          ? filteredNodes[currentIndex - 1]
          : null;
    }

    nodeBelow =
      currentIndex < filteredNodes.length ? filteredNodes[currentIndex] : null;

    this.logger.debug('ProjectTree', 'Valid Levels', {
      nodeAbove: nodeAbove?.name,
      nodeBelow: nodeBelow?.name,
      filteredLength: filteredNodes.length,
      currentIndex,
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
    const { previousIndex, currentIndex, container, item } = event;

    // Item being dragged
    const draggedItem = item.data as ProjectElement;

    // Determine if dragging up or down
    const isDraggingDown = previousIndex < currentIndex;

    this.logger.debug('ProjectTree', 'Drop event', {
      previousIndex,
      currentIndex,
      isDraggingDown,
      draggedItem: draggedItem.name,
    });

    const sortedNodes = container
      .getSortedItems()
      .map(dragItem => dragItem.data as ProjectElement);

    // Filter out the dragged item
    const filteredNodes = sortedNodes.filter(
      node => node.id !== draggedItem.id
    );
    const nodeAbove =
      currentIndex > 0 && currentIndex - 1 < filteredNodes.length
        ? filteredNodes[currentIndex - 1]
        : null;
    const node = draggedItem;

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
      this.projectStateService.renameNode(node, newName);
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
      // Close any open editor tab for this file before deleting
      this.projectStateService.closeTabByElementId(node.id);
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
   * Opens a document in the editor.
   * @param node The node to open.
   */
  public onOpenDocument(node: ProjectElement) {
    // Convert ProjectElement back to GetApiV1ProjectsUsernameSlugElements200ResponseInner
    const dto: GetApiV1ProjectsUsernameSlugElements200ResponseInner = {
      id: node.id ?? '',
      name: node.name,
      type: node.type,
      level: node.level,
      position: node.position,
      version: 0,
      expandable: node.expandable || false,
      metadata: {},
    };
    this.projectStateService.openDocument(dto);
    this.documentOpened.emit(dto);
    setTimeout(() => this.updateIndicator());
    // Navigate to document, folder, or worldbuilding route
    const project = this.projectStateService.project();
    if (project?.username && project?.slug) {
      let typeRoute: string;
      if (dto.type === 'FOLDER') {
        typeRoute = 'folder';
      } else if (isWorldbuildingType(dto.type)) {
        typeRoute = 'worldbuilding';
      } else {
        typeRoute = 'document';
      }
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        typeRoute,
        dto.id,
      ]);
    }
  }
}




