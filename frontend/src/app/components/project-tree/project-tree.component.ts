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
  EventEmitter,
  inject,
  input,
  OnDestroy,
  Output,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { Element, ElementType } from '@inkweld/index';
import { QuickOpenService } from '@services/core/quick-open.service';
import { SettingsService } from '@services/core/settings.service';
import { ProjectStateService } from '@services/project/project-state.service';

import { ProjectElement } from '../../models/project-element';
import { DialogGatewayService } from '../../services/core/dialog-gateway.service';
import { LoggerService } from '../../services/core/logger.service';
import { isWorldbuildingType } from '../../utils/worldbuilding.utils';
import { TreeNodeIconComponent } from './components/tree-node-icon/tree-node-icon.component';

/**
 * Component for displaying and managing the project tree with ARIA accessibility.
 */
@Component({
  imports: [
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
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
export class ProjectTreeComponent implements OnDestroy {
  private dialogGateway = inject(DialogGatewayService);
  private logger = inject(LoggerService);
  private quickOpenService = inject(QuickOpenService);
  @ViewChild('treeContainer', { static: true })
  treeContainer!: ElementRef<HTMLElement>;
  @ViewChild(CdkDropList) dropList!: CdkDropList<ProjectElement>;

  readonly projectStateService = inject(ProjectStateService);

  /** Whether to show the collapse button in the toolbar */
  showCollapseButton = input<boolean>(false);

  /** Emitted when the collapse button is clicked */
  collapseRequested = output<void>();

  // Map DTOs to internal model
  readonly treeElements = computed(() => {
    return this.projectStateService.visibleElements();
  });

  // Computed signal for home tab selection state
  readonly isHomeSelected = computed(() => {
    const tabs = this.projectStateService.openTabs();
    const idx = this.projectStateService.selectedTabIndex();
    const currentTab = tabs[idx];
    return currentTab?.systemType === 'home';
  });

  // Computed signal for whether home tab is open
  readonly isHomeOpen = computed(() => {
    return this.projectStateService
      .openTabs()
      .some(tab => tab.systemType === 'home');
  });

  // Computed set of element IDs that have open tabs
  readonly openElementIds = computed(() => {
    const tabs = this.projectStateService.openTabs();
    const ids = new Set<string>();
    for (const tab of tabs) {
      if (tab.element?.id) {
        ids.add(tab.element.id);
      }
    }
    return ids;
  });

  /**
   * Checks if an element has an open tab.
   */
  hasOpenTab(elementId: string): boolean {
    return this.openElementIds().has(elementId);
  }

  // Other service signals
  readonly isLoading = this.projectStateService.isLoading;
  readonly isSaving = this.projectStateService.isSaving;
  readonly error = this.projectStateService.error;

  readonly settingsService = inject(SettingsService);
  protected readonly router = inject(Router);

  selectedItem: ProjectElement | null = null;

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

  // Parent folder highlight state - shows which folder the drop will land in
  targetParentFolderId = signal<string | null>(null);
  // Track the node above current drop position for parent folder calculation
  private nodeAboveDropPosition: ProjectElement | null = null;

  contextItem: ProjectElement | null = null;
  private recentTouchNodeId: string | null = null;
  private touchTimeout: number | null = null;

  @Output() documentOpened = new EventEmitter<Element>();

  constructor() {
    let tabsReady = false;
    // only update indicator after tabs load from storage
    effect(() => {
      const tabs = this.projectStateService.openTabs();
      // Track isHomeSelected to trigger updates when switching to/from home
      const isHome = this.isHomeSelected();
      if (!tabsReady && tabs.length > 0) {
        tabsReady = true;
      }
      if (tabsReady) {
        const idx = this.projectStateService.selectedTabIndex();
        // Home tab is now in openTabs array at index 0, so direct indexing works
        const tab = tabs[idx] ?? null;
        let elemId: string | null = null;
        if (
          (tab?.type === 'document' ||
            tab?.type === 'folder' ||
            tab?.type === 'worldbuilding') &&
          tab.element
        ) {
          elemId = tab.element.id;
        }
        // Clear selectedItem when on home tab, otherwise find matching element
        this.selectedItem = isHome
          ? null
          : elemId
            ? this.projectStateService
                .visibleElements()
                .find(el => el.id === elemId) || null
            : null;
      }
    });
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
  }

  /**
   * Handles the drag start event.
   * @param node The node being dragged.
   */
  public dragStarted(node: ProjectElement) {
    this.draggedNode = node;
    this.currentDropLevel = node.level;
    this.validLevelsArray = [node.level];
    this.nodeAboveDropPosition = null;
  }

  /**
   * Handles the drag end event.
   */
  public dragEnded() {
    this.draggedNode = null;
    this.targetParentFolderId.set(null);
    this.nodeAboveDropPosition = null;
  }

  /**
   * Finds the parent folder for a given drop position and level.
   * @param nodeAbove The node above the drop position
   * @param dropLevel The level at which the item will be dropped
   * @returns The parent folder ID or null if dropping at root
   */
  private findParentFolderForDrop(
    nodeAbove: ProjectElement | null,
    dropLevel: number
  ): string | null {
    if (!nodeAbove || dropLevel === 0) {
      return null; // Dropping at root level
    }

    const elements = this.treeElements();

    // If dropping inside nodeAbove (it's a folder and we're one level deeper)
    if (nodeAbove.expandable && dropLevel === nodeAbove.level + 1) {
      return nodeAbove.id;
    }

    // Otherwise, find the parent folder at the target level
    // Walk backwards from nodeAbove to find a folder at level = dropLevel - 1
    const nodeAboveIndex = elements.findIndex(n => n.id === nodeAbove.id);
    for (let i = nodeAboveIndex; i >= 0; i--) {
      const node = elements[i];
      if (node.expandable && node.level === dropLevel - 1) {
        return node.id;
      }
      // If we've gone past the target level's parent, stop
      if (node.level < dropLevel - 1) {
        break;
      }
    }

    return null;
  }

  /**
   * Updates the parent folder highlight based on current drop position.
   */
  private updateParentFolderHighlight() {
    const parentFolderId = this.findParentFolderForDrop(
      this.nodeAboveDropPosition,
      this.currentDropLevel
    );
    this.targetParentFolderId.set(parentFolderId);
  }

  /**
   * Handles the drag move event to adjust the placeholder position.
   * @param event The drag move event.
   */
  public dragMove(event: CdkDragMove<ProjectElement>) {
    const pointerX = event.pointerPosition.x;

    const treeRect = this.treeContainer.nativeElement.getBoundingClientRect();
    const indentPerLevel = this.levelWidth;
    const relativeX = pointerX - treeRect.left;
    const intendedLevel = Math.floor(relativeX / indentPerLevel);
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
      placeholderElement.style.marginLeft = `${Math.max(0, selectedLevel * indentPerLevel)}px`;
    }

    // Update parent folder highlight when level changes
    this.updateParentFolderHighlight();
  }

  /**
   * Handles the sort event during drag and drop to determine valid drop levels.
   *
   * @param event The drag sort event.
   */
  sorted(event: CdkDragSortEvent<ProjectElement[]>) {
    const { previousIndex, currentIndex, container, item } = event;

    // Item being dragged (cdkDragData sets this as ProjectElement, but TS infers container type)
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
      .map(dragItem => dragItem.data as unknown as ProjectElement);

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

    // Store nodeAbove for parent folder calculation
    this.nodeAboveDropPosition = nodeAbove;
    this.updateParentFolderHighlight();
  }

  /**
   * Handles the drop event to rearrange nodes.
   * @param event The drag drop event.
   */
  public async drop(event: CdkDragDrop<ProjectElement[]>) {
    const { previousIndex, currentIndex, container, item } = event;

    // Item being dragged (cdkDragData sets this as ProjectElement, but TS infers container type)
    const draggedItem = item.data as unknown as ProjectElement;

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
      .map(dragItem => dragItem.data as unknown as ProjectElement);

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

    // Capture the target folder ID before resetting state
    const targetFolderId = this.targetParentFolderId();

    void this.projectStateService.moveElement(
      node.id,
      insertIndex,
      this.currentDropLevel
    );

    // Expand the target folder if it was collapsed
    if (targetFolderId) {
      const targetFolder = this.treeElements().find(
        el => el.id === targetFolderId
      );
      if (targetFolder && !targetFolder.expanded) {
        this.projectStateService.setExpanded(targetFolderId, true);
      }
    }

    this.draggedNode = null;
    this.targetParentFolderId.set(null);
    this.nodeAboveDropPosition = null;
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
      void this.projectStateService.renameNode(node, newName);
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
      void this.projectStateService.deleteElement(node.id);
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
    // Convert ProjectElement back to Element
    const dto: Element = {
      id: node.id ?? '',
      name: node.name,
      type: node.type,
      parentId: null, // TODO: Get actual parentId from node if available
      level: node.level,
      order: node.order,
      version: 0,
      expandable: node.expandable || false,
      metadata: {},
    };
    this.projectStateService.openDocument(dto);
    this.documentOpened.emit(dto);
    // Navigate to document, folder, or worldbuilding route
    const project = this.projectStateService.project();
    if (project?.username && project?.slug) {
      let typeRoute: string;
      if (dto.type === ElementType.Folder) {
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

  /**
   * Opens the new element dialog to create a new element at the root level.
   */
  public onCreateNewElement(): void {
    this.projectStateService.showNewElementDialog();
  }

  /**
   * Creates a new element inside a specific folder (from context menu).
   */
  public onCreateNewElementInFolder(folder: ProjectElement): void {
    // ProjectElement extends Element, so we can pass it directly
    this.projectStateService.showNewElementDialog(folder);
  }

  /**
   * Creates a new document with context awareness.
   * If a folder is selected, creates inside it.
   * If an item is selected, creates at the same level.
   */
  public onCreateNewDocument(): void {
    const parentElement = this.getParentForNewElement();
    this.projectStateService.showNewElementDialog(parentElement);
  }

  /**
   * Creates a new folder with context awareness, skipping type selection.
   * If a folder is selected, creates inside it.
   * If an item is selected, creates at the same level.
   */
  public onCreateNewFolder(): void {
    const parentElement = this.getParentForNewElement();
    this.projectStateService.showNewFolderDialog(parentElement);
  }

  /**
   * Determines the parent element for new items based on current selection.
   * - If a folder is selected: returns the folder (create inside it)
   * - If an item is selected: returns the item's parent (create at same level)
   * - If nothing is selected: returns undefined (create at root)
   */
  private getParentForNewElement(): Element | undefined {
    if (!this.selectedItem) {
      return undefined;
    }

    const selectedElement = this.projectStateService
      .elements()
      .find(e => e.id === this.selectedItem?.id);

    if (!selectedElement) {
      return undefined;
    }

    // If selected item is a folder, create inside it
    if (
      selectedElement.expandable ||
      selectedElement.type === ElementType.Folder
    ) {
      return selectedElement;
    }

    // If selected item is not a folder, create at the same level (use its parent)
    if (selectedElement.parentId) {
      const parent = this.projectStateService
        .elements()
        .find(e => e.id === selectedElement.parentId);
      return parent;
    }

    // If selected item has no parent, create at root
    return undefined;
  }

  /**
   * Navigates to the home tab.
   */
  public goHome(): void {
    const project = this.projectStateService.project();
    if (project) {
      this.selectedItem = null;
      this.projectStateService.openSystemTab('home');
      void this.router.navigate(['/', project.username, project.slug]);
    }
  }

  /**
   * Opens the quick open dialog.
   */
  public openQuickOpen(): void {
    this.quickOpenService.open();
  }
}
