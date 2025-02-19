import { CommonModule } from '@angular/common';
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

@Component({
  selector: 'app-image-element-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-element-editor.component.html',
  styleUrl: './image-element-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageElementEditorComponent implements OnInit {
  @Input() elementId?: string;
  imageUrl: string | SafeUrl | null = null;

  private projectApiService = inject(ProjectAPIService);
  private projectStateService = inject(ProjectStateService);
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
}
