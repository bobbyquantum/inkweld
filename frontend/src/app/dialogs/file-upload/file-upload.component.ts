import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { FileSizePipe } from '../../pipes/file-size.pipe';

@Component({
  selector: 'app-file-upload-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatProgressBarModule,
    FileSizePipe,
  ],
  template: `
    <h2 mat-dialog-title>Upload File</h2>
    <mat-dialog-content>
      <div
        class="upload-area"
        (dragover)="onDragOver($event)"
        (drop)="onDrop($event)"
        (click)="fileInput.click()"
        (keydown.enter)="fileInput.click()"
        (keydown.space)="$event.preventDefault(); fileInput.click()"
        tabindex="0"
        role="button"
        aria-label="Select a file to upload">
        <input
          #fileInput
          type="file"
          (change)="onFileSelected($event)"
          style="display: none" />
        @if (!selectedFile) {
          <div class="upload-prompt">
            <p>Drop a file here or click to select</p>
          </div>
        }
        @if (selectedFile) {
          <div class="file-info">
            <p>Selected file: {{ selectedFile.name }}</p>
            <p>Size: {{ selectedFile.size | fileSize }}</p>
          </div>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-button
        color="primary"
        [disabled]="!selectedFile"
        (click)="onUpload()">
        Upload
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .upload-area {
        border: 2px dashed #ccc;
        border-radius: 4px;
        padding: 2rem;
        text-align: center;
        cursor: pointer;
        margin: 1rem 0;
      }
      .upload-area:hover {
        border-color: #666;
      }
      .upload-prompt {
        color: #666;
      }
      .file-info {
        color: #333;
      }
    `,
  ],
})
export class FileUploadComponent {
  selectedFile: File | null = null;

  constructor(private dialogRef: MatDialogRef<FileUploadComponent>) {}

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.selectedFile = files[0];
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile = input.files[0];
    }
  }

  onUpload() {
    if (this.selectedFile) {
      this.dialogRef.close(this.selectedFile);
    }
  }
}
