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
  templateUrl: './add-media-dialog.component.html',
  styleUrls: ['./add-media-dialog.component.scss'],
})
export class AddMediaDialogComponent {
  readonly dialogRef = inject(MatDialogRef<AddMediaDialogComponent>);
  readonly data: AddMediaDialogData =
    inject<AddMediaDialogData>(MAT_DIALOG_DATA);

  select(choice: AddMediaDialogResult): void {
    this.dialogRef.close(choice);
  }
}
