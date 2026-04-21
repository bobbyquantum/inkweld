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
  templateUrl: './rename-dialog.component.html',
  styleUrls: ['./rename-dialog.component.scss'],
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
