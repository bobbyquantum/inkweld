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
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type Element } from '@inkweld/model/element';
import { ElementType } from '@inkweld/model/element-type';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { firstValueFrom } from 'rxjs';

import {
  NewElementDialogComponent,
  type NewElementDialogData,
  type NewElementDialogResult,
} from '../new-element-dialog/new-element-dialog.component';

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
  /** Filter to worldbuilding elements of a specific schema (template) id */
  filterSchemaId?: string;
  /**
   * Offer a "Create new…" shortcut that creates a worldbuilding element on
   * the spot and returns it as the selection. Only honoured when the picker
   * is limited to worldbuilding elements (`filterType` unset or
   * `ElementType.Worldbuilding`).
   */
  allowCreate?: boolean;
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
    TranslocoModule,
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
  private readonly transloco = inject(TranslocoService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly dialog = inject(MatDialog);

  /** Whether the "Create new…" shortcut is shown. */
  readonly canCreate =
    !!this.data.allowCreate &&
    (!this.data.filterType ||
      this.data.filterType === ElementType.Worldbuilding) &&
    this.projectState.canWrite();

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

    const filterSchemaId = this.data.filterSchemaId;
    if (filterSchemaId) {
      filtered = filtered.filter(el => el.schemaId === filterSchemaId);
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
        el.schemaId?.toLowerCase().includes(search)
    );
  });

  /** Title to display */
  get title(): string {
    return (
      this.data.title ||
      this.transloco.translate('dialogs.elementPicker.addSelected')
    );
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
    if (count === 0)
      return this.transloco.translate('dialogs.elementPicker.noneSelected');
    if (count === 1)
      return this.transloco.translate('dialogs.elementPicker.oneSelected');
    return this.transloco.translate('dialogs.elementPicker.manySelected', {
      count,
    });
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
    return this.worldbuildingService.getSchemaIcon(schemaId);
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

  /**
   * Create a new worldbuilding element and return it as the selection.
   *
   * The element is placed in the folder that already holds elements of the
   * same template (most recently created first), so a new character lands
   * next to the other characters. Falls back to the project root.
   */
  async createNew(): Promise<void> {
    if (!this.canCreate) return;

    const data: NewElementDialogData = {
      worldbuildingOnly: true,
      ...(this.data.filterSchemaId
        ? {
            skipTypeSelection: true,
            preselectedType: ElementType.Worldbuilding,
            preselectedSchemaId: this.data.filterSchemaId,
          }
        : {}),
    };
    const ref = this.dialog.open<
      NewElementDialogComponent,
      NewElementDialogData,
      NewElementDialogResult
    >(NewElementDialogComponent, {
      data,
      disableClose: true,
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh',
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result || result.type !== ElementType.Worldbuilding) return;

    const parentId = this.defaultParentFor(result.schemaId);
    const newId = this.projectState.addElement(
      result.type,
      result.name,
      parentId ?? undefined,
      result.schemaId
    );
    if (!newId) return;

    const created = this.projectState.elements().find(e => e.id === newId);
    if (!created) return;
    this.dialogRef.close({ elements: [created] });
  }

  /** Folder of the most recently created element sharing `schemaId`, if any. */
  private defaultParentFor(schemaId: string | undefined): string | null {
    if (!schemaId) return null;
    const siblings = this.projectState
      .elements()
      .filter(
        e => e.type === ElementType.Worldbuilding && e.schemaId === schemaId
      );
    if (siblings.length === 0) return null;
    const latest = [...siblings].sort((a, b) =>
      (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    )[0];
    return latest.parentId ?? null;
  }
}
