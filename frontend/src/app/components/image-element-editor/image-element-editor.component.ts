import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  OnInit,
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

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
export class ImageElementEditorComponent implements OnInit {
  @Input() elementId?: string;
  imageUrl: string | SafeUrl | null = null;
  selectedFile: File | null = null;
  metadata: ImageMetadata | null = null;
  projectApiService = inject(ProjectAPIService);
  projectStateService = inject(ProjectStateService);
  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);

  ngOnInit(): void {
    if (this.elementId) {
      const project = this.projectStateService.project();
      if (!project || !project.user || !project.slug) {
        return;
      }
      const username = project.user.username;
      const slug = project.slug;
      this.projectApiService
        .projectElementControllerDownloadImage(
          username,
          slug,
          this.elementId,
          'body',
          false,
          { httpHeaderAccept: 'image/*' }
        )
        .subscribe({
          next: (response: unknown) => {
            const blob = response as Blob;
            const objectUrl = URL.createObjectURL(blob);
            this.imageUrl = this.sanitizer.bypassSecurityTrustUrl(objectUrl);
            this.cdr.markForCheck();
          },
          error: (error: unknown) =>
            console.error('Error downloading image', error),
        });
    }
  }

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.selectedFile = file;
      const objectUrl = URL.createObjectURL(file);
      this.imageUrl = this.sanitizer.bypassSecurityTrustUrl(objectUrl);
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
    this.cdr.markForCheck();
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
            console.log('Image uploaded successfully', response);
          },
          error: (error: unknown) => {
            console.error('Image upload error', error);
          },
        });
    } else {
      console.warn('No file selected or elementId missing');
    }
  }
}
