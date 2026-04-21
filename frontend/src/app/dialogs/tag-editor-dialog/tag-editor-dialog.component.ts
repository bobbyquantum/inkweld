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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    TagChipListComponent,
  ],
  templateUrl: './tag-editor-dialog.component.html',
  styleUrls: ['./tag-editor-dialog.component.scss'],
})
export class TagEditorDialogComponent {
  readonly dialogRef = inject(MatDialogRef<TagEditorDialogComponent>);
  readonly data = inject<TagEditorDialogData>(MAT_DIALOG_DATA);

  close(): void {
    this.dialogRef.close();
  }
}
