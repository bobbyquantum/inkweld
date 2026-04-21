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
import { ColorSwatchesComponent } from '@components/color-swatches/color-swatches.component';

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
  templateUrl: './canvas-text-dialog.component.html',
  styleUrls: ['./canvas-text-dialog.component.scss'],
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
