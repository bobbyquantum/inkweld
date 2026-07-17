import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { form, FormField, maxLength } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/**
 * Data passed to the CreateSnapshotDialog
 */
export interface CreateSnapshotDialogData {
  /** Current document word count (for display) */
  wordCount?: number;
}

/**
 * Result returned from the CreateSnapshotDialog
 */
export interface CreateSnapshotDialogResult {
  name: string;
  description?: string;
}

interface CreateSnapshotFormValue {
  name: string;
  description: string;
}

/**
 * Dialog for creating a new document snapshot
 * Prompts for snapshot name (required) and description (optional)
 */
@Component({
  selector: 'app-create-snapshot-dialog',
  imports: [
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './create-snapshot-dialog.component.html',
  styleUrl: './create-snapshot-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateSnapshotDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<CreateSnapshotDialogComponent>
  );
  data = inject<CreateSnapshotDialogData>(MAT_DIALOG_DATA);

  readonly model = signal<CreateSnapshotFormValue>({
    name: '',
    description: '',
  });

  readonly form = form(this.model, schemaPath => {
    maxLength(schemaPath.name, 100, {
      message: 'Name cannot exceed 100 characters',
    });
    maxLength(schemaPath.description, 500, {
      message: 'Description cannot exceed 500 characters',
    });
  });

  /**
   * Handle form submission
   * If name is left blank, auto-generates an ISO date-time name
   */
  onSubmit() {
    if (this.form().valid()) {
      const { name, description } = this.model();
      const trimmedName = name.trim();

      const result: CreateSnapshotDialogResult = {
        // If name is blank, use ISO date-time format
        name: trimmedName || new Date().toISOString(),
        description: description.trim() || undefined,
      };
      this.dialogRef.close(result);
    }
  }

  /**
   * Cancel and close the dialog
   */
  onCancel() {
    this.dialogRef.close();
  }
}
