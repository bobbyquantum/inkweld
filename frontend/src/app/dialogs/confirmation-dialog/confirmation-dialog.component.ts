import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-confirmation-dialog',
  template: `
    <h2 mat-dialog-title>Confirm Navigation</h2>
    <mat-dialog-content>
      Are you sure you want to leave this page? Unsaved changes may be lost.
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onStay()">Stay on Page</button>
      <button mat-button color="warn" (click)="onLeave()">Leave Page</button>
    </mat-dialog-actions>
  `,
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
})
export class ConfirmationDialogComponent {
  private dialogRef = inject(MatDialogRef<ConfirmationDialogComponent>);

  onStay() {
    this.dialogRef.close(false);
  }

  onLeave() {
    this.dialogRef.close(true);
  }
}
