import {
  Component,
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
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import {
  MediaInfo,
  OfflineStorageService,
} from '@services/offline/offline-storage.service';
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
  category: 'cover' | 'inline' | 'published' | 'other';
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
  private readonly offlineStorage = inject(OfflineStorageService);
  private readonly dialogGateway = inject(DialogGatewayService);

  // State signals
  mediaItems = signal<MediaItem[]>([]);
  isLoading = signal<boolean>(true);
  error = signal<string | null>(null);
  selectedCategory = signal<string>('all');

  // Stats
  totalSize = signal<number>(0);
  totalCount = signal<number>(0);

  // Effect to reload when project changes
  private readonly projectEffect = effect(() => {
    const project = this.projectState.project();
    if (project) {
      void this.loadMedia();
    }
  });

  ngOnInit(): void {
    void this.loadMedia();
  }

  ngOnDestroy(): void {
    this.projectEffect.destroy();
    // Cleanup blob URLs
    this.revokeAllUrls();
  }

  /**
   * Load all media items for the current project
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
      const mediaList = await this.offlineStorage.listMedia(projectKey);

      // Convert to display items with URLs for images
      const items: MediaItem[] = await Promise.all(
        mediaList.map(async info => {
          const isImage = this.isImageMimeType(info.mimeType);
          const category = this.categorizeMedia(info.mediaId);
          let url: string | undefined;

          if (isImage) {
            url =
              (await this.offlineStorage.getMediaUrl(
                projectKey,
                info.mediaId
              )) ?? undefined;
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
    const blob = await this.offlineStorage.getMedia(projectKey, item.mediaId);

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
      await this.offlineStorage.deleteMedia(projectKey, item.mediaId);
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
    if (item.mimeType.includes('zip') || item.mimeType.includes('html'))
      return 'folder_zip';
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

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private isImageMimeType(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  private categorizeMedia(
    mediaId: string
  ): 'cover' | 'inline' | 'published' | 'other' {
    if (mediaId === 'cover') return 'cover';
    if (mediaId.startsWith('img-')) return 'inline';
    if (mediaId.startsWith('published-')) return 'published';
    return 'other';
  }

  private getCategoryLabel(
    category: 'cover' | 'inline' | 'published' | 'other'
  ): string {
    switch (category) {
      case 'cover':
        return 'Cover Image';
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
      this.offlineStorage.revokeProjectUrls(
        `${project.username}/${project.slug}`
      );
    }
  }
}
