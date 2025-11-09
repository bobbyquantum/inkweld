import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Project } from '@inkweld/index';
import { catchError, finalize, of } from 'rxjs';

import { AIImageGenerationService } from '../../../api-client/api/ai-image-generation.service';
import { ImageGenerateRequestDto } from '../../../api-client/model/image-generate-request-dto';
import { ImageResponseDto } from '../../../api-client/model/image-response-dto';

export interface GenerateCoverDialogData {
  project: Project;
}

@Component({
  selector: 'app-generate-cover-dialog',
  templateUrl: './generate-cover-dialog.component.html',
  styleUrls: ['./generate-cover-dialog.component.scss'],
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
})
export class GenerateCoverDialogComponent implements OnInit {
  dialogRef = inject<MatDialogRef<GenerateCoverDialogComponent>>(MatDialogRef);
  data = inject<GenerateCoverDialogData>(MAT_DIALOG_DATA);
  private aiImageService = inject(AIImageGenerationService);

  loading = false;
  error: string | null = null;
  imageUrl: string | null = null;
  imageBase64: string | null = null;

  constructor() {}

  ngOnInit(): void {
    this.generateCoverImage();
  }

  generateCoverImage(): void {
    this.loading = true;
    this.error = null;
    this.imageUrl = null;
    this.imageBase64 = null;

    // Create a prompt based on the project description
    const projectDescription =
      this.data.project.description || 'A creative project';
    const prompt = `Create a beautiful cover image for a project described as: "${projectDescription}". The image should be in portrait format with vibrant colors and professional styling.`;

    const requestDto: ImageGenerateRequestDto = {
      prompt,
      model: 'gpt-image-1', // Using the latest GPT image generator model
      size: '1024x1536', // Portrait format for gpt-image-1
      quality: 'high', // High quality for best results
      response_format: 'b64_json', // gpt-image-1 always returns b64_json
      background: 'auto', // Let the model decide on appropriate background
    };

    this.aiImageService
      .postImageGenerate(requestDto)
      .pipe(
        catchError((error: unknown) => {
          console.error('Error generating image:', error);
          this.error =
            'Failed to generate cover image. Please try again later.';
          return of(null);
        }),
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe((response: ImageResponseDto | null) => {
        if (response && response.data && response.data.length > 0) {
          if (response.data[0].url) {
            this.imageUrl = response.data[0].url;
          } else if (response.data[0].b64_json) {
            this.imageBase64 = `data:image/png;base64,${response.data[0].b64_json}`;
          }
        } else if (!this.error) {
          this.error = 'No image was generated. Please try again.';
        }
      });
  }

  onApprove(): void {
    // Return the image data (base64 or URL) to the caller
    const imageData = this.imageBase64 || this.imageUrl;
    this.dialogRef.close({ approved: true, imageData });
  }

  onCancel(): void {
    this.dialogRef.close({ approved: false, imageData: null });
  }

  onRetry(): void {
    this.generateCoverImage();
  }
}
