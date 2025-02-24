import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  DragDropModule,
} from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Input,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ProjectElement } from '../../models/project-element';
import { ProjectStateService } from '../../services/project-state.service';
import { TreeNodeIconComponent } from '../project-tree/components/tree-node-icon/tree-node-icon.component';

type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-folder-element-editor',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    DragDropModule,
    CdkDrag,
    CdkDropList,
    TreeNodeIconComponent,
  ],
  templateUrl: './folder-element-editor.component.html',
  styleUrl: './folder-element-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderElementEditorComponent implements OnInit {
  @Input() elementId?: string;

  projectStateService = inject(ProjectStateService);

  // State signals
  readonly viewMode = signal<ViewMode>('grid');
  readonly childElements = signal<ProjectElement[]>([]);
  readonly isLoading = this.projectStateService.isLoading;
  readonly error = this.projectStateService.error;

  // Computed values
  readonly hasElements = computed(() => this.childElements().length > 0);
  readonly folderElement = computed(() => {
    const elements = this.projectStateService.elements();
    return elements.find(e => e.id === this.elementId);
  });

  constructor() {
    // Set up effect to update child elements when elements change
    effect(() => {
      this.updateChildElements();
    });
  }

  ngOnInit(): void {
    // Load the view mode from metadata if available
    this.loadViewModeFromMetadata();
    // Initial load of child elements
    this.updateChildElements();
  }

  /**
   * Toggles between grid and list view modes
   * @param mode The view mode to set
   */
  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    this.saveViewModeToMetadata(mode);
  }

  /**
   * Opens an element in the editor
   * @param element The element to open
   */
  openElement(element: ProjectElement): void {
    this.projectStateService.openFile(element);
  }

  /**
   * Handles the drop event when reordering elements
   * @param event The drag drop event
   */
  onDrop(event: CdkDragDrop<ProjectElement[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const elements = [...this.childElements()];
    const element = elements[event.previousIndex];

    // Remove the element from its previous position
    elements.splice(event.previousIndex, 1);

    // Insert the element at its new position
    elements.splice(event.currentIndex, 0, element);

    // Update the positions of all elements
    const updatedElements = elements.map((el, index) => ({
      ...el,
      position: index,
    }));

    // Update the elements in the project state
    this.projectStateService.updateElements(updatedElements);
  }

  /**
   * Shows the context menu for an element
   * @param element The element to show the context menu for
   * @param event The mouse event
   */
  showContextMenu(element: ProjectElement, event: MouseEvent): void {
    event.preventDefault();
    // Implementation will depend on how context menus are handled in the app
  }

  /**
   * Creates a new element in the current folder
   */
  createNewElement(): void {
    this.projectStateService.showNewElementDialog(this.folderElement());
  }

  /**
   * Updates the list of child elements for the current folder
   */
  private updateChildElements(): void {
    if (!this.elementId) {
      this.childElements.set([]);
      return;
    }

    const allElements = this.projectStateService.elements();
    const folderElement = allElements.find(e => e.id === this.elementId);

    if (!folderElement) {
      this.childElements.set([]);
      return;
    }

    // Find direct children of this folder
    const folderLevel = folderElement.level;
    const folderIndex = allElements.findIndex(e => e.id === this.elementId);

    if (folderIndex === -1) {
      this.childElements.set([]);
      return;
    }

    // Get all elements that are direct children of this folder
    const children: ProjectElement[] = [];

    // Start from the element after the folder
    for (let i = folderIndex + 1; i < allElements.length; i++) {
      const element = allElements[i];

      // If we encounter an element with a level less than or equal to the folder's level,
      // we've moved out of the folder's children
      if (element.level <= folderLevel) {
        break;
      }

      // Only include direct children (level = folderLevel + 1)
      if (element.level === folderLevel + 1) {
        children.push(element);
      }
    }

    this.childElements.set(children);
  }

  /**
   * Loads the view mode from the folder's metadata
   */
  private loadViewModeFromMetadata(): void {
    const folder = this.folderElement();
    if (folder && folder.metadata && folder.metadata['viewMode']) {
      const savedMode = folder.metadata['viewMode'] as ViewMode;
      if (savedMode === 'grid' || savedMode === 'list') {
        this.viewMode.set(savedMode);
      }
    }
  }

  /**
   * Saves the current view mode to the folder's metadata
   * @param mode The view mode to save
   */
  private saveViewModeToMetadata(mode: ViewMode): void {
    const folder = this.folderElement();
    if (folder) {
      const updatedFolder = {
        ...folder,
        metadata: {
          ...folder.metadata,
          viewMode: mode,
        },
      };

      // Update the folder element with the new metadata
      const elements = this.projectStateService.elements();
      const updatedElements = elements.map(e =>
        e.id === folder.id ? updatedFolder : e
      );

      this.projectStateService.updateElements(updatedElements);
    }
  }
}
