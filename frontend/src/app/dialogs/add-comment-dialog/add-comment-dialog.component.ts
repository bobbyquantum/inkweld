import { TextFieldModule } from '@angular/cdk/text-field';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { form, FormField, maxLength } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

interface AddCommentFormValue {
  commentText: string;
}

@Component({
  selector: 'app-add-comment-dialog',
  imports: [
    TextFieldModule,
    FormField,
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

  readonly model = signal<AddCommentFormValue>({ commentText: '' });
  readonly form = form(this.model, schemaPath => {
    maxLength(schemaPath.commentText, 2000, {
      message: 'Comment cannot exceed 2000 characters',
    });
  });

  onSubmit(): void {
    const text = this.model().commentText.trim();
    if (text) {
      this.dialogRef.close(text);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
