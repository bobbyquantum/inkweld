import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { TagChipListComponent } from '../../components/tags/tag-chip-list.component';

/**
 * Data passed to the tag editor dialog
 */
export interface TagEditorDialogData {
  /** Element ID to edit tags for */
  elementId: string;
  /** Element name for display */
  elementName: string;
}

/**
 * Dialog for editing tags on any element (document or worldbuilding).
 * Used from the editor toolbar for document elements.
 */
@Component({
  selector: 'app-tag-editor-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    TagChipListComponent,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>label</mat-icon>
      Tags for {{ data.elementName }}
    </h2>

    <mat-dialog-content>
      <app-tag-chip-list
        [elementId]="data.elementId"
        label="Tags"
        hint="Add tags to organize your content">
      </app-tag-chip-list>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">Done</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      h2 {
        display: flex;
        align-items: center;
        gap: 8px;

        mat-icon {
          color: var(--mat-sys-primary);
        }
      }

      mat-dialog-content {
        min-width: 300px;
        max-width: 500px;
        padding-top: 16px;
      }
    `,
  ],
})
export class TagEditorDialogComponent {
  readonly dialogRef = inject(MatDialogRef<TagEditorDialogComponent>);
  readonly data = inject<TagEditorDialogData>(MAT_DIALOG_DATA);

  close(): void {
    this.dialogRef.close();
  }
}
