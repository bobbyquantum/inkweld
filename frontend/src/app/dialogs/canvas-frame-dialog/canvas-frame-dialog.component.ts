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
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

export interface CanvasFrameDialogData {
  /** Dialog title */
  title: string;
  /** Pre-filled frame name */
  name: string;
  /** Pre-filled size in canvas units */
  width: number;
  height: number;
  /** Pre-filled position; the fields are hidden when omitted */
  x?: number;
  y?: number;
  /** Confirm button label */
  confirmLabel?: string;
}

export interface CanvasFrameDialogResult {
  name: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

interface CanvasFrameFormValue {
  name: string;
  width: string;
  height: string;
  x: string;
  y: string;
}

/** Smallest sensible frame edge in canvas units. */
const MIN_FRAME_SIZE = 16;

/**
 * Dialog for creating a custom frame or editing an existing frame's name,
 * dimensions and position (canvas size + crop frames).
 */
@Component({
  selector: 'app-canvas-frame-dialog',
  templateUrl: './canvas-frame-dialog.component.html',
  styleUrls: ['./canvas-frame-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoModule,
  ],
})
export class CanvasFrameDialogComponent {
  protected readonly data = inject<CanvasFrameDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<CanvasFrameDialogComponent, CanvasFrameDialogResult>
  );
  private readonly transloco = inject(TranslocoService);

  protected readonly showPosition =
    this.data.x !== undefined && this.data.y !== undefined;

  readonly model = signal<CanvasFrameFormValue>({
    name: this.data.name,
    width: String(this.data.width),
    height: String(this.data.height),
    x: String(this.data.x ?? 0),
    y: String(this.data.y ?? 0),
  });

  readonly form = form(this.model, schemaPath => {
    required(schemaPath.name, {
      message: this.transloco.translate('canvas.frames.nameRequired'),
    });
  });

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (this.form().invalid()) return;
    const value = this.model();

    const size = (raw: string, fallback: number) => {
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) && parsed >= MIN_FRAME_SIZE
        ? Math.round(parsed)
        : fallback;
    };
    const coord = (raw: string, fallback: number) => {
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
    };

    const result: CanvasFrameDialogResult = {
      name: value.name.trim(),
      width: size(value.width, this.data.width),
      height: size(value.height, this.data.height),
    };
    if (this.showPosition) {
      result.x = coord(value.x, this.data.x ?? 0);
      result.y = coord(value.y, this.data.y ?? 0);
    }
    this.dialogRef.close(result);
  }
}
