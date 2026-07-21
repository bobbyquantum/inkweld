import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
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

interface CanvasTextFormValue {
  text: string;
}

@Component({
  selector: 'app-canvas-text-dialog',
  templateUrl: './canvas-text-dialog.component.html',
  styleUrls: ['./canvas-text-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    ColorSwatchesComponent,
  ],
})
export class CanvasTextDialogComponent {
  protected readonly data = inject<CanvasTextDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CanvasTextDialogComponent>);

  readonly model = signal<CanvasTextFormValue>({ text: this.data.text });

  readonly form = form(this.model, schemaPath => {
    required(schemaPath.text, { message: 'Text is required' });
  });

  protected selectedColor = this.data.color;

  onColorChange(color: string): void {
    this.selectedColor = color;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (this.form().valid()) {
      const result: CanvasTextDialogResult = {
        text: this.model().text,
        color: this.selectedColor,
      };
      this.dialogRef.close(result);
    }
  }
}
