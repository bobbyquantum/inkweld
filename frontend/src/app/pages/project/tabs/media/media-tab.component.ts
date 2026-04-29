import { BreakpointObserver } from '@angular/cdk/layout';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { type MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { createMediaUrl, extractMediaId } from '@components/image-paste';
import { MediaItemCardComponent } from '@components/media-item-card/media-item-card.component';
import { type TagDefinition } from '@components/tags/tag.model';
import {
  AddMediaDialogComponent,
  type AddMediaDialogData,
  type AddMediaDialogResult,
} from '@dialogs/add-media-dialog/add-media-dialog.component';
import { FileUploadComponent } from '@dialogs/file-upload/file-upload.component';
import {
  TagPickerDialogComponent,
  type TagPickerDialogData,
  type TagPickerDialogResult,
} from '@dialogs/tag-picker-dialog/tag-picker-dialog.component';
import { ElementType } from '@inkweld/index';
import type { CanvasConfig } from '@models/canvas.model';
import {
  type GenerationJob,
  ImageGenerationService,
} from '@services/ai/image-generation.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
import {
  LocalStorageService,
  type MediaInfo,
} from '@services/local/local-storage.service';
import { MediaSyncService } from '@services/local/media-sync.service';
import { MediaTagService } from '@services/media-tag/media-tag.service';
import { DocumentService } from '@services/project/document.service';
import { MediaProjectTagService } from '@services/project/media-project-tag.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { MediaAutoSyncService } from '@services/sync/media-auto-sync.service';
import { TagService } from '@services/tag/tag.service';
import { firstValueFrom } from 'rxjs';

import { FileSizePipe } from '../../../../pipes/file-size.pipe';
import {
  type FilterElement,
  type FilterTag,
  type MediaCategory as FilterCategory,
  MediaFilterPanelComponent,
  type MediaFilterState,
} from './media-filter-panel/media-filter-panel.component';

export type MediaCategory =
  | 'cover'
  | 'generated'
  | 'inline'
  | 'published'
  | 'other';

/**
 * Media item with additional display properties
 */
export interface MediaItem extends MediaInfo {
  /** Blob URL for display */
  url?: string;
  /** Whether this is an image */
  isImage: boolean;
  /** Display category */
  category: MediaCategory;
  /** Human-readable category name */
  categoryLabel: string;
}

@Component({
  selector: 'app-media-tab',
  templateUrl: './media-tab.component.html',
  styleUrls: ['./media-tab.component.scss'],
  imports: [
    FormsModule,
    MatBadgeModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MediaItemCardComponent,
    MatSidenavModule,
    MatTooltipModule,
    FileSizePipe,
    MediaFilterPanelComponent,
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
  private readonly mediaAutoSync = inject(MediaAutoSyncService);
  private readonly mediaTagService = inject(MediaTagService);
  private readonly mediaProjectTagService = inject(MediaProjectTagService);
  private readonly tagService = inject(TagService);
  private readonly documentService = inject(DocumentService);
  private readonly dialog = inject(MatDialog);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly destroyRef = inject(DestroyRef);

  /** Reference to the filter sidenav (large screens) */
  readonly filterSidenav = viewChild<MatSidenav>('filterSidenav');

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
  searchQuery = signal<string>('');

  /** Unified filter state */
  readonly filterState = signal<MediaFilterState>({
    category: 'all',
    elementIds: [],
    tagIds: [],
    dateFrom: null,
    dateTo: null,
  });

  /** Whether we're on a small screen */
  readonly isSmallScreen = signal(false);

  /** localStorage key prefix for persisting search/filter state */
  private get storageKeyPrefix(): string {
    const project = this.projectState.project();
    if (!project?.username || !project?.slug) return '';
    return `media-tab:${project.username}:${project.slug}`;
  }

  /** Persist search query and filter state to localStorage */
  private readonly persistEffect = effect(() => {
    const query = this.searchQuery();
    const filters = this.filterState();
    const prefix = this.storageKeyPrefix;
    if (!prefix) return;

    try {
      globalThis.localStorage.setItem(`${prefix}:search`, query);
      globalThis.localStorage.setItem(
        `${prefix}:filters`,
        JSON.stringify({
          category: filters.category,
          elementIds: filters.elementIds,
          tagIds: filters.tagIds,
          // Dates stored as ISO strings (or null)
          dateFrom: filters.dateFrom?.toISOString() ?? null,
          dateTo: filters.dateTo?.toISOString() ?? null,
        })
      );
    } catch {
      // localStorage may be unavailable — silently ignore
    }
  });

  // Legacy compatibility — keep these as computed from filterState
  selectedCategory = computed(() => this.filterState().category);
  elementFilter = computed(() =>
    this.filterState().elementIds.length === 1
      ? this.filterState().elementIds[0]
      : null
  );
  tagFilter = computed(() =>
    this.filterState().tagIds.length === 1 ? this.filterState().tagIds[0] : null
  );

  /** Number of active filters (for badge) */
  readonly activeFilterCount = computed(() => {
    const f = this.filterState();
    let count = 0;
    if (f.category !== 'all') count++;
    count += f.elementIds.length;
    count += f.tagIds.length;
    if (f.dateFrom) count++;
    if (f.dateTo) count++;
    return count;
  });

  /** Available elements for filter panel */
  readonly filterElements = computed<FilterElement[]>(() => {
    return this.projectState
      .elements()
      .filter(
        el =>
          el.type === ElementType.Worldbuilding || el.type === ElementType.Item
      )
      .map(el => ({
        id: el.id,
        name: el.name,
        icon: this.getElementIcon(el.id),
      }));
  });

  /** Available tags for filter panel */
  readonly filterTags = computed<FilterTag[]>(() => {
    return this.tagService.allTags().map(t => ({
      id: t.id,
      name: t.name,
      icon: t.icon,
      color: t.color,
    }));
  });

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

  // Effect to reload media when a background sync finishes downloading files.
  // mediaSyncVersion is incremented by MediaSyncService after each download batch.
  private syncVersionAtLoad = 0;
  private readonly syncVersionEffect = effect(() => {
    const version = this.mediaSyncService.mediaSyncVersion();
    // Skip the initial run — we already load media in ngOnInit/projectEffect
    if (version > this.syncVersionAtLoad) {
      this.syncVersionAtLoad = version;
      void this.loadMedia();
    }
  });

  ngOnInit(): void {
    this.restorePersistedState();
    void this.loadMedia();

    // Track viewport size for responsive filter panel
    this.breakpointObserver
      .observe('(max-width: 900px)')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => this.isSmallScreen.set(result.matches));
  }

  ngOnDestroy(): void {
    this.projectEffect.destroy();
    this.jobEffect.destroy();
    this.syncVersionEffect.destroy();
    this.persistEffect.destroy();
    this.stopJobPolling();
    // Cleanup blob URLs
    this.revokeAllUrls();
  }

  /** Restore persisted search query and filter state from localStorage */
  private restorePersistedState(): void {
    const prefix = this.storageKeyPrefix;
    if (!prefix) return;

    try {
      const savedQuery = globalThis.localStorage.getItem(`${prefix}:search`);
      if (savedQuery) {
        this.searchQuery.set(savedQuery);
      }

      const savedFilters = globalThis.localStorage.getItem(`${prefix}:filters`);
      if (savedFilters) {
        const parsed = JSON.parse(savedFilters) as {
          category?: string;
          elementIds?: string[];
          tagIds?: string[];
          dateFrom?: string | null;
          dateTo?: string | null;
        };
        this.filterState.set({
          category: (parsed.category as MediaFilterState['category']) ?? 'all',
          elementIds: Array.isArray(parsed.elementIds) ? parsed.elementIds : [],
          tagIds: Array.isArray(parsed.tagIds) ? parsed.tagIds : [],
          dateFrom: parsed.dateFrom ? new Date(parsed.dateFrom) : null,
          dateTo: parsed.dateTo ? new Date(parsed.dateTo) : null,
        });
      }
    } catch {
      // Corrupted data — ignore and use defaults
    }
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
   * Filtered media items based on filter state and search query.
   * Uses computed() for automatic reactivity and memoization.
   */
  readonly filteredItems = computed(() => {
    const { category, elementIds, tagIds, dateFrom, dateTo } =
      this.filterState();
    const query = this.searchQuery().trim().toLowerCase();

    let items = this.mediaItems();

    if (category !== 'all') {
      items = items.filter(item => item.category === category);
    }

    // Multi-element filter: item must be tagged with ALL selected elements
    if (elementIds.length > 0) {
      items = items.filter(item => {
        const tagged = new Set(
          this.mediaTagService.getElementsForMedia(item.mediaId)
        );
        return elementIds.every(id => tagged.has(id));
      });
    }

    // Multi-tag filter: item must be tagged with ALL selected tags
    if (tagIds.length > 0) {
      items = items.filter(item => {
        const tagged = new Set(
          this.mediaProjectTagService.getTagsForMedia(item.mediaId)
        );
        return tagIds.every(id => tagged.has(id));
      });
    }

    // Date range filter
    if (dateFrom) {
      const fromTime = dateFrom.getTime();
      items = items.filter(
        item => new Date(item.createdAt).getTime() >= fromTime
      );
    }
    if (dateTo) {
      // Include the entire "to" day
      const toTime = new Date(dateTo).setHours(23, 59, 59, 999);
      items = items.filter(
        item => new Date(item.createdAt).getTime() <= toTime
      );
    }

    if (query) {
      // Build lookup of element names and project tag names matching the query
      const matchingElementIds = new Set(
        this.projectState
          .elements()
          .filter(el => el.name.toLowerCase().includes(query))
          .map(el => el.id)
      );
      const matchingTagIds = new Set(
        this.tagService
          .allTags()
          .filter(t => t.name.toLowerCase().includes(query))
          .map(t => t.id)
      );

      items = items.filter(item => {
        const filename = (item.filename || '').toLowerCase();
        const mediaId = item.mediaId.toLowerCase();
        const prompt = (item.generation?.prompt || '').toLowerCase();

        // Match by filename, mediaId, or generation prompt
        if (
          filename.includes(query) ||
          mediaId.includes(query) ||
          prompt.includes(query)
        ) {
          return true;
        }

        // Match by tagged element names
        const taggedElementIds = this.mediaTagService.getElementsForMedia(
          item.mediaId
        );
        if (taggedElementIds.some(id => matchingElementIds.has(id))) {
          return true;
        }

        // Match by project tag names
        const taggedTagIds = this.mediaProjectTagService.getTagsForMedia(
          item.mediaId
        );
        if (taggedTagIds.some(id => matchingTagIds.has(id))) {
          return true;
        }

        return false;
      });
    }

    return items;
  });

  /**
   * Total size of filtered items
   */
  readonly filteredSize = computed(() => {
    return this.filteredItems().reduce((sum, item) => sum + item.size, 0);
  });

  /**
   * Clear the search query
   */
  clearSearch(): void {
    this.searchQuery.set('');
  }

  /**
   * Open filter panel (sidenav toggle — overlay on mobile, side on desktop)
   */
  openFilters(): void {
    void this.filterSidenav()?.toggle();
  }

  /**
   * Handle filter state changes from the filter panel
   */
  onFilterChange(state: MediaFilterState): void {
    this.filterState.set(state);
  }

  /**
   * Clear all filters (reset to defaults)
   */
  clearAllFilters(): void {
    this.filterState.set({
      category: 'all',
      elementIds: [],
      tagIds: [],
      dateFrom: null,
      dateTo: null,
    });
  }

  /**
   * Open dialog to add element(s) to the filter
   */
  async onAddFilterElement(): Promise<void> {
    const allTagIds = this.tagService.allTags().map(t => t.id);
    const dialogRef = this.dialog.open<
      TagPickerDialogComponent,
      TagPickerDialogData,
      TagPickerDialogResult
    >(TagPickerDialogComponent, {
      data: {
        title: 'Add Element Filter',
        subtitle: 'Select elements to filter media by.',
        excludeElementIds: this.filterState().elementIds,
        excludeTagIds: allTagIds,
      },
      width: '500px',
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result?.elements.length) {
      this.filterState.update(f => ({
        ...f,
        elementIds: [...f.elementIds, ...result.elements.map(e => e.id)],
      }));
    }
  }

  /**
   * Open dialog to add tag(s) to the filter
   */
  async onAddFilterTag(): Promise<void> {
    const allElementIds = this.projectState.elements().map(e => e.id);
    const dialogRef = this.dialog.open<
      TagPickerDialogComponent,
      TagPickerDialogData,
      TagPickerDialogResult
    >(TagPickerDialogComponent, {
      data: {
        title: 'Add Tag Filter',
        subtitle: 'Select tags to filter media by.',
        excludeElementIds: allElementIds,
        excludeTagIds: this.filterState().tagIds,
      },
      width: '500px',
    });
    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result?.tags.length) {
      this.filterState.update(f => ({
        ...f,
        tagIds: [...f.tagIds, ...result.tags.map(t => t.id)],
      }));
    }
  }

  /**
   * Set the category filter
   */
  setCategory(category: string): void {
    this.filterState.update(f => ({
      ...f,
      category: category as FilterCategory,
    }));
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
        return provider;
    }
  }

  /**
   * View an image in the image viewer dialog
   */
  async viewImage(item: MediaItem): Promise<void> {
    if (item.url && item.isImage) {
      const result = await this.dialogGateway.openImageViewerDialog({
        imageUrl: item.url,
        fileName: item.filename || item.mediaId,
        canEdit: true,
        mediaId: item.mediaId,
        metadata: {
          category: item.categoryLabel,
          size: new FileSizePipe().transform(item.size),
          date: this.formatDate(item.createdAt),
          generationPrompt: item.generation?.prompt,
          generationModel: item.generation?.model,
          generationSize: item.generation?.size,
        },
      });
      // Blur active element so the overlay doesn't stay visible via :focus-within
      (document.activeElement as HTMLElement)?.blur?.();
      if (result === 'delete') {
        await this.deleteMedia(item);
      }
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
      a.remove();
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Delete a media item after confirmation.
   * Scans for usages across the project and warns the user.
   */
  async deleteMedia(item: MediaItem): Promise<void> {
    const usages = await this.findMediaUsages(item.mediaId);
    const displayName = item.filename || item.mediaId;

    let message = `Are you sure you want to delete "${displayName}"?`;
    if (usages.length > 0) {
      message += ' This media is currently in use:';
    }

    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Delete Media',
      message,
      details: usages.length > 0 ? usages : undefined,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (confirmed) {
      const project = this.projectState.project();
      if (!project?.username || !project?.slug) return;

      const projectKey = `${project.username}/${project.slug}`;
      this.mediaTagService.removeAllForMedia(item.mediaId);
      this.mediaProjectTagService.removeAllForMedia(item.mediaId);
      await this.localStorage.deleteMedia(projectKey, item.mediaId);
      await this.loadMedia();
    }
  }

  /**
   * Scan the project for all references to a given media item.
   * Returns a list of human-readable usage descriptions.
   */
  private async findMediaUsages(mediaId: string): Promise<string[]> {
    const usages: string[] = [];
    const project = this.projectState.project();
    if (!project?.username || !project?.slug) return usages;

    // 1. Cover image
    if (this.projectState.coverMediaId() === mediaId) {
      usages.push('Used as the project cover image');
    }

    const elements = this.projectState.elements();
    const mediaUrl = createMediaUrl(mediaId);

    // 2. Canvas images
    this.findCanvasUsages(elements, mediaUrl, usages);

    // 3. Document embedded images
    await this.findDocumentUsages(
      elements,
      project.username,
      project.slug,
      mediaId,
      usages
    );

    // 4. Element associations
    const taggedElements = this.mediaTagService.getElementsForMedia(mediaId);
    for (const elId of taggedElements) {
      usages.push(`Tagged on element "${this.getElementName(elId)}"`);
    }

    return usages;
  }

  private findCanvasUsages(
    elements: ReturnType<typeof this.projectState.elements>,
    mediaUrl: string,
    usages: string[]
  ): void {
    for (const el of elements.filter(e => e.type === ElementType.Canvas)) {
      const configStr = el.metadata?.['canvasConfig'];
      if (!configStr) continue;
      try {
        const config = JSON.parse(configStr) as CanvasConfig;
        const hasImage = config.objects?.some(
          obj => obj.type === 'image' && obj.src === mediaUrl
        );
        if (hasImage) {
          usages.push(`Placed on canvas "${el.name}"`);
        }
      } catch {
        /* ignore malformed config */
      }
    }
  }

  private async findDocumentUsages(
    elements: ReturnType<typeof this.projectState.elements>,
    username: string,
    slug: string,
    mediaId: string,
    usages: string[]
  ): Promise<void> {
    for (const el of elements.filter(e => e.type === ElementType.Item)) {
      const docId = `${username}:${slug}:${el.id}`;
      try {
        const content = await this.documentService.getDocumentContent(docId);
        if (content && this.prosemirrorContainsMedia(content, mediaId)) {
          usages.push(`Embedded in document "${el.name}"`);
        }
      } catch {
        /* skip unreadable docs */
      }
    }
  }

  /**
   * Recursively check if ProseMirror JSON content contains a reference
   * to a given media ID.
   */
  private prosemirrorContainsMedia(node: unknown, mediaId: string): boolean {
    if (!node || typeof node !== 'object') return false;

    // Handle top-level array (getDocumentContent returns content array)
    if (Array.isArray(node)) {
      return node.some(child => this.prosemirrorContainsMedia(child, mediaId));
    }

    const obj = node as Record<string, unknown>;

    // Check image node
    if (obj['type'] === 'image') {
      const attrs = obj['attrs'] as Record<string, unknown> | undefined;
      const src = attrs?.['src'] as string | undefined;
      if (src && extractMediaId(src) === mediaId) return true;
    }

    // Recurse into content array
    if (Array.isArray(obj['content'])) {
      return (obj['content'] as unknown[]).some(child =>
        this.prosemirrorContainsMedia(child, mediaId)
      );
    }

    return false;
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
  // ELEMENT TAGGING
  // ============================================

  /** Worldbuilding elements available for tagging */
  readonly worldbuildingElements = computed(() => {
    return this.projectState
      .elements()
      .filter(el => el.type === ElementType.Worldbuilding);
  });

  /** Get element name by ID */
  getElementName(elementId: string): string {
    const el = this.projectState.elements().find(e => e.id === elementId);
    return el?.name ?? 'Unknown';
  }

  /** Get element icon by ID */
  getElementIcon(elementId: string): string {
    const el = this.projectState.elements().find(e => e.id === elementId);
    return (el?.metadata?.['icon'] as string) || 'category';
  }

  /** Get tagged element IDs for a media item */
  getTaggedElements(mediaId: string): string[] {
    return this.mediaTagService.getElementsForMedia(mediaId);
  }

  /** Toggle element filter (from overlay chip click) */
  toggleElementFilter(elementId: string): void {
    this.filterState.update(f => {
      const has = f.elementIds.includes(elementId);
      return {
        ...f,
        elementIds: has
          ? f.elementIds.filter(id => id !== elementId)
          : [...f.elementIds, elementId],
      };
    });
  }

  /** Get the active element filter name for display */
  readonly elementFilterName = computed(() => {
    const id = this.elementFilter();
    if (!id) return null;
    return this.getElementName(id);
  });

  /** Open unified tag picker to tag a media item with elements and/or project tags */
  async tagMedia(item: MediaItem): Promise<void> {
    const excludeElementIds = this.mediaTagService.getElementsForMedia(
      item.mediaId
    );
    const excludeTagIds = this.mediaProjectTagService.getTagsForMedia(
      item.mediaId
    );

    const dialogRef = this.dialog.open<
      TagPickerDialogComponent,
      TagPickerDialogData,
      TagPickerDialogResult
    >(TagPickerDialogComponent, {
      data: {
        title: 'Add Tags',
        subtitle: `Tag "${item.filename || item.mediaId}" with elements or project tags.`,
        excludeElementIds,
        excludeTagIds,
      },
      width: '500px',
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      for (const el of result.elements) {
        this.mediaTagService.addTag(item.mediaId, el.id);
      }
      for (const tag of result.tags) {
        this.mediaProjectTagService.addTag(item.mediaId, tag.id);
      }
    }
  }

  /** Remove a tag from a media item */
  removeMediaTag(mediaId: string, elementId: string): void {
    this.mediaTagService.removeTag(mediaId, elementId);
  }

  // ============================================
  // PROJECT TAG DISPLAY & FILTER
  // ============================================

  /** Get resolved project tags for a media item */
  getProjectTags(mediaId: string): TagDefinition[] {
    const tagIds = this.mediaProjectTagService.getTagsForMedia(mediaId);
    const allDefs = this.tagService.allTags();
    return tagIds
      .map(id => allDefs.find(d => d.id === id))
      .filter((d): d is TagDefinition => d !== undefined);
  }

  /** Toggle project tag filter (from overlay chip click) */
  toggleTagFilter(tagId: string): void {
    this.filterState.update(f => {
      const has = f.tagIds.includes(tagId);
      return {
        ...f,
        tagIds: has
          ? f.tagIds.filter(id => id !== tagId)
          : [...f.tagIds, tagId],
      };
    });
  }

  /** Get the active tag filter name for display */
  readonly tagFilterName = computed(() => {
    const id = this.tagFilter();
    if (!id) return null;
    const def = this.tagService.allTags().find(d => d.id === id);
    return def?.name ?? 'Unknown Tag';
  });

  /** Add a project tag to a media item */
  addMediaProjectTag(mediaId: string, tagId: string): void {
    this.mediaProjectTagService.addTag(mediaId, tagId);
  }

  /** Remove a project tag from a media item */
  removeMediaProjectTag(mediaId: string, tagId: string): void {
    this.mediaProjectTagService.removeTag(mediaId, tagId);
  }

  /** Available project tags for a media item (not yet assigned) */
  getAvailableProjectTags(mediaId: string): TagDefinition[] {
    const currentTagIds = this.mediaProjectTagService.getTagsForMedia(mediaId);
    return this.tagService.allTags().filter(d => !currentTagIds.includes(d.id));
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private isImageMimeType(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  private categorizeMedia(mediaId: string): MediaCategory {
    if (mediaId === 'cover' || mediaId.startsWith('cover-')) return 'cover';
    if (mediaId.startsWith('generated-')) return 'generated';
    if (mediaId.startsWith('img-')) return 'inline';
    if (mediaId.startsWith('published-')) return 'published';
    return 'other';
  }

  private getCategoryLabel(category: MediaCategory): string {
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
   * Open the add media dialog (upload or generate)
   */
  async openAddMedia(): Promise<void> {
    const status = this.aiGenerationStatus();
    const dialogRef = this.dialog.open<
      AddMediaDialogComponent,
      AddMediaDialogData,
      AddMediaDialogResult
    >(AddMediaDialogComponent, {
      data: {
        canGenerate: status.status === 'enabled',
        generateTooltip: status.tooltip ?? undefined,
      },
      width: '480px',
      maxWidth: '95vw',
    });

    const choice = await firstValueFrom(dialogRef.afterClosed());
    if (choice === 'upload') {
      await this.uploadMedia();
    } else if (choice === 'generate') {
      await this.openImageGenerator();
    }
  }

  /**
   * Upload an image file to the media library
   */
  private async uploadMedia(): Promise<void> {
    const uploadRef = this.dialog.open<FileUploadComponent, void, File>(
      FileUploadComponent,
      {
        width: '480px',
        maxWidth: '95vw',
      }
    );

    const file = await firstValueFrom(uploadRef.afterClosed());
    if (!file) return;

    const project = this.projectState.project();
    if (!project?.username || !project?.slug) return;

    try {
      const timestamp = Date.now();
      const ext = file.name.split('.').pop() || 'bin';
      const mediaId = `upload-${timestamp}`;
      const projectKey = `${project.username}/${project.slug}`;

      await this.localStorage.saveMedia(
        projectKey,
        mediaId,
        file,
        `${file.name.replace(/\.[^.]+$/, '')}-${timestamp}.${ext}`
      );

      void this.mediaAutoSync.triggerSyncAfterUpload();
      await this.loadMedia();
    } catch (err) {
      console.error('Failed to upload media:', err);
      this.error.set('Failed to upload media');
    }
  }

  /**
   * Open the image generation dialog
   */
  private async openImageGenerator(): Promise<void> {
    const result = await this.dialogGateway.openImageGenerationDialog();

    if (result?.saved && result.imageData) {
      const project = this.projectState.project();
      if (!project?.username || !project?.slug) return;

      try {
        const response = await fetch(result.imageData);
        const blob = await response.blob();

        const timestamp = Date.now();
        const mediaId = `generated-${timestamp}`;
        const projectKey = `${project.username}/${project.slug}`;

        await this.localStorage.saveMedia(
          projectKey,
          mediaId,
          blob,
          `ai-generated-${timestamp}.png`
        );

        void this.mediaAutoSync.triggerSyncAfterUpload();
        await this.loadMedia();
      } catch (err) {
        console.error('Failed to save generated image:', err);
        this.error.set('Failed to save generated image');
      }
    }
  }
}
