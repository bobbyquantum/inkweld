import { Grid, GridCell, GridCellWidget, GridRow } from '@angular/aria/grid';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
  WritableSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

import { Element, ElementType } from '../../../api-client/model/models';
import {
  ElementPickerDialogComponent,
  ElementPickerDialogData,
  ElementPickerDialogResult,
} from '../../dialogs/element-picker-dialog/element-picker-dialog.component';
import { ProjectStateService } from '../../services/project/project-state.service';
import {
  WorldbuildingIdentity,
  WorldbuildingService,
} from '../../services/worldbuilding/worldbuilding.service';

/**
 * Represents a worldbuilding element with its selection state and toggle options
 */
export interface SelectedWorldbuildingElement {
  /** Element ID */
  id: string;
  /** Element name */
  name: string;
  /** Element type (e.g., 'worldbuilding/character') */
  type: string;
  /** Short type label without prefix */
  typeLabel: string;
  /** Whether the element has an image */
  hasImage: boolean;
  /** The image URL (media:// or resolved) */
  imageUrl?: string;
  /** Description from identity data */
  description?: string;
  /** Full worldbuilding data */
  data?: Record<string, unknown>;
  /** Whether to include the reference image in prompt */
  includeReference: WritableSignal<boolean>;
  /** Whether to include the description in prompt */
  includeDescription: WritableSignal<boolean>;
  /** Whether to include worldbuilding data fields in prompt */
  includeData: WritableSignal<boolean>;
}

/**
 * Flattened element data for external use (without signals)
 */
export interface WorldbuildingElementSelection {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  hasImage: boolean;
  imageUrl?: string;
  description?: string;
  data?: Record<string, unknown>;
  includeReference: boolean;
  includeDescription: boolean;
  includeData: boolean;
}

/**
 * Event emitted when selection changes
 */
export interface SelectionChangeEvent {
  elements: WorldbuildingElementSelection[];
}

