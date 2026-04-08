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
  template: `
    <h2 mat-dialog-title>Add Comment</h2>

    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Comment</mat-label>
        <textarea
          matInput
          [(ngModel)]="commentText"
          placeholder="Write your comment..."
          rows="3"
          maxlength="2000"
          cdkTextareaAutosize
          data-testid="comment-text-input"
          (keydown.meta.enter)="onSubmit()"
          (keydown.control.enter)="onSubmit()"></textarea>
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()" data-testid="cancel-comment-btn">
        Cancel
      </button>
      <button
        mat-raised-button
        color="primary"
        [disabled]="!commentText.trim()"
        (click)="onSubmit()"
        data-testid="submit-comment-btn">
        Comment
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .full-width {
        width: 100%;
      }
    `,
  ],
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
