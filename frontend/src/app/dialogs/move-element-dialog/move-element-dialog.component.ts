import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@jsverse/transloco';

export interface MoveElementDialogData {
  /** Name of the item being moved. */
  elementName: string;
  /** Breadcrumb-style path of the item's current location (project root first). */
  fromPath: string;
  /** Breadcrumb-style path of the destination location (project root first). */
  toPath: string;
  /** Human-readable description of where in the destination the item lands. */
  positionLabel: string;
}

export interface MoveElementDialogResult {
  /** True when the user asked not to be prompted before future moves. */
  dontAskAgain: boolean;
}

/**
 * Confirms a drag-and-drop move in the project tree.
 *
 * Unlike a generic confirmation, it states exactly what will happen — the item,
 * where it is coming from, where it is going and where in the destination it
 * lands — and lets the user turn future prompts off from within the dialog.
 */
@Component({
  selector: 'app-move-element-dialog',
  templateUrl: './move-element-dialog.component.html',
  styleUrls: ['./move-element-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { 'data-testid': 'move-element-dialog' },
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    TranslocoModule,
  ],
})
export class MoveElementDialogComponent {
  protected readonly data = inject<MoveElementDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<MoveElementDialogComponent, MoveElementDialogResult>
  );

  /** Whether the user ticked "don't ask again". */
  protected dontAskAgain = false;

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    this.dialogRef.close({ dontAskAgain: this.dontAskAgain });
  }
}
