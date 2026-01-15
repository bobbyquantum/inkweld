import {
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  GenerationJob,
  ImageGenerationService,
} from '@services/ai/image-generation.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
import {
  LocalStorageService,
  MediaInfo,
} from '@services/local/local-storage.service';
import { MediaSyncService } from '@services/local/media-sync.service';
import { ProjectStateService } from '@services/project/project-state.service';

import { FileSizePipe } from '../../../../pipes/file-size.pipe';

/**
 * Media item with additional display properties
 */
export interface MediaItem extends MediaInfo {
  /** Blob URL for display */
  url?: string;
  /** Whether this is an image */
  isImage: boolean;
  /** Display category */
  category: 'cover' | 'generated' | 'inline' | 'published' | 'other';
  /** Human-readable category name */
  categoryLabel: string;
}

@Component({
  selector: 'app-media-tab',
  templateUrl: './media-tab.component.html',
  styleUrls: ['./media-tab.component.scss'],
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatMenuModule,
    FileSizePipe,
  ],
})
export class MediaTabComponent implements OnInit, OnDestroy {
  protected readonly projectState = inject(ProjectStateService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly systemConfig = inject(SystemConfigService);
  private readonly generationService = inject(ImageGenerationService);
  private readonly mediaSyncService = inject(MediaSyncService);
  private readonly setupService = inject(SetupService);

  // AI generation status - considers mode, config, and connection state
  readonly aiGenerationStatus = computed(() =>
    this.systemConfig.getAiImageGenerationStatus(
      this.projectState.getSyncState()
    )
  );

  // State signals
  mediaItems = signal<MediaItem[]>([]);
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);
  selectedCategory = signal<string>('all');

  // Stats
  totalSize = signal<number>(0);
  totalCount = signal<number>(0);

  // Active generation jobs for this project
  readonly activeJobs = computed(() => {
    const project = this.projectState.project();
    if (!project?.username || !project?.slug) return [];
    const projectKey = `${project.username}/${project.slug}`;
    return this.generationService
      .getProjectJobs(projectKey)
      .filter(
        j =>
          j.status === 'pending' ||
          j.status === 'generating' ||
          j.status === 'saving'
      );
  });

  // Poll interval for active jobs
  private jobPollInterval: ReturnType<typeof setInterval> | null = null;

  // Track if we've already synced for this project (to avoid repeated syncs)
  private hasSyncedProject: string | null = null;

  // Effect to reload when project changes
  private readonly projectEffect = effect(() => {
    const project = this.projectState.project();
    if (project) {
      void this.loadMedia();
    }
  });

  // Effect to reload media when jobs complete
  private readonly jobEffect = effect(() => {
    const jobs = this.activeJobs();
    // Start/stop polling based on active jobs
    if (jobs.length > 0 && !this.jobPollInterval) {
      this.startJobPolling();
    } else if (jobs.length === 0 && this.jobPollInterval) {
      this.stopJobPolling();
      // Reload media when all jobs complete
      void this.loadMedia();
    }
  });

  ngOnInit(): void {
    void this.loadMedia();
  }

  ngOnDestroy(): void {
    this.projectEffect.destroy();
    this.jobEffect.destroy();
    this.stopJobPolling();
    // Cleanup blob URLs
    this.revokeAllUrls();
  }

  private startJobPolling(): void {
    this.stopJobPolling();
    // Poll every second to update job status display
    this.jobPollInterval = setInterval(() => {
      // Force re-evaluation of activeJobs
      const jobs = this.generationService.jobs();
      // Check if any completed - if so, reload media
      const project = this.projectState.project();
      if (project?.username && project?.slug) {
        const projectKey = `${project.username}/${project.slug}`;
        const projectJobs = jobs.filter(j => j.projectKey === projectKey);
        const hasActive = projectJobs.some(
          j =>
            j.status === 'pending' ||
            j.status === 'generating' ||
            j.status === 'saving'
        );
        if (!hasActive && this.jobPollInterval) {
          this.stopJobPolling();
          void this.loadMedia();
        }
      }
    }, 1000);
  }

