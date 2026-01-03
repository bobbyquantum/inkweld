import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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

/**
 * Dialog for creating a new document snapshot
 * Prompts for snapshot name (required) and description (optional)
 */
@Component({
  selector: 'app-create-snapshot-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
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
  private dialogRef = inject(MatDialogRef<CreateSnapshotDialogComponent>);
  data = inject<CreateSnapshotDialogData>(MAT_DIALOG_DATA);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  form = this.fb.nonNullable.group({
    name: ['', [Validators.maxLength(100)]],
    description: ['', [Validators.maxLength(500)]],
  });

  /**
   * Handle form submission
   * If name is left blank, auto-generates an ISO date-time name
   */
  onSubmit() {
    // Force change detection to ensure form values are updated from inputs
    this.cdr.detectChanges();

    if (this.form.valid) {
      const { name, description } = this.form.getRawValue();
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
