import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
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
import { ColorSwatchesComponent } from '@components/color-swatches/color-swatches.component';

import { ElementType } from '../../../api-client/model/element-type';
import {
  ElementPickerDialogComponent,
  type ElementPickerDialogData,
  type ElementPickerDialogResult,
} from '../element-picker-dialog/element-picker-dialog.component';

export interface CanvasPinDialogData {
  /** Dialog title */
  title: string;
  /** Pre-filled pin label */
  label: string;
  /** Current pin color */
  color: string;
  /** Confirm button label */
  confirmLabel?: string;
  /** Currently linked element ID (for edit mode) */
  linkedElementId?: string;
  /** Currently linked element name (for display in edit mode) */
  linkedElementName?: string;
}

export interface CanvasPinDialogResult {
  label: string;
  color: string;
  /** Linked project element ID, or undefined to clear the link */
  linkedElementId?: string;
}

@Component({
  selector: 'app-canvas-pin-dialog',
  templateUrl: './canvas-pin-dialog.component.html',
  styleUrls: ['./canvas-pin-dialog.component.scss'],
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatTooltipModule,
    ReactiveFormsModule,
    ColorSwatchesComponent,
  ],
})
export class CanvasPinDialogComponent {
  protected readonly data = inject<CanvasPinDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CanvasPinDialogComponent>);
  private readonly dialog = inject(MatDialog);

  readonly labelControl = new FormControl(this.data.label, [
    Validators.required,
    Validators.minLength(1),
  ]);

  protected selectedColor = this.data.color;

  /** Linked element tracking */
  protected readonly linkedElementId = signal<string | undefined>(
    this.data.linkedElementId
  );
  protected readonly linkedElementName = signal<string | undefined>(
    this.data.linkedElementName
  );

  onColorChange(color: string): void {
    this.selectedColor = color;
  }

  /** Open the element picker to link a project element */
  pickElement(): void {
    const pickerData: ElementPickerDialogData = {
      title: 'Link to Element',
      subtitle: 'Choose an element to link this pin to.',
      maxSelections: 1,
      excludeTypes: [
        ElementType.Folder,
        ElementType.Canvas,
        ElementType.Timeline,
      ],
    };
    const pickerRef = this.dialog.open(ElementPickerDialogComponent, {
      width: '480px',
      maxHeight: '80vh',
      data: pickerData,
    });
    pickerRef
      .afterClosed()
      .subscribe((result: ElementPickerDialogResult | null) => {
        if (result?.elements?.length) {
          const el = result.elements[0];
          this.linkedElementId.set(el.id);
          this.linkedElementName.set(el.name);
        }
      });
  }

  /** Clear the linked element */
  clearLink(): void {
    this.linkedElementId.set(undefined);
    this.linkedElementName.set(undefined);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (this.labelControl.valid) {
      const result: CanvasPinDialogResult = {
        label: this.labelControl.value!,
        color: this.selectedColor,
        linkedElementId: this.linkedElementId(),
      };
      this.dialogRef.close(result);
    }
  }
}
