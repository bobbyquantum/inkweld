import { HttpClient } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  signal,
  SimpleChanges,
} from '@angular/core';
import { Project } from '@inkweld/index';

import { SetupService } from '../../services/core/setup.service';
import { LocalStorageService } from '../../services/local/local-storage.service';
import { MediaSyncService } from '../../services/local/media-sync.service';

export type ProjectCoverVariant = 'card' | 'list' | 'small';

@Component({
  selector: 'app-project-cover',
  standalone: true,
  imports: [],
  templateUrl: './project-cover.component.html',
  styleUrls: ['./project-cover.component.scss'],
})
export class ProjectCoverComponent implements OnChanges, OnDestroy {
  private readonly localStorage = inject(LocalStorageService);
  private readonly setupService = inject(SetupService);
  private readonly http = inject(HttpClient);
  private readonly mediaSyncService = inject(MediaSyncService);
  private readonly destroyRef = inject(DestroyRef);

  @Input() project!: Project;
  @Input() variant: ProjectCoverVariant = 'card';

  /**
   * Optional cover media ID (from Yjs sync).
   * When provided, uses the new offline-first approach to load cover.
   * Falls back to legacy approach if not provided.
   */
  @Input() coverMediaId?: string;

  /** Signal for cover blob URL (from IndexedDB) */
  private coverBlobUrl = signal<string | null>(null);

  /** Whether we're in offline mode */
  private isOffline = computed(() => this.setupService.getMode() === 'local');

  /** Track current project key for cleanup */
  private currentProjectKey: string | null = null;

  /** Track current coverMediaId to detect changes */
  private currentCoverMediaId: string | undefined = undefined;

  /** Track loading state to prevent duplicate fetches */
  private isLoading = false;

  /** Track the last sync version to detect changes */
  private lastSyncVersion = 0;

  constructor() {
    // Watch for media sync completions and reload cover if needed
    effect(() => {
      const syncVersion = this.mediaSyncService.mediaSyncVersion();
      if (syncVersion > this.lastSyncVersion && this.project) {
        this.lastSyncVersion = syncVersion;
        // Force reload cover — server media may have changed (e.g. MCP updated cover)
        this.coverBlobUrl.set(null);
        void this.loadCover(this.project);
      } else {
        this.lastSyncVersion = syncVersion;
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Load cover when project or coverMediaId changes
    if (changes['project'] || changes['coverMediaId']) {
      if (this.project) {
        void this.loadCover(this.project);
      }
    }
  }

  ngOnDestroy(): void {
    // NOTE: We do NOT revoke blob URLs here. The LocalStorageService
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
   * Load cover - first try IndexedDB (with coverMediaId or legacy key), then fetch from server if online
   */
  private async loadCover(project: Project): Promise<void> {
    const projectKey = `${project.username}/${project.slug}`;

    // Skip if already loading this exact project+coverMediaId combination
    if (
      this.isLoading &&
      this.currentProjectKey === projectKey &&
      this.currentCoverMediaId === this.coverMediaId
    ) {
      return;
    }

    // Clear local state if project or coverMediaId changed
    if (
      this.currentProjectKey !== projectKey ||
      this.currentCoverMediaId !== this.coverMediaId
    ) {
      this.coverBlobUrl.set(null);
    }
    this.currentProjectKey = projectKey;
    this.currentCoverMediaId = this.coverMediaId;
    this.isLoading = true;

    try {
      let url: string | null = null;

      // Determine the effective media ID: prefer coverMediaId (from Yjs),
      // then derive from project.coverImage filename, fall back to legacy 'cover'
      const effectiveMediaId =
        this.coverMediaId ||
        (project.coverImage
          ? project.coverImage.replace(/\.[^.]+$/, '')
          : undefined);

      // Try loading from IndexedDB using the effective media ID
      if (effectiveMediaId) {
        url = await this.localStorage.getMediaUrl(projectKey, effectiveMediaId);
      }

      // Fall back to legacy approach (fixed 'cover' key) for backward compatibility
      if (!url) {
        url = await this.localStorage.getProjectCoverUrl(
          project.username,
          project.slug
        );
      }

      // If not in cache and we're online, try to fetch from server
      // Only fetch if server is configured (online mode) and project has a cover
      if (!url && !this.isOffline() && project.coverImage) {
        const blob = await this.fetchCoverFromServer(project);
        if (blob) {
          // Save to IndexedDB using the effective media ID (or derive from coverImage)
          const saveMediaId =
            effectiveMediaId || project.coverImage.replace(/\.[^.]+$/, '');
          await this.localStorage.saveMedia(projectKey, saveMediaId, blob);
          url = await this.localStorage.getMediaUrl(projectKey, saveMediaId);
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
