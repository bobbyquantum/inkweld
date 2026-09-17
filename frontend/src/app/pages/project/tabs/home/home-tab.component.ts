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
import { Router, RouterModule } from '@angular/router';
import { ProjectsService } from '@inkweld/api/projects.service';
import { type Element } from '@inkweld/index';
import { TranslocoModule } from '@jsverse/transloco';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ElementNavigationService } from '@services/project/element-navigation.service';
import { ProjectExportService } from '@services/project/project-export.service';
import { ProjectStateService } from '@services/project/project-state.service';

import { ProjectCoverComponent } from '../../../../components/project-cover/project-cover.component';
import { RecentFilesService } from '../../../../services/project/recent-files.service';

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
  protected readonly recentFilesService = inject(RecentFilesService);
  protected readonly exportService = inject(ProjectExportService);
  protected readonly dialogGateway = inject(DialogGatewayService);
  protected readonly projectApi = inject(ProjectsService);
  // Router for navigation
  protected readonly router = inject(Router);
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
