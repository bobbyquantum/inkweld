import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { SnapshotDto } from '../../../api-client';

/**
 * Data passed to the RestoreSnapshotDialog
 */
export interface RestoreSnapshotDialogData {
  snapshot: SnapshotDto;
  currentWordCount?: number;
}

/**
 * Confirmation dialog for restoring a document snapshot
 * Warns the user that the current content will be overwritten
 */
@Component({
  selector: 'app-restore-snapshot-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './restore-snapshot-dialog.component.html',
  styleUrl: './restore-snapshot-dialog.component.scss',
})
export class RestoreSnapshotDialogComponent {
  dialogRef = inject(MatDialogRef<RestoreSnapshotDialogComponent>);
  data = inject<RestoreSnapshotDialogData>(MAT_DIALOG_DATA);

  /**
   * Confirm and close the dialog
   */
  onConfirm() {
    this.dialogRef.close(true);
  }

  /**
   * Cancel and close the dialog
   */
  onCancel() {
    this.dialogRef.close(false);
  }

  /**
   * Format date for display
   */
  formatDate(date: string | Date): string {
    return new Date(date).toLocaleString();
  }
}




