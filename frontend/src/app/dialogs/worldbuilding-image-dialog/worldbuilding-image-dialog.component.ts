import { Component, inject, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type SafeUrl } from '@angular/platform-browser';
import { ImageCropperComponent } from 'ngx-image-cropper';

import { formatWorldbuildingFields } from '../../utils/worldbuilding.utils';
import { BaseImageDialogComponent } from '../base-image-dialog';

/**
 * Data passed to the dialog
 */
export interface WorldbuildingImageDialogData {
  /** Element ID (for passing to image generation) */
  elementId: string;
  /** Element name for display */
  elementName: string;
  /** Project username for media library access */
  username: string;
  /** Project slug for media library access */
  slug: string;
  /** Current image URL if any */
  currentImage?: string;
  /** Description for AI prompt */
  description?: string;
  /** Worldbuilding field:value pairs for AI prompt */
  worldbuildingFields?: Record<string, unknown>;
}

/**
 * Result returned from the dialog
 */
export interface WorldbuildingImageDialogResult {
  /** The image data (base64 or object URL) */
  imageData?: string;
  /** The image blob for storage */
  imageBlob?: Blob;
  /** Whether the image was removed */
  removed?: boolean;
}

@Component({
  selector: 'app-worldbuilding-image-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    ImageCropperComponent,
  ],
  templateUrl: './worldbuilding-image-dialog.component.html',
  styleUrls: ['./worldbuilding-image-dialog.component.scss'],
})
export class WorldbuildingImageDialogComponent
  extends BaseImageDialogComponent
  implements OnInit
{
  private readonly dialogData =
    inject<WorldbuildingImageDialogData>(MAT_DIALOG_DATA);

  // Worldbuilding-specific data
  elementName = '';
  currentImageUrl?: SafeUrl;
  hasCurrentImage = false;
  worldbuildingFields: Record<string, unknown> = {};

  // Square aspect ratio for worldbuilding images
  readonly aspectRatio = 1;

  ngOnInit(): void {
    this.elementName = this.dialogData.elementName;
    this.username = this.dialogData.username;
    this.slug = this.dialogData.slug;

    if (this.dialogData.currentImage) {
      this.currentImageUrl = this.sanitizer.bypassSecurityTrustUrl(
        this.dialogData.currentImage
      );
      this.hasCurrentImage = true;
    }

    this.description = this.dialogData.description ?? '';
    this.worldbuildingFields = this.dialogData.worldbuildingFields ?? {};
  }

  // --- AI Generation ---

  private buildInitialPrompt(): string {
    const parts: string[] = [];

    if (this.elementName) {
      parts.push(this.elementName);
    }
    if (this.description) {
      parts.push(this.description);
    }

    const formattedFields = formatWorldbuildingFields(this.worldbuildingFields);
    if (formattedFields) {
      parts.push(formattedFields);
    }

    return parts.join('. ');
  }

  async openGenerateDialog(): Promise<void> {
    const initialPrompt = this.buildInitialPrompt();

    const result = await this.dialogGateway.openImageGenerationDialog({
      forCover: false,
      prompt: initialPrompt || undefined,
      selectedElementIds: [this.dialogData.elementId],
    });

    if (!result?.saved || !result.imageData) {
      return;
    }

    try {
      const blob = await this.extractImageBlob(result.imageData);

      this.dialogRef.close({
        imageData: result.imageData,
        imageBlob: blob,
      } as WorldbuildingImageDialogResult);
    } catch (err) {
      console.error('[WorldbuildingImageDialog] Failed to process image:', err);
      this.showError('Failed to process generated image. Please try again.');
    }
  }

  // --- Apply Cropped Image ---

  applyCroppedImage(): void {
    if (this.croppedBlob && this.croppedImage) {
      void this.blobToBase64(this.croppedBlob).then(base64 => {
        this.dialogRef.close({
          imageData: base64,
          imageBlob: this.croppedBlob,
        } as WorldbuildingImageDialogResult);
      });
    }
  }

  // --- Remove Image ---

  removeImage(): void {
    this.dialogRef.close({
      removed: true,
    } as WorldbuildingImageDialogResult);
  }
}
