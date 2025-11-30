import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface RenameDialogData {
  currentName: string;
  title?: string;
}

@Component({
  selector: 'app-rename-dialog',
  template: `
    <h2 mat-dialog-title>{{ data.title || 'Rename Item' }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Name</mat-label>
        <input
          matInput
          [formControl]="nameControl"
          cdkFocusInitial
          (keyup.enter)="onConfirm()"
          data-testid="rename-input"
          placeholder="Enter name" />
        @if (nameControl.hasError('required') && nameControl.touched) {
          <mat-error>Name is required</mat-error>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button
        mat-button
        color="primary"
        [disabled]="!nameControl.valid"
        data-testid="rename-confirm-button"
        (click)="onConfirm()">
        Rename
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
        min-width: 250px;
      }
    `,
  ],
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
})
export class RenameDialogComponent {
  protected readonly data = inject<RenameDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RenameDialogComponent>);

  readonly nameControl: FormControl<string | null> = new FormControl(
    this.data.currentName,
    [Validators.required, Validators.minLength(1)]
  );

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (this.nameControl.valid) {
      this.dialogRef.close(this.nameControl.value);
    }
  }
}
