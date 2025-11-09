import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
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
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './create-snapshot-dialog.component.html',
  styleUrl: './create-snapshot-dialog.component.scss',
})
export class CreateSnapshotDialogComponent {
  dialogRef = inject(MatDialogRef<CreateSnapshotDialogComponent>);
  data = inject<CreateSnapshotDialogData>(MAT_DIALOG_DATA);
  fb = inject(FormBuilder);

  form: FormGroup;

  constructor() {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.maxLength(500)]],
    });
  }

  /**
   * Handle form submission
   */
  onSubmit() {
    if (this.form.valid) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const formValue = this.form.value;
      const result: CreateSnapshotDialogResult = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        name: (formValue.name || '').trim() as string,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        description: formValue.description?.trim() || undefined,
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




