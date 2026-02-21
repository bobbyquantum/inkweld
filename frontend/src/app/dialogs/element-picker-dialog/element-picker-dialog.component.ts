import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Element } from '../../../api-client/model/element';
import { ElementType } from '../../../api-client/model/element-type';
import { ProjectStateService } from '../../services/project/project-state.service';

/**
 * Dialog data for element picker
 */
export interface ElementPickerDialogData {
  /** Title for the dialog */
  title?: string;
  /** Subtitle/instructions */
  subtitle?: string;
  /** Maximum number of elements that can be selected */
  maxSelections?: number;
  /** Element IDs to exclude from the list (already selected) */
  excludeIds?: string[];
  /** Filter to specific element types (e.g., ElementType.Worldbuilding) */
  filterType?: ElementType;
  /** Element types to exclude from the list */
  excludeTypes?: ElementType[];
}

/**
 * Result returned when dialog closes
 */
export interface ElementPickerDialogResult {
  /** Selected elements */
  elements: Element[];
}

@Component({
  selector: 'app-element-picker-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatTooltipModule,
  ],
  templateUrl: './element-picker-dialog.component.html',
  styleUrls: ['./element-picker-dialog.component.scss'],
})
export class ElementPickerDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<ElementPickerDialogComponent>
  );
  private readonly data = inject<ElementPickerDialogData>(MAT_DIALOG_DATA);
  private readonly projectState = inject(ProjectStateService);

  /** Search text */
  readonly searchText = signal('');

  /** Selected element IDs (for multi-select) */
  readonly selectedIds = signal<Set<string>>(new Set());

  /** All available elements (filtered by type if specified) */
  readonly availableElements = computed(() => {
    const elements = this.projectState.elements();
    const filterType = this.data.filterType;
    const excludeIds = new Set(this.data.excludeIds || []);

    let filtered = elements.filter(el => !excludeIds.has(el.id));

    if (filterType) {
      filtered = filtered.filter(el => el.type === filterType);
    }

    const excludeTypes = this.data.excludeTypes;
    if (excludeTypes?.length) {
      const excludeSet = new Set(excludeTypes);
      filtered = filtered.filter(el => !excludeSet.has(el.type));
    }

    return filtered;
  });

  /** Filtered elements based on search */
  readonly filteredElements = computed(() => {
    const search = this.searchText().toLowerCase().trim();
    const elements = this.availableElements();

    if (!search) {
      return elements;
    }

    return elements.filter(
      el =>
        el.name.toLowerCase().includes(search) ||
        (el.schemaId && el.schemaId.toLowerCase().includes(search))
    );
  });

  /** Title to display */
  get title(): string {
    return this.data.title || 'Select Elements';
  }

  /** Subtitle to display */
  get subtitle(): string | undefined {
    return this.data.subtitle;
  }

  /** Maximum selections allowed */
  get maxSelections(): number {
    return this.data.maxSelections || 10;
  }

  /** Whether more selections can be made */
  readonly canSelectMore = computed(() => {
    return this.selectedIds().size < this.maxSelections;
  });

  /** Whether any elements are selected */
  readonly hasSelection = computed(() => {
    return this.selectedIds().size > 0;
  });

  /** Selection count text */
  readonly selectionCountText = computed(() => {
    const count = this.selectedIds().size;
    if (count === 0) return 'No elements selected';
    if (count === 1) return '1 element selected';
    return `${count} elements selected`;
  });

  /**
   * Check if an element is selected
   */
  isSelected(element: Element): boolean {
    return this.selectedIds().has(element.id);
  }

  /**
   * Toggle selection of an element
   */
  toggleSelection(element: Element): void {
    const current = this.selectedIds();
    const newSet = new Set(current);

    if (newSet.has(element.id)) {
      newSet.delete(element.id);
    } else if (this.canSelectMore()) {
      newSet.add(element.id);
    }

    this.selectedIds.set(newSet);
  }

  /**
   * Get icon for element type based on schemaId
   */
  getTypeIcon(schemaId: string | undefined): string {
    if (!schemaId) return 'category';

    const typeWithoutVersion = schemaId.replace(/-v\d+$/, '');
    switch (typeWithoutVersion.toLowerCase()) {
      case 'character':
        return 'person';
      case 'location':
        return 'place';
      case 'item':
      case 'wb-item':
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
   * Get type label from schemaId
   */
  getTypeLabel(schemaId: string | undefined): string {
    if (!schemaId) return '';
    return schemaId.replace(/-v\d+$/, '');
  }

  /**
   * Confirm selection and close dialog
   */
  confirm(): void {
    const selectedIds = this.selectedIds();
    const allElements = this.availableElements();
    const selectedElements = allElements.filter(el => selectedIds.has(el.id));

    const result: ElementPickerDialogResult = {
      elements: selectedElements,
    };

    this.dialogRef.close(result);
  }

  /**
   * Cancel and close dialog
   */
  cancel(): void {
    this.dialogRef.close(null);
  }
}
