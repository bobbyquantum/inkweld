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

export interface CanvasTextDialogData {
  /** Dialog title */
  title: string;
  /** Pre-filled text content */
  text: string;
  /** Current text color */
  color: string;
  /** Confirm button label */
  confirmLabel?: string;
}

export interface CanvasTextDialogResult {
  text: string;
  color: string;
}

@Component({
  selector: 'app-canvas-text-dialog',
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Text</mat-label>
        <textarea
          matInput
          [formControl]="textControl"
          cdkFocusInitial
          rows="3"
          data-testid="canvas-text-input"
          placeholder="Enter text"></textarea>
        @if (textControl.hasError('required') && textControl.touched) {
          <mat-error>Text is required</mat-error>
        }
      </mat-form-field>

      <div class="color-section">
        <span class="color-label">Text Color</span>
        <app-color-swatches
          [selectedColor]="selectedColor"
          (colorChange)="onColorChange($event)" />
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button
        mat-button
        color="primary"
        [disabled]="!textControl.valid"
        data-testid="canvas-text-confirm"
        (click)="onConfirm()">
        {{ data.confirmLabel || 'Add' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
        min-width: 300px;
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
export class CanvasTextDialogComponent {
  protected readonly data = inject<CanvasTextDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CanvasTextDialogComponent>);

  readonly textControl = new FormControl(this.data.text, [
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
    if (this.textControl.valid) {
      const result: CanvasTextDialogResult = {
        text: this.textControl.value!,
        color: this.selectedColor,
      };
      this.dialogRef.close(result);
    }
  }
}
