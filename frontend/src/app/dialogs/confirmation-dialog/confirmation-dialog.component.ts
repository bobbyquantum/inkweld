import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ConfirmationDialogData {
  title: string;
  message: string;
  cancelText?: string;
  confirmText?: string;
  requireConfirmationText?: string;
  /** Optional list of detail lines displayed below the message */
  details?: string[];
}

interface ConfirmationFormValue {
  confirmationInput: string;
}

@Component({
  selector: 'app-confirmation-dialog',
  templateUrl: './confirmation-dialog.component.html',
  styleUrls: ['./confirmation-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
  ],
})
export class ConfirmationDialogComponent {
  protected data = inject<ConfirmationDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<ConfirmationDialogComponent>
  );

  readonly model = signal<ConfirmationFormValue>({ confirmationInput: '' });
  readonly form = form(this.model);

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
