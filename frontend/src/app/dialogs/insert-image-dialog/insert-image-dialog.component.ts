import { Component, inject, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ImageCropperComponent } from 'ngx-image-cropper';

import { BaseImageDialogComponent } from '../base-image-dialog';

/**
 * Data passed to the dialog
 */
export interface InsertImageDialogData {
  /** Project username for media library access */
  username: string;
  /** Project slug for media library access */
  slug: string;
  /** Optional description for AI prompt */
  description?: string;
}

/**
 * Result returned from the dialog
 */
export interface InsertImageDialogResult {
  /** The media ID for insertion (e.g., "img-xxx") */
  mediaId: string;
  /** The image blob for storage */
  imageBlob: Blob;
}

@Component({
  selector: 'app-insert-image-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    ImageCropperComponent,
  ],
  templateUrl: './insert-image-dialog.component.html',
  styleUrls: ['./insert-image-dialog.component.scss'],
})
export class InsertImageDialogComponent
  extends BaseImageDialogComponent
  implements OnInit
{
  private readonly dialogData = inject<InsertImageDialogData>(MAT_DIALOG_DATA);

  // Free aspect ratio for document images (no fixed ratio)
  readonly aspectRatio = 0;
  readonly maintainAspectRatio = false;

  ngOnInit(): void {
    this.username = this.dialogData.username;
    this.slug = this.dialogData.slug;
    this.description = this.dialogData.description ?? '';
  }

  // --- AI Generation ---

  async openGenerateDialog(): Promise<void> {
    const result = await this.dialogGateway.openImageGenerationDialog({
      forCover: false,
      prompt: this.description || undefined,
    });

    if (!result?.saved || !result.imageData) {
      return;
    }

    try {
      const blob = await this.extractImageBlob(result.imageData);
      const base64 = await this.blobToBase64(blob);

      this.resetCropperState();
      this.pendingFileName = 'ai-generated-image.png';
      this.imageBase64 = base64;
      this.showCropper = true;
      this.cdr.detectChanges();
    } catch (err) {
      console.error('[InsertImageDialog] Failed to process image:', err);
      this.showError('Failed to process generated image. Please try again.');
    }
  }

  // --- Apply Cropped Image ---

  applyCroppedImage(): void {
    if (this.croppedBlob) {
      const mediaId = `img-${crypto.randomUUID()}`;
      this.dialogRef.close({
        mediaId,
        imageBlob: this.croppedBlob,
      } as InsertImageDialogResult);
    }
  }
}
