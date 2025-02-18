import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
} from '@angular/core';

import { ProjectAPIService } from '../../../api-client/api/project-api.service';
import { ProjectStateService } from '../../services/project-state.service';

interface ImageMetadata {
  size?: number;
  contentType?: string;
  lastModified?: Date;
}

@Component({
  selector: 'app-image-element-editor',
  standalone: true,
  templateUrl: './image-element-editor.component.html',
  styleUrl: './image-element-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageElementEditorComponent {
  @Input() elementId?: string;
  imageUrl: string | null = null;
  selectedFile: File | null = null;
  metadata: ImageMetadata | null = null;
  projectApiService = inject(ProjectAPIService);
  projectStateService = inject(ProjectStateService);

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.selectedFile = file;
      this.imageUrl = URL.createObjectURL(file);
      this.metadata = {
        size: file.size,
        contentType: file.type,
        lastModified: new Date(file.lastModified),
      };
    } else {
      this.imageUrl = null;
      this.selectedFile = null;
      this.metadata = null;
    }
  }

  uploadImage(): void {
    if (this.selectedFile && this.elementId) {
      const username = this.projectStateService.project()?.user?.username;
      const slug = this.projectStateService.project()?.slug;

      if (!username || !slug) {
        console.error('Username or slug not found in project state');
        return;
      }

      this.projectApiService
        .projectElementControllerUploadImage(
          username,
          slug,
          this.elementId,
          this.selectedFile
        )
        .subscribe({
          next: (response: unknown) => {
            // Type 'response' as 'any' for now, refine later
            console.log('Image uploaded successfully', response);
            // Handle success, e.g., display success message, update metadata
          },
          error: (error: unknown) => {
            // Type 'error' as 'any' for now, refine later
            console.error('Image upload error', error);
            // Handle error, e.g., display error message
          },
        });
    } else {
      console.warn('No file selected or elementId missing');
    }
  }
}
