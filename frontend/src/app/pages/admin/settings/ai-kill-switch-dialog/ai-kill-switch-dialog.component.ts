import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-ai-kill-switch-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './ai-kill-switch-dialog.component.html',
  styleUrl: './ai-kill-switch-dialog.component.scss',
})
export class AiKillSwitchDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<AiKillSwitchDialogComponent>
  );

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
