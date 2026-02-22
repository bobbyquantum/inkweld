import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { ColorSwatchesComponent } from '../../components/color-swatches/color-swatches.component';

export interface CanvasPinDialogData {
  /** Dialog title */
  title: string;
  /** Pre-filled pin label */
  label: string;
  /** Current pin color */
  color: string;
  /** Confirm button label */
  confirmLabel?: string;
}

export interface CanvasPinDialogResult {
  label: string;
  color: string;
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

      <div class="preview-section">
        <div class="pin-preview" [style.background]="selectedColor">
          <mat-icon>place</mat-icon>
        </div>
        <span class="preview-label">{{ labelControl.value || 'Pin' }}</span>
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
    `,
  ],
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    ReactiveFormsModule,
    ColorSwatchesComponent,
  ],
})
export class CanvasPinDialogComponent {
  protected readonly data = inject<CanvasPinDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CanvasPinDialogComponent>);

  readonly labelControl = new FormControl(this.data.label, [
    Validators.required,
    Validators.minLength(1),
  ]);

  protected selectedColor = this.data.color;

  onColorChange(color: string): void {
    this.selectedColor = color;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (this.labelControl.valid) {
      const result: CanvasPinDialogResult = {
        label: this.labelControl.value!,
        color: this.selectedColor,
      };
      this.dialogRef.close(result);
    }
  }
}