@Component({
  selector: 'app-worldbuilding-element-selector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    Grid,
    GridRow,
    GridCell,
    GridCellWidget,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  templateUrl: './worldbuilding-element-selector.component.html',
  styleUrls: ['./worldbuilding-element-selector.component.scss'],
})
export class WorldbuildingElementSelectorComponent implements OnInit {
  private readonly projectState = inject(ProjectStateService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly dialog = inject(MatDialog);

  /** Maximum number of elements that can be selected */
  readonly maxElements = input<number>(4);

  /** Pre-selected element IDs */
  readonly preSelectedIds = input<string[]>([]);

  /** Emitted when selection changes */
  readonly selectionChange = output<SelectionChangeEvent>();

  /** Currently selected elements for the table */
  readonly selectedElements = signal<SelectedWorldbuildingElement[]>([]);

  /** IDs of currently selected elements (for exclusion in picker) */
  readonly selectedIds = computed(() => this.selectedElements().map(e => e.id));

  /** All available worldbuilding elements in the project (reactive to projectState changes) */
  readonly availableElements = computed(() => {
    const elements = this.projectState.elements();
    // Filter for worldbuilding elements - type is 'WORLDBUILDING' (ElementType.Worldbuilding)
    return elements.filter(el => el.type === ElementType.Worldbuilding);
  });

  /** Loading state */
  readonly isLoading = signal(false);

  /** Whether more elements can be added */
  readonly canAddMore = computed(
    () => this.selectedElements().length < this.maxElements()
  );

  ngOnInit(): void {
    // Pre-selection is handled by an effect that watches for elements to become available
    void this.handlePreSelection();
  }

  /**
   * Handle pre-selection of elements when they become available
   */
  private async handlePreSelection(): Promise<void> {
    const preSelected = this.preSelectedIds();
    if (preSelected.length === 0) {
      return;
    }

    // Wait for elements to be available (with timeout)
    const maxWaitMs = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const available = this.availableElements();
      if (available.length > 0) {
        const toSelect = available.filter(e => preSelected.includes(e.id));
        for (const el of toSelect.slice(0, this.maxElements())) {
          await this.addElement(el);
        }
        return;
      }
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Add an element to the selection
   */
  async addElement(element: Element): Promise<void> {
    if (!this.canAddMore()) {
      return;
    }

    const username = this.projectState.project()?.username;
    const slug = this.projectState.project()?.slug;

    if (!username || !slug) {
      return;
    }

    // Load identity and worldbuilding data
    let identity: WorldbuildingIdentity = {};
    let data: Record<string, unknown> | undefined;

    try {
      [identity, data] = await Promise.all([
        this.worldbuildingService.getIdentityData(element.id, username, slug),
        this.worldbuildingService
          .getWorldbuildingData(element.id, username, slug)
          .then(d => d ?? undefined),
      ]);
    } catch (err) {
      console.warn(
        `[WorldbuildingSelector] Failed to load data for ${element.id}:`,
        err
      );
    }

    const hasImage = !!identity.image;
    const hasDescription = !!identity.description;

    // Get schema type label (e.g., 'character' from 'character-v1')
    const schemaId = element.schemaId || '';
    const typeLabel = schemaId.replace(/-v\d+$/, ''); // Remove version suffix

    const selectedElement: SelectedWorldbuildingElement = {
      id: element.id,
      name: element.name,
      type: element.type || '',
      typeLabel,
      hasImage,
      imageUrl: identity.image,
      description: identity.description,
      data,
      includeReference: signal(hasImage), // Auto-enable if image exists
      includeDescription: signal(hasDescription),
      includeData: signal(true), // Default to including data
    };

    this.selectedElements.update(elements => [...elements, selectedElement]);
    this.emitChange();
  }

  /**
   * Remove an element from the selection
   */
  removeElement(element: SelectedWorldbuildingElement): void {
    this.selectedElements.update(elements =>
      elements.filter(e => e.id !== element.id)
    );
    this.emitChange();
  }

  /**
   * Open the element picker dialog
   */
  async openElementPicker(): Promise<void> {
    if (!this.canAddMore()) {
      return;
    }

    const remainingSlots = this.maxElements() - this.selectedElements().length;

    const dialogRef = this.dialog.open<
      ElementPickerDialogComponent,
      ElementPickerDialogData,
      ElementPickerDialogResult
    >(ElementPickerDialogComponent, {
      width: '500px',
      maxHeight: '80vh',
      data: {
        filterType: ElementType.Worldbuilding,
        excludeIds: this.selectedIds(),
        maxSelections: remainingSlots,
        title: 'Add Worldbuilding Elements',
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());

    if (result?.elements.length) {
      for (const element of result.elements) {
        await this.addElement(element);
      }
    }
  }

  /**
   * Called when any toggle changes
   */
  onToggleChange(): void {
    this.emitChange();
  }

  /**
   * Emit selection change event with flattened data
   */
  private emitChange(): void {
    const elements: WorldbuildingElementSelection[] =
      this.selectedElements().map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
        typeLabel: e.typeLabel,
        hasImage: e.hasImage,
        imageUrl: e.imageUrl,
        description: e.description,
        data: e.data,
        includeReference: e.includeReference(),
        includeDescription: e.includeDescription(),
        includeData: e.includeData(),
      }));
    this.selectionChange.emit({ elements });
  }

  /**
   * Get the type icon for an element based on its schemaId
   * @param schemaId The schema ID (e.g., 'character-v1')
   */
  getTypeIcon(schemaId: string): string {
    const typeWithoutVersion = schemaId.replace(/-v\d+$/, '');
    switch (typeWithoutVersion.toLowerCase()) {
      case 'character':
        return 'person';
      case 'location':
        return 'place';
      case 'item':
      case 'wb-item': // Handle wb-item-v1 schema
        return 'inventory_2';
      case 'faction':
        return 'groups';
      case 'event':
        return 'event';
      case 'concept':
        return 'lightbulb';
      default:
        return 'category';
    }
  }

  /**
   * Get the current selection as flattened data (for parent components)
   */
  getSelection(): WorldbuildingElementSelection[] {
    return this.selectedElements().map(e => ({
      id: e.id,
      name: e.name,
      type: e.type,
      typeLabel: e.typeLabel,
      hasImage: e.hasImage,
      imageUrl: e.imageUrl,
      description: e.description,
      data: e.data,
      includeReference: e.includeReference(),
      includeDescription: e.includeDescription(),
      includeData: e.includeData(),
    }));
  }
}
