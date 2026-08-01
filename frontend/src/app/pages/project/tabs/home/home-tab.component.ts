import {
  ChangeDetectionStrategy,
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
import { type Element } from '@inkweld/index';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LoggerService } from '@services/core/logger.service';
import { ElementNavigationService } from '@services/project/element-navigation.service';
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
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    MatButtonModule,
    MatIconModule,
    RouterModule,
    MatMenuModule,
    TranslocoModule,
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
  private readonly transloco = inject(TranslocoService);
  private readonly elementNavigation = inject(ElementNavigationService);

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
    this.elementNavigation.openElement(element);
  }

  private openElementById(documentId: string): void {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === documentId);
    if (element) {
      this.elementNavigation.openElement(element);
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
        } else if (result?.saved) {
          // saved without usable image data — never fail silently.
          this.snackBar.open(
            this.transloco.translate('project.homeTab.coverSaveFailed'),
            this.transloco.translate('close'),
            { duration: 5000 }
          );
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

    // Convert data URL to Blob. Guarded: a malformed/non-base64 payload used
    // to throw inside the dialog .then() chain — an unhandled rejection the
    // user experienced as "nothing happened".
    let imageBlob: Blob;
    try {
      imageBlob = base64ToBlob(imageData);
    } catch (error) {
      console.error('Cover image data is not a valid data URL:', error);
      this.snackBar.open(
        this.transloco.translate('project.homeTab.coverSaveFailed'),
        this.transloco.translate('close'),
        { duration: 5000 }
      );
      return;
    }

    // Upload the cover image
    this.projectService
      .uploadProjectCover(username, slug, imageBlob)
      .then(coverFilename => {
        this.logger.debug('HomeTab', 'Cover image uploaded successfully');
        this.snackBar.open(
          this.transloco.translate('project.homeTab.coverSaved'),
          this.transloco.translate('close'),
          { duration: 3000 }
        );

        // Propagate the new cover via Yjs project meta (offline-first: this
        // is what the cover components render from). The filename stem is the
        // coverMediaId, matching the edit-project dialog's convention. No
        // server round-trip needed — the previous implementation refreshed
        // through the server-only ProjectService, which broke in local mode
        // and dropped the coverMediaId entirely.
        const coverMediaId = coverFilename.replace(/\.[^.]+$/, '');
        const project = this.projectState.project();
        if (project) {
          this.projectState.updateProject(project, coverMediaId);
        }
      })
      .catch((error: unknown) => {
        console.error('Error uploading cover image:', error);
        this.snackBar.open(
          this.transloco.translate('project.homeTab.coverSaveFailed'),
          this.transloco.translate('close'),
          { duration: 5000 }
        );
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
