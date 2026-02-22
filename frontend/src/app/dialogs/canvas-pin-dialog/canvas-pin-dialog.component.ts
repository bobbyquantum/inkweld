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
  ElementPickerDialogData,
  ElementPickerDialogResult,
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
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-icon">place</mat-icon>
      {{ data.title }}
    </h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Label</mat-label>
        <input
          matInput
          [formControl]="labelControl"
          cdkFocusInitial
          (keyup.enter)="onConfirm()"
          data-testid="canvas-pin-label-input"
          placeholder="Enter pin label" />
        @if (labelControl.hasError('required') && labelControl.touched) {
          <mat-error>Label is required</mat-error>
        }
      </mat-form-field>

      <div class="color-section">
        <span class="color-label">Pin Color</span>
        <app-color-swatches
          [selectedColor]="selectedColor"
          (colorChange)="onColorChange($event)" />
      </div>

      <div class="link-section">
        <span class="color-label">Link to Element</span>
        @if (linkedElementName()) {
          <div class="linked-element" data-testid="canvas-pin-linked-element">
            <mat-icon class="link-icon">link</mat-icon>
            <span class="linked-name">{{ linkedElementName() }}</span>
            <button
              mat-icon-button
              matTooltip="Remove link"
              (click)="clearLink()"
              data-testid="canvas-pin-clear-link">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        } @else {
          <button
            mat-stroked-button
            (click)="pickElement()"
            data-testid="canvas-pin-link-element">
            <mat-icon>add_link</mat-icon>
            Link to element
          </button>
        }
      </div>

      <div class="preview-section">
        <div class="pin-preview" [style.background]="selectedColor">
          <mat-icon>place</mat-icon>
        </div>
        <span class="preview-label">{{ labelControl.value || 'Pin' }}</span>
        @if (linkedElementName()) {
          <mat-icon class="preview-link-icon" matTooltip="Linked to element"
            >link</mat-icon
          >
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button
        mat-button
        color="primary"
        [disabled]="!labelControl.valid"
        data-testid="canvas-pin-confirm"
        (click)="onConfirm()">
        {{ data.confirmLabel || 'Place Pin' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .title-icon {
        vertical-align: middle;
        margin-right: 4px;
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .full-width {
        width: 100%;
        min-width: 280px;
      }
      .color-section {
        margin-top: 8px;
      }
      .color-label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: var(--sys-on-surface-variant);
        margin-bottom: 8px;
      }
      .preview-section {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 16px;
        padding: 12px;
        border-radius: 8px;
        background: var(--sys-surface-container);
      }
      .pin-preview {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        flex-shrink: 0;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }
      .pin-preview mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .preview-label {
        font-size: 14px;
        color: var(--sys-on-surface);
      }
      .preview-link-icon {
        margin-left: auto;
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--sys-primary);
      }
      .link-section {
        margin-top: 12px;
      }
      .linked-element {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 8px;
        background: var(--sys-surface-container);
      }
      .link-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--sys-primary);
        flex-shrink: 0;
      }
      .linked-name {
        flex: 1;
        font-size: 14px;
        color: var(--sys-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  ],
  standalone: true,
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
      excludeTypes: [ElementType.Folder, ElementType.Canvas],
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
