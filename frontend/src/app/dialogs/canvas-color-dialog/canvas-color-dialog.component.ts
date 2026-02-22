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
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.showFill) {
        <div class="color-section">
          <span class="color-label">
            <mat-icon class="label-icon">format_color_fill</mat-icon>
            Fill Color
          </span>
          <app-color-swatches
            [selectedColor]="selectedFill"
            (colorChange)="onFillChange($event)" />
        </div>
      }
      @if (data.showStroke) {
        <div class="color-section">
          <span class="color-label">
            <mat-icon class="label-icon">border_color</mat-icon>
            Stroke Color
          </span>
          <app-color-swatches
            [selectedColor]="selectedStroke"
            (colorChange)="onStrokeChange($event)" />
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button
        mat-button
        color="primary"
        data-testid="canvas-color-confirm"
        (click)="onConfirm()">
        Apply
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .color-section {
        margin-bottom: 16px;
      }
      .color-section:last-of-type {
        margin-bottom: 0;
      }
      .color-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 500;
        color: var(--sys-on-surface-variant);
        margin-bottom: 8px;
      }
      .label-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    `,
  ],
  standalone: true,
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
