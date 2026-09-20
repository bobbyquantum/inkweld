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
import { TranslocoModule } from '@jsverse/transloco';

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
  host: { 'data-testid': 'confirmation-dialog' },
  imports: [
    MatDialogModule,
    MatButtonModule,
    FormField,
    MatInputModule,
    MatFormFieldModule,
    TranslocoModule,
  ],
})
export class ConfirmationDialogComponent {
  protected data = inject<ConfirmationDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<ConfirmationDialogComponent>
  );
  readonly model = signal<ConfirmationFormValue>({ confirmationInput: '' });
  readonly form = form(this.model);

  /** Reactive detail lines so callers can update them after the dialog opens. */
  protected readonly details = signal<string[]>(this.data.details ?? []);

  /**
   * Replace the detail lines shown below the message. Useful for async content
   * (e.g. loading a storage size before rendering it).
   */
  setDetails(details: string[]): void {
    this.details.set(details);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
