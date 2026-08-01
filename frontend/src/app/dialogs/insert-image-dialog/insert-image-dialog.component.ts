import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnInit,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import { ImageCropperComponent } from 'ngx-image-cropper';

import { BaseImageDialogComponent } from '../base-image-dialog';

export interface InsertImageDialogData {
  username: string;
  slug: string;
  description?: string;
}

export interface InsertImageDialogResult {
  mediaId: string;
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
    TranslocoModule,
    ImageCropperComponent,
  ],
  templateUrl: './insert-image-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./insert-image-dialog.component.scss'],
})
export class InsertImageDialogComponent
  extends BaseImageDialogComponent
  implements OnInit
{
  private readonly dialogData = inject<InsertImageDialogData>(MAT_DIALOG_DATA);

  readonly aspectRatio = 0;
  readonly maintainAspectRatio = false;

  ngOnInit(): void {
    this.username = this.dialogData.username;
    this.slug = this.dialogData.slug;
    this.description = this.dialogData.description ?? '';
  }

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
      this.pendingFileName.set('ai-generated-image.png');
      this.imageBase64.set(base64);
      this.showCropper.set(true);
    } catch (err) {
      console.error('[InsertImageDialog] Failed to process image:', err);
      this.showError('Failed to process generated image. Please try again.');
    }
  }

  applyCroppedImage(): void {
    if (this.croppedBlob()) {
      const mediaId = `img-${crypto.randomUUID()}`;
      this.dialogRef.close({
        mediaId,
        imageBlob: this.croppedBlob()!,
      });
    }
  }
}
