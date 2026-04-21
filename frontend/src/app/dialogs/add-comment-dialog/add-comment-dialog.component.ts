import { TextFieldModule } from '@angular/cdk/text-field';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-add-comment-dialog',
  imports: [
    TextFieldModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './add-comment-dialog.component.html',
  styleUrls: ['./add-comment-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddCommentDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<AddCommentDialogComponent>);

  commentText = '';

  onSubmit(): void {
    const text = this.commentText.trim();
    if (text) {
      this.dialogRef.close(text);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
