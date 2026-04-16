import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface AddMediaDialogData {
  /** Whether AI generation is available */
  canGenerate: boolean;
  /** Tooltip explaining why generation is disabled (if applicable) */
  generateTooltip?: string;
}

export type AddMediaDialogResult = 'upload' | 'generate';

@Component({
  selector: 'app-add-media-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Add Media</h2>
    <mat-dialog-content>
      <div class="options">
        <button
          class="option-card"
          (click)="select('upload')"
          data-testid="add-media-upload">
          <mat-icon>upload_file</mat-icon>
          <span class="option-label">Upload Image</span>
          <span class="option-desc">Upload an image from your device</span>
        </button>
        <button
          class="option-card"
          [disabled]="!data.canGenerate"
          [title]="data.generateTooltip ?? ''"
          (click)="select('generate')"
          data-testid="add-media-generate">
          <mat-icon>auto_awesome</mat-icon>
          <span class="option-label">Generate with AI</span>
          <span class="option-desc">Create an image using AI generation</span>
        </button>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button mat-dialog-close data-testid="add-media-cancel">
        Cancel
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .options {
        display: flex;
        gap: 16px;
        padding: 8px 0;
      }

      .option-card {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 24px 16px;
        border: 1px solid var(--sys-outline-variant);
        border-radius: 12px;
        background: var(--sys-surface-container-low);
        cursor: pointer;
        transition:
          background 0.15s,
          border-color 0.15s;

        &:hover:not(:disabled) {
          background: var(--sys-surface-container);
          border-color: var(--sys-primary);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        mat-icon {
          font-size: 36px;
          width: 36px;
          height: 36px;
          color: var(--sys-primary);
        }

        .option-label {
          font-weight: 500;
          font-size: 15px;
        }

        .option-desc {
          font-size: 13px;
          color: var(--sys-on-surface-variant);
          text-align: center;
        }
      }
    `,
  ],
})
export class AddMediaDialogComponent {
  readonly dialogRef = inject(MatDialogRef<AddMediaDialogComponent>);
  readonly data: AddMediaDialogData =
    inject<AddMediaDialogData>(MAT_DIALOG_DATA);

  select(choice: AddMediaDialogResult): void {
    this.dialogRef.close(choice);
  }
}
