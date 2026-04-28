import {
  Component,
  computed,
  EventEmitter,
  inject,
  Output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { ProjectsService } from '@inkweld/api/projects.service';
import { type Element, ElementType } from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LoggerService } from '@services/core/logger.service';
import { ProjectService } from '@services/project/project.service';
import { ProjectExportService } from '@services/project/project-export.service';
import { ProjectStateService } from '@services/project/project-state.service';

import { ProjectCoverComponent } from '../../../../components/project-cover/project-cover.component';
import { RecentFilesService } from '../../../../services/project/recent-files.service';
import { base64ToBlob } from '../../../../utils/base64-utils';

@Component({
  selector: 'app-home-tab',
  templateUrl: './home-tab.component.html',
  styleUrl: './home-tab.component.scss',
  imports: [
    MatButtonModule,
    MatIconModule,
    RouterModule,
    MatMenuModule,
    ProjectCoverComponent,
  ],
})
export class HomeTabComponent {
  @Output() importRequested = new EventEmitter<void>();

  protected readonly projectState = inject(ProjectStateService);
  protected readonly projectService = inject(ProjectService);
  protected readonly recentFilesService = inject(RecentFilesService);
  protected readonly exportService = inject(ProjectExportService);
  protected readonly dialogGateway = inject(DialogGatewayService);
  protected readonly projectApi = inject(ProjectsService);
  protected readonly snackBar = inject(MatSnackBar);
  // Router for navigation
  protected readonly router = inject(Router);
  private readonly logger = inject(LoggerService);

  protected readonly hasCover = computed(() => {
    const project = this.projectState.project();
    const coverMediaId = this.projectState.coverMediaId();
    return !!(project?.coverImage || coverMediaId);
  });

  /** Ordered list of pinned elements, resolved against the current element list. */
  protected readonly pinnedElements = computed(() => {
    const ids = this.projectState.pinnedElementIds();
    const elements = this.projectState.elements();
    return ids
      .map(id => elements.find(e => e.id === id))
      .filter((e): e is NonNullable<typeof e> => e !== undefined);
  });

  constructor() {}

  onRecentDocumentClick(documentId: string): void {
    this.openElementById(documentId);
  }

  onPinnedElementClick(element: Element): void {
    this.projectState.openDocument(element);
    const project = this.projectState.project();
    if (project) {
      const typeRoute =
        element.type === ElementType.Folder ? 'folder' : 'document';
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        typeRoute,
        element.id,
      ]);
    }
  }

  private openElementById(documentId: string): void {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === documentId);
    if (element) {
      this.projectState.openDocument(element);
      const project = this.projectState.project();
      if (project) {
        const typeRoute =
          element.type === ElementType.Folder ? 'folder' : 'document';
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

  onNewFileClick(): void {
    const project = this.projectState.project();
    if (project) {
      void this.dialogGateway.openNewElementDialog();
    }
  }

  onExportClick(): void {
    const project = this.projectState.project();
    if (project) {
      void this.exportService.exportProject();
    }
  }

  onGenerateCoverClick(): void {
    const project = this.projectState.project();
    if (project) {
      void this.dialogGateway.openGenerateCoverDialog(project).then(result => {
        // Handle the dialog result from ImageGenerationDialogResult
        if (result?.saved && result.imageData) {
          this.saveCoverImage(project.username, project.slug, result.imageData);
        }
      });
    }
  }

  /**
   * Saves the generated cover image to the project
   */
  private saveCoverImage(
    username: string,
    slug: string,
    imageData: string
  ): void {
    this.logger.debug(
      'HomeTab',
      'Saving cover image for project:',
      username,
      slug
    );

    // Convert base64 to Blob
    const imageBlob = base64ToBlob(imageData);

    // Upload the cover image
    this.projectService
      .uploadProjectCover(username, slug, imageBlob)
      .then(async () => {
        this.logger.debug('HomeTab', 'Cover image uploaded successfully');
        this.snackBar.open('Cover image saved successfully', 'Close', {
          duration: 3000,
        });

        // Refresh the project to get the updated cover image
        try {
          const updatedProject =
            await this.projectService.getProjectByUsernameAndSlug(
              username,
              slug
            );
          this.projectState.updateProject(updatedProject);
        } catch (error) {
          console.error('Failed to refresh project after cover upload:', error);
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
      void this.dialogGateway.openImportProjectDialog(project.username);
    }
  }

  onPublishClick(): void {
    const project = this.projectState.project();
    if (!project) return;

    // Navigate to the publishing tab
    const result = this.projectState.openSystemTab('publish-plans');
    this.projectState.selectTab(result.index);
    void this.router.navigate([
      '/',
      project.username,
      project.slug,
      'publish-plans',
    ]);
  }

  /**
   * Opens the media tab
   */
  openMediaTab(): void {
    const result = this.projectState.openSystemTab('media');
    this.projectState.selectTab(result.index);
    const project = this.projectState.project();
    if (project) {
      void this.router.navigate(['/', project.username, project.slug, 'media']);
    }
  }

  /**
   * Opens the templates tab
   */
  openTemplatesTab(): void {
    const result = this.projectState.openSystemTab('templates-list');
    this.projectState.selectTab(result.index);
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

  /**
   * Opens the project settings tab
   */
  openSettingsTab(): void {
    const result = this.projectState.openSystemTab('settings');
    this.projectState.selectTab(result.index);
    const project = this.projectState.project();
    if (project) {
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        'settings',
      ]);
    }
  }
}
