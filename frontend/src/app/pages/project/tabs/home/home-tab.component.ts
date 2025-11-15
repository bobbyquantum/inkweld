import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  effect,
  EventEmitter,
  inject,
  Output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { ProjectsService } from '@inkweld/api/projects.service';
import { GetApiV1ProjectsUsernameSlugElements200ResponseInnerType } from '@inkweld/index';
import { DialogGatewayService } from '@services/dialog-gateway.service';
import { ProjectService } from '@services/project.service';
import { ProjectImportExportService } from '@services/project-import-export.service';
import { ProjectStateService } from '@services/project-state.service';

import { RecentFilesService } from '../../../../services/recent-files.service';

@Component({
  selector: 'app-home-tab',
  templateUrl: './home-tab.component.html',
  styleUrls: ['./home-tab.component.scss'],
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule],
})
export class HomeTabComponent {
  @Output() importRequested = new EventEmitter<void>();

  protected readonly projectState = inject(ProjectStateService);
  protected readonly projectService = inject(ProjectService);
  protected readonly recentFilesService = inject(RecentFilesService);
  protected readonly importExportService = inject(ProjectImportExportService);
  protected readonly dialogGateway = inject(DialogGatewayService);
  protected readonly projectApi = inject(ProjectsService);
  protected readonly snackBar = inject(MatSnackBar);
  // Router for navigation
  protected readonly router = inject(Router);

  // Cover image state
  protected readonly coverImageUrl = signal<string | null>(null);
  protected readonly coverImageLoading = signal<boolean>(false);
  protected readonly showCoverPlaceholder = computed(
    () => !this.coverImageUrl() && !this.coverImageLoading()
  );

  constructor() {
    // Load cover image when project changes
    effect(() => {
      const project = this.projectState.project();
      if (project) {
        void this.loadCoverImage(project.username, project.slug);
      }
    });
  }

  /**
   * Loads the cover image for the current project
   */
  private async loadCoverImage(username: string, slug: string): Promise<void> {
    this.coverImageLoading.set(true);
    this.coverImageUrl.set(null);

    console.log('[HomeTab] Loading cover image for:', username, slug);

    try {
      const coverBlob = await this.projectService.getProjectCover(
        username,
        slug
      );
      const coverUrl = URL.createObjectURL(coverBlob);
      console.log('[HomeTab] Cover image loaded successfully');
      this.coverImageUrl.set(coverUrl);
      this.coverImageLoading.set(false);
    } catch (error) {
      // Image doesn't exist or failed to load (404 is expected for projects without covers)
      if (error instanceof Error && error.message === 'Cover image not found') {
        console.log('[HomeTab] No cover image set for this project');
      } else {
        console.error('[HomeTab] Failed to load cover image:', error);
      }
      this.coverImageUrl.set(null);
      this.coverImageLoading.set(false);
    }
  }

  onRecentDocumentClick(documentId: string): void {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === documentId);
    if (element) {
      this.projectState.openDocument(element);
      const project = this.projectState.project();
      if (project) {
        const typeRoute =
          element.type ===
          GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Folder
            ? 'folder'
            : 'document';
        void this.router.navigate([
          '/',
          project.username,
          project.slug,
          typeRoute,
          element.id,
        ]);
      }
    }
  }

  onRecentDocumentKeydown(event: KeyboardEvent, documentId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      this.onRecentDocumentClick(documentId);
    }
  }

  onNewFileClick(): void {
    const project = this.projectState.project();
    if (project) {
      void this.dialogGateway.openNewElementDialog();
    }
  }

  onExportClick(): void {
    const project = this.projectState.project();
    if (project) {
      void this.importExportService.exportProjectZip();
    }
  }

  onGenerateCoverClick(): void {
    const project = this.projectState.project();
    if (project) {
      void this.dialogGateway
        .openGenerateCoverDialog(project)
        .then((result: unknown) => {
          // Handle the dialog result which can be false or { approved: true, imageData: string }
          if (result && typeof result === 'object' && 'approved' in result) {
            const approvalResult = result as {
              approved: boolean;
              imageData?: string;
            };
            if (approvalResult.approved && approvalResult.imageData) {
              this.saveCoverImage(
                project.username,
                project.slug,
                approvalResult.imageData
              );
            }
          }
        });
    }
  }

  /**
   * Converts a base64 or data URL string to a Blob
   */
  private base64ToBlob(base64Data: string): Blob {
    // Remove the data URL prefix if present (e.g., "data:image/png;base64,")
    const base64String = base64Data.includes(',')
      ? base64Data.split(',')[1]
      : base64Data;

    // Decode base64
    const byteCharacters = atob(base64String);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    // Determine MIME type from data URL or default to image/png
    let mimeType = 'image/png';
    if (base64Data.startsWith('data:')) {
      const mimeMatch = base64Data.match(/data:([^;]+);/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
    }

    return new Blob([byteArray], { type: mimeType });
  }

  /**
   * Saves the generated cover image to the project
   */
  private saveCoverImage(
    username: string,
    slug: string,
    imageData: string
  ): void {
    console.log('Saving cover image for project:', username, slug);

    // Convert base64 to Blob
    const imageBlob = this.base64ToBlob(imageData);

    // Upload the cover image
    this.projectService
      .uploadProjectCover(username, slug, imageBlob)
      .then(() => {
        console.log('Cover image uploaded successfully');
        this.snackBar.open('Cover image saved successfully', 'Close', {
          duration: 3000,
        });
        // Reload the cover image
        const project = this.projectState.project();
        if (project) {
          void this.loadCoverImage(project.username, project.slug);
        }
      })
      .catch((error: unknown) => {
        console.error('Error uploading cover image:', error);
        this.snackBar.open('Failed to save cover image', 'Close', {
          duration: 5000,
        });
      });
  }

  onImportClick(): void {
    const project = this.projectState.project();
    if (project) {
      this.importRequested.emit();
    }
  }

  onPublishClick(): void {
    const project = this.projectState.project();
    console.log('Publishing project:', project);
    if (project) {
      void this.projectState.publishProject(project);
    }
  }

  /**
   * Opens the project files tab
   */
  openProjectFilesTab(): void {
    this.projectState.openSystemTab('project-files');
    const project = this.projectState.project();
    if (project) {
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        'project-files',
      ]);
    }
  }

  /**
   * Opens the documents tab
   */
  openDocumentsTab(): void {
    this.projectState.openSystemTab('documents-list');
    const project = this.projectState.project();
    if (project) {
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        'documents-list',
      ]);
    }
  }

  /**
   * Opens the templates tab
   */
  openTemplatesTab(): void {
    this.projectState.openSystemTab('templates-list');
    const project = this.projectState.project();
    if (project) {
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        'templates-list',
      ]);
    }
  }
}