  private stopJobPolling(): void {
    if (this.jobPollInterval) {
      clearInterval(this.jobPollInterval);
      this.jobPollInterval = null;
    }
  }

  /**
   * Load all media items for the current project.
   * In online mode, first syncs from server to ensure we have latest media.
   */
  async loadMedia(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const project = this.projectState.project();
      if (!project?.username || !project?.slug) {
        this.error.set('Project not available');
        this.isLoading.set(false);
        return;
      }

      const projectKey = `${project.username}/${project.slug}`;

      // In online/server mode, sync from server on first load for this project
      const mode = this.setupService.getMode();
      if (mode !== 'local' && this.hasSyncedProject !== projectKey) {
        try {
          this.hasSyncedProject = projectKey;
          await this.mediaSyncService.downloadAllFromServer(projectKey);
        } catch (syncErr) {
          // Non-fatal - we'll still show local media
          console.warn('Failed to sync media from server:', syncErr);
        }
      }

      const mediaList = await this.localStorage.listMedia(projectKey);

      // Convert to display items with URLs for images
      const items: MediaItem[] = await Promise.all(
        mediaList.map(async info => {
          const isImage = this.isImageMimeType(info.mimeType);
          const category = this.categorizeMedia(info.mediaId);
          let url: string | undefined;

          if (isImage) {
            url =
              (await this.localStorage.getMediaUrl(projectKey, info.mediaId)) ??
              undefined;
          }

          return {
            ...info,
            url,
            isImage,
            category,
            categoryLabel: this.getCategoryLabel(category),
          };
        })
      );

      // Sort: cover first, then by date (newest first)
      items.sort((a, b) => {
        if (a.category === 'cover') return -1;
        if (b.category === 'cover') return 1;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

      this.mediaItems.set(items);
      this.totalCount.set(items.length);
      this.totalSize.set(items.reduce((sum, item) => sum + item.size, 0));
    } catch (err) {
      console.error('Error loading media:', err);
      this.error.set('Failed to load media');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Get filtered media items based on selected category
   */
  filteredItems(): MediaItem[] {
    const category = this.selectedCategory();
    if (category === 'all') {
      return this.mediaItems();
    }
    return this.mediaItems().filter(item => item.category === category);
  }

  /**
   * Set the category filter
   */
  setCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  /**
   * Truncate a prompt for display
   */
  truncatePrompt(prompt: string, maxLength = 50): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  }

  /**
   * Check if there are active generation jobs
   */
  hasActiveJobs(): boolean {
    return this.activeJobs().length > 0;
  }

  /**
   * Get a display label for a generation job's provider
   */
  getJobProviderLabel(job: GenerationJob): string {
    // Provider comes from the response after generation completes
    const provider = job.response?.provider;
    if (!provider) return 'Generating...';
    switch (provider as string) {
      case 'openrouter':
        return 'OpenRouter';
      case 'openai':
        return 'OpenAI';
      case 'falai':
        return 'Fal.ai';
      case 'stable-diffusion':
        return 'Stable Diffusion';
      default:
        return provider as string;
    }
  }

  /**
   * View an image in the image viewer dialog
   */
  viewImage(item: MediaItem): void {
    if (item.url && item.isImage) {
      this.dialogGateway.openImageViewerDialog({
        imageUrl: item.url,
        fileName: item.filename || item.mediaId,
      });
    }
  }

  /**
   * Download a media item
   */
  async downloadMedia(item: MediaItem): Promise<void> {
    const project = this.projectState.project();
    if (!project?.username || !project?.slug) return;

    const projectKey = `${project.username}/${project.slug}`;
    const blob = await this.localStorage.getMedia(projectKey, item.mediaId);

    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        item.filename || `${item.mediaId}.${this.getExtension(item.mimeType)}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Delete a media item after confirmation
   */
  async deleteMedia(item: MediaItem): Promise<void> {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Delete Media',
      message: `Are you sure you want to delete "${item.filename || item.mediaId}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (confirmed) {
      const project = this.projectState.project();
      if (!project?.username || !project?.slug) return;

      const projectKey = `${project.username}/${project.slug}`;
      await this.localStorage.deleteMedia(projectKey, item.mediaId);
      await this.loadMedia();
    }
  }

  /**
   * Get icon for media item
   */
  getMediaIcon(item: MediaItem): string {
    if (item.isImage) return 'image';
    if (item.mimeType.includes('pdf')) return 'picture_as_pdf';
    if (item.mimeType.includes('epub')) return 'book';
    if (item.mimeType.includes('html') || item.mimeType.includes('markdown'))
      return 'article';
    if (item.mimeType.includes('zip')) return 'folder_zip';
    return 'insert_drive_file';
  }

  /**
   * Format date for display
   */
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Truncate a prompt for display
   */
  truncateJobPrompt(job: GenerationJob): string {
    const prompt = job.request.prompt;
    const maxLength = 60;
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  }

  /**
   * Get status text for a generation job
   */
  getJobStatusText(job: GenerationJob): string {
    switch (job.status) {
      case 'pending':
        return 'Starting...';
      case 'generating':
        return 'Generating...';
      case 'saving':
        return 'Saving...';
      default:
        return job.message;
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private isImageMimeType(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  private categorizeMedia(
    mediaId: string
  ): 'cover' | 'generated' | 'inline' | 'published' | 'other' {
    if (mediaId === 'cover') return 'cover';
    if (mediaId.startsWith('generated-')) return 'generated';
    if (mediaId.startsWith('img-')) return 'inline';
    if (mediaId.startsWith('published-')) return 'published';
    return 'other';
  }

  private getCategoryLabel(
    category: 'cover' | 'generated' | 'inline' | 'published' | 'other'
  ): string {
    switch (category) {
      case 'cover':
        return 'Cover Image';
      case 'generated':
        return 'AI Generated';
      case 'inline':
        return 'Inline Image';
      case 'published':
        return 'Published Export';
      case 'other':
        return 'Other';
    }
  }

  private getExtension(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'application/epub+zip': 'epub',
      'application/pdf': 'pdf',
      'application/zip': 'zip',
      'text/html': 'html',
      'text/markdown': 'md',
    };
    return map[mimeType] || 'bin';
  }

  private revokeAllUrls(): void {
    const project = this.projectState.project();
    if (project?.username && project?.slug) {
      this.localStorage.revokeProjectUrls(
        `${project.username}/${project.slug}`
      );
    }
  }

  /**
   * Open the image generation dialog
   */
  async openImageGenerator(): Promise<void> {
    const result = await this.dialogGateway.openImageGenerationDialog();

    if (result?.saved && result.imageData) {
      // Save the generated image to media library
      const project = this.projectState.project();
      if (!project?.username || !project?.slug) return;

      try {
        // Convert base64/URL to blob
        let blob: Blob;
        if (result.imageData.startsWith('data:')) {
          // Base64 data URL
          const response = await fetch(result.imageData);
          blob = await response.blob();
        } else {
          // Regular URL - fetch it
          const response = await fetch(result.imageData);
          blob = await response.blob();
        }

        // Generate a unique ID for the media
        const timestamp = Date.now();
        const mediaId = `generated-${timestamp}`;
        const projectKey = `${project.username}/${project.slug}`;

        // Save to offline storage
        await this.localStorage.saveMedia(
          projectKey,
          mediaId,
          blob,
          `ai-generated-${timestamp}.png`
        );

        // Reload media list
        await this.loadMedia();
      } catch (err) {
        console.error('Failed to save generated image:', err);
        this.error.set('Failed to save generated image');
      }
    }
  }
}
