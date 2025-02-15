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
import { MatInput, MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { EditProjectDialogComponent } from '@dialogs/edit-project-dialog/edit-project-dialog.component';
import { ProjectStateService } from '@services/project-state.service';
import { ProjectDto, ProjectElementDto } from '@worm/index';

import {
  mapDtoToProjectElement,
  ProjectElement,
} from '../../models/project-element';
import { TreeManipulator } from './tree-manipulator';
/**
 * Component for displaying and managing the project tree.
 */
@Component({
  imports: [
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
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

  readonly projectStateService = inject(ProjectStateService);

  // Map DTOs to internal model
  readonly treeElements = computed(() => {
    return this.projectStateService.elements().map(mapDtoToProjectElement);
  });

  // Other service signals
  readonly isLoading = this.projectStateService.isLoading;
  readonly isSaving = this.projectStateService.isSaving;
  readonly error = this.projectStateService.error;

  dataSource: ArrayDataSource<ProjectElement>;
  treeManipulator!: TreeManipulator;

  selectedItem: ProjectElement | null = null;
  editingNode: string | undefined = undefined;
  currentDropLevel = 0;
  validLevelsArray: number[] = [0];
  draggedNode: ProjectElement | null = null;
  levelWidth = 24; // Width in pixels for each level of indentation

  dialog = inject(MatDialog);
  contextItem: ProjectElement | null = null;
  wasExpandedNodeIds = new Set<string>();
  private collapseTimer: ReturnType<typeof setTimeout> | null = null;
  // Track expanded nodes to persist state
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
      this.beforeDragStarted();
    });
  }

  /**
   * Updates the data source based on visibility.
   */
  updateDataSource(): void {
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
  public async onNewItem(node: ProjectElement) {
    const newItem = this.treeManipulator.addNode('ITEM', node);
    this.updateDataSource();
    await this.saveChanges();

    // Start editing the new item
    this.startEditing(newItem);
  }

  /**
   * Creates a new folder as a child of the specified node.
   * @param node The parent node to add a new folder to.
   */
  public async onNewFolder(node: ProjectElement) {
    const newFolder = this.treeManipulator.addNode('FOLDER', node);
    this.updateDataSource();
    await this.saveChanges();

    // Start editing the new folder
    this.startEditing(newFolder);
  }

  /**
   * Handles the mousedown event on a node.
   * @param node The node that is being pressed.
   */
  public onNodeDown(node: ProjectElement) {
    // Don't allow dragging when editing
    if (this.editingNode !== undefined) return;

    this.selectedItem = node;
    if (node.type === 'FOLDER' && node.expanded) {
      // Start a timer to collapse the node after a short delay
      this.collapseTimer = setTimeout(() => {
        // Collapse the node
        if (node.id) this.wasExpandedNodeIds.add(node.id);
        this.toggleExpanded(node);
        this.draggedNode = node;
      }, 950); // Delay slightly less than drag start delay
    }
  }

  /**
   * Handles the mouseup event on a node.
   */
  public onNodeUp() {
    if (this.collapseTimer) {
      clearTimeout(this.collapseTimer);
      this.collapseTimer = null;
    }
  }

  /**
   * Prepares for drag start by collapsing expanded nodes if necessary.
   */
  public beforeDragStarted() {
    if (this.selectedItem?.type === 'FOLDER' && this.selectedItem.expanded) {
      // Remember that we collapsed this node
      if (this.selectedItem.id) {
        this.wasExpandedNodeIds.add(this.selectedItem.id);
      }
      this.toggleExpanded(this.selectedItem);
    }
  }

  /**
   * Handles the drag start event.
   * @param node The node being dragged.
   */
  public dragStarted(node: ProjectElement) {
    // Don't allow dragging when editing
    if (this.editingNode !== undefined) return;

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
  public dragMove(event: CdkDragMove<ArrayDataSource<ProjectElement>>) {
    const pointerX = event.pointerPosition.x;

    const treeRect = this.treeContainer.nativeElement.getBoundingClientRect();
    const indentPerLevel = this.levelWidth;
    const relativeX = pointerX - treeRect.left;
    const intendedLevel = Math.max(1, Math.floor(relativeX / indentPerLevel)); // Minimum level 1 to stay under wrapper
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
      .map(dragItem => dragItem.data as ProjectElement);
    const filteredNodes = sortedNodes.filter(
      node => node.id !== this.draggedNode?.id
    );

    const nodeAbove = filteredNodes[currentIndex - 1] || null;
    const nodeBelow = filteredNodes[currentIndex] || null;

    const { levels, defaultLevel } = this.treeManipulator.getValidDropLevels(
      nodeAbove,
      nodeBelow
    );
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

    if (!this.treeManipulator.isValidDrop(nodeAbove, this.currentDropLevel)) {
      return;
    }

    const insertIndex = this.treeManipulator.getDropInsertIndex(
      nodeAbove,
      this.currentDropLevel
    );

    this.treeManipulator.moveNode(node, insertIndex, this.currentDropLevel);
    this.draggedNode = null;
    this.updateDataSource();
    await this.saveChanges();
  }

  /**
   * Handles the drag end event.
   */
  public dragEnded() {
    if (
      this.draggedNode?.id &&
      this.wasExpandedNodeIds.has(this.draggedNode.id)
    ) {
      this.toggleExpanded(this.draggedNode);
      this.wasExpandedNodeIds.delete(this.draggedNode.id);
    }
  }

  /**
   * Initiates editing of a node's name.
   * @param node The node to edit.
   */
  public startEditing(node: ProjectElement) {
    this.editingNode = node.id;
  }

  /**
   * Completes editing of a node's name.
   * @param node The node being edited.
   * @param newName The new name for the node.
   */
  public async finishEditing(node: ProjectElement, newName: string) {
    if (newName.trim() !== '') {
      this.treeManipulator.renameNode(node, newName.trim());
      this.updateDataSource();
      await this.saveChanges();
    }
    this.editingNode = undefined;
  }

  /**
   * Cancels editing of a node's name.
   */
  public cancelEditing() {
    this.editingNode = undefined;
  }

  /**
   * Handles the rename action from the context menu.
   * @param node The node to rename.
   */
  public onRename(node: ProjectElement) {
    this.startEditing(node);
  }

  /**
   * Handles the delete action from the context menu.
   * @param node The node to delete.
   */
  public async onDelete(node: ProjectElement) {
    this.treeManipulator.deleteNode(node);
    this.updateDataSource();
    // Save changes after delete
    await this.saveChanges();
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
    console.log('Edit project', this.projectStateService.project());
    const dialogRef = this.dialog.open(EditProjectDialogComponent, {
      data: { project: this.projectStateService.project() },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        void this.projectStateService.updateProject(result as ProjectDto);
      }
    });
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
      level: node.level - 1, // Decrement level since we incremented it for the tree
      position: node.position,
    };
    this.projectStateService.openFile(dto);
  }

  /**
   * Initializes or reinitializes the tree with current data.
   */
  private initializeTree() {
    this.treeManipulator = new TreeManipulator(this.treeElements());

    // Restore expanded state for nodes
    this.treeManipulator.getData().forEach(node => {
      if (node.id && this.expandedNodeIds.has(node.id)) {
        node.expanded = true;
      }
    });

    this.treeManipulator.updateVisibility();
    this.updateDataSource();
  }

  /**
   * Saves the current tree state to the backend.
   */
  private async saveChanges() {
    // Get all elements and decrement their levels
    const elements = this.treeManipulator
      .getData()
      .map(el => ({ ...el, level: el.level - 1 }));

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
