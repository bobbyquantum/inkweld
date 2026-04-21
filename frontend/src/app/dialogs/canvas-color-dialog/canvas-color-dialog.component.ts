import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ColorSwatchesComponent } from '@components/color-swatches/color-swatches.component';

export interface CanvasColorDialogData {
  /** Dialog title */
  title: string;
  /** Whether to show fill color */
  showFill: boolean;
  /** Whether to show stroke color */
  showStroke: boolean;
  /** Current fill color */
  fill?: string;
  /** Current stroke color */
  stroke?: string;
}

export interface CanvasColorDialogResult {
  fill?: string;
  stroke?: string;
}

@Component({
  selector: 'app-canvas-color-dialog',
  templateUrl: './canvas-color-dialog.component.html',
  styleUrls: ['./canvas-color-dialog.component.scss'],
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    ColorSwatchesComponent,
  ],
})
export class CanvasColorDialogComponent {
  protected readonly data = inject<CanvasColorDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CanvasColorDialogComponent>);

  protected selectedFill = this.data.fill ?? '#FFFFFF';
  protected selectedStroke = this.data.stroke ?? '#333333';

  onFillChange(color: string): void {
    this.selectedFill = color;
  }

  onStrokeChange(color: string): void {
    this.selectedStroke = color;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    const result: CanvasColorDialogResult = {};
    if (this.data.showFill) result.fill = this.selectedFill;
    if (this.data.showStroke) result.stroke = this.selectedStroke;
    this.dialogRef.close(result);
  }
}
