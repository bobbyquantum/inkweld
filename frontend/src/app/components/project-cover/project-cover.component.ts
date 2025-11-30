import { HttpClient } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  signal,
  SimpleChanges,
} from '@angular/core';
import { Project } from '@inkweld/index';

import { SetupService } from '../../services/core/setup.service';
import { OfflineStorageService } from '../../services/offline/offline-storage.service';

export type ProjectCoverVariant = 'card' | 'list' | 'small';

@Component({
  selector: 'app-project-cover',
  standalone: true,
  imports: [],
  templateUrl: './project-cover.component.html',
  styleUrls: ['./project-cover.component.scss'],
})
export class ProjectCoverComponent implements OnChanges, OnDestroy {
  private readonly offlineStorage = inject(OfflineStorageService);
  private readonly setupService = inject(SetupService);
  private readonly http = inject(HttpClient);

  @Input() project!: Project;
  @Input() variant: ProjectCoverVariant = 'card';

  /** Signal for cover blob URL (from IndexedDB) */
  private coverBlobUrl = signal<string | null>(null);

  /** Whether we're in offline mode */
  private isOffline = computed(() => this.setupService.getMode() === 'offline');

  /** Track current project key for cleanup */
  private currentProjectKey: string | null = null;

  /** Track loading state to prevent duplicate fetches */
  private isLoading = false;

  ngOnChanges(changes: SimpleChanges): void {
    // Load cover when project changes
    if (changes['project'] && this.project) {
      void this.loadCover(this.project);
    }
  }

  ngOnDestroy(): void {
    // NOTE: We do NOT revoke blob URLs here. The OfflineStorageService
    // manages URL lifecycle and caches them for reuse across components.
    // Revoking here would invalidate cached URLs, causing ERR_FILE_NOT_FOUND
    // when navigating back to pages that show the same cover.
    this.isLoading = false;
    this.currentProjectKey = null;
  }

  get hasCover(): boolean {
    // Check if we have a blob URL loaded
    return this.coverBlobUrl() != null;
  }

  get projectTitle(): string {
    return this.project?.title ?? 'Project';
  }

  get coverUrl(): string | null {
    return this.coverBlobUrl();
  }

  /**
   * Load cover - first try IndexedDB, then fetch from server if online
   */
  private async loadCover(project: Project): Promise<void> {
    const projectKey = `${project.username}/${project.slug}`;

    // Skip if already loading this project
    if (this.isLoading && this.currentProjectKey === projectKey) {
      return;
    }

    // Clear local state if project changed (but don't revoke URLs - service manages that)
    if (this.currentProjectKey && this.currentProjectKey !== projectKey) {
      this.coverBlobUrl.set(null);
    }
    this.currentProjectKey = projectKey;
    this.isLoading = true;

    try {
      // First, try to get from IndexedDB cache
      let url = await this.offlineStorage.getProjectCoverUrl(
        project.username,
        project.slug
      );

      // If not in cache and we're online, try to fetch from server
      // Only fetch if server is configured (online mode) and project has a cover
      if (!url && !this.isOffline() && project.coverImage) {
        const blob = await this.fetchCoverFromServer(project);
        if (blob) {
          // Save to IndexedDB for future use
          await this.offlineStorage.saveProjectCover(
            project.username,
            project.slug,
            blob
          );
          // Get the blob URL
          url = await this.offlineStorage.getProjectCoverUrl(
            project.username,
            project.slug
          );
        }
      }

      this.coverBlobUrl.set(url);
    } catch (err) {
      console.warn(
        `[ProjectCover] Failed to load cover for ${projectKey}:`,
        err
      );
      this.coverBlobUrl.set(null);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Fetch cover image from server API
   */
  private async fetchCoverFromServer(project: Project): Promise<Blob | null> {
    const baseUrl = this.setupService.getServerUrl();

    // If no server URL is configured (offline mode), don't try to fetch
    if (!baseUrl) {
      return null;
    }

    const url = `${baseUrl}/api/v1/projects/${project.username}/${project.slug}/cover`;

    try {
      const blob = await this.http
        .get(url, {
          responseType: 'blob',
          withCredentials: true,
        })
        .toPromise();
      return blob ?? null;
    } catch {
      // 404 is expected if no cover exists
      console.debug(
        `[ProjectCover] Cover not found on server for ${project.username}/${project.slug}`
      );
      return null;
    }
  }
}
