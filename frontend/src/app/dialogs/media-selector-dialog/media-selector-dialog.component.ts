import {
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  LocalStorageService,
  MediaInfo,
} from '@services/local/local-storage.service';
import {
  MediaSyncService,
  MediaSyncStatus,
} from '@services/local/media-sync.service';

export interface MediaSelectorDialogData {
  /** Project username */
  username: string;
  /** Project slug */
  slug: string;
  /** Filter to only show certain types (e.g., 'image') */
  filterType?: 'image' | 'all';
  /** Dialog title */
  title?: string;
}

export interface MediaSelectorDialogResult {
  /** The selected media item */
  selected?: MediaInfo;
  /** The blob data for the selected item */
  blob?: Blob;
}

interface MediaItem extends MediaInfo {
  url?: string;
  /** Sync status - undefined means local-only or synced */
  syncStatus?: MediaSyncStatus;
}

@Component({
  selector: 'app-media-selector-dialog',
  templateUrl: './media-selector-dialog.component.html',
  styleUrls: ['./media-selector-dialog.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
})
export class MediaSelectorDialogComponent implements OnInit, OnDestroy {
  private readonly dialogRef = inject(
    MatDialogRef<MediaSelectorDialogComponent>
  );
  private readonly data = inject<MediaSelectorDialogData>(MAT_DIALOG_DATA);
  private readonly localStorage = inject(LocalStorageService);
  private readonly mediaSync = inject(MediaSyncService);

  readonly title = this.data.title || 'Select Image';
  readonly isLoading = signal(true);
  readonly isSyncing = signal(false);
  readonly syncProgress = signal(0);
  readonly serverItemsCount = signal(0);
  readonly error = signal<string | null>(null);
  readonly mediaItems = signal<MediaItem[]>([]);
  readonly selectedItem = signal<MediaItem | null>(null);
  readonly searchQuery = signal('');

  private objectUrls: string[] = [];
  private projectKey = '';

  ngOnInit(): void {
    this.projectKey = `${this.data.username}/${this.data.slug}`;
    void this.loadMedia();
  }

  ngOnDestroy(): void {
    // Cleanup object URLs
    this.objectUrls.forEach(url => URL.revokeObjectURL(url));
  }

  private async loadMedia(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      // First load local media
      const items = await this.localStorage.listMedia(this.projectKey);

      // Filter to images if requested
      let filtered = items;
      if (this.data.filterType === 'image') {
        filtered = items.filter(
          item =>
            item.mimeType?.startsWith('image/') ||
            item.filename?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
        );
      }

      // Load thumbnails for images
      const mediaItems: MediaItem[] = [];
      for (const item of filtered) {
        const mediaItem: MediaItem = { ...item };
        try {
          const blob = await this.localStorage.getMedia(
            this.projectKey,
            item.mediaId
          );
          if (blob) {
            const url = URL.createObjectURL(blob);
            this.objectUrls.push(url);
            mediaItem.url = url;
          }
        } catch {
          // Skip items we can't load
        }
        mediaItems.push(mediaItem);
      }

      this.mediaItems.set(mediaItems);

      // Check for server-side items in background
      void this.checkServerMedia(mediaItems);
    } catch (err) {
      console.error('Failed to load media:', err);
      this.error.set('Failed to load media library');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Check server for additional media items not in local storage
   */
  private async checkServerMedia(localItems: MediaItem[]): Promise<void> {
    try {
      const syncState = await this.mediaSync.checkSyncStatus(this.projectKey);

      // Count items that are only on the server
      const serverOnlyCount = syncState.items.filter(
        item => item.status === 'server-only'
      ).length;

      this.serverItemsCount.set(serverOnlyCount);

      // If there are server-only items that are images, add them as placeholders
      if (serverOnlyCount > 0) {
        const serverOnlyItems = syncState.items.filter(item => {
          if (item.status !== 'server-only') return false;
          // Filter to images if requested
          if (this.data.filterType === 'image') {
            return (
              item.mimeType?.startsWith('image/') ||
              item.filename?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
            );
          }
          return true;
        });

        // Add server-only items as placeholders
        const newItems = [...localItems];
        for (const serverItem of serverOnlyItems) {
          // Skip if we already have this item locally
          if (localItems.some(i => i.mediaId === serverItem.mediaId)) continue;

          newItems.push({
            mediaId: serverItem.mediaId,
            mimeType: serverItem.mimeType || 'image/jpeg',
            size: serverItem.size,
            createdAt:
              serverItem.server?.uploadedAt || new Date().toISOString(),
            filename: serverItem.filename,
            syncStatus: 'server-only',
            // No URL - will show placeholder
          });
        }
        this.mediaItems.set(newItems);
      }
    } catch (err) {
      // Non-critical - just log and continue
      console.warn('Failed to check server media:', err);
    }
  }

  /**
   * Sync all media from the server
   */
  async syncFromServer(): Promise<void> {
    this.isSyncing.set(true);
    this.syncProgress.set(0);

    try {
      // Download all from server
      await this.mediaSync.downloadAllFromServer(this.projectKey);

      // Reload media to show newly downloaded items
      await this.loadMedia();

      this.serverItemsCount.set(0);
    } catch (err) {
      console.error('Failed to sync from server:', err);
      this.error.set('Failed to sync media from server');
    } finally {
      this.isSyncing.set(false);
      this.syncProgress.set(0);
    }
  }

  /**
   * Download a single item from server
   */
  async downloadItem(item: MediaItem): Promise<void> {
    if (!item.filename) return;

    try {
      await this.mediaSync.downloadFromServer(this.projectKey, item.filename);

      // Reload to update the item
      await this.loadMedia();

      this.serverItemsCount.update(c => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to download item:', err);
      this.error.set(`Failed to download ${item.filename}`);
    }
  }

  /**
   * Check if an item needs downloading
   */
  needsDownload(item: MediaItem): boolean {
    return item.syncStatus === 'server-only';
  }

  /**
   * Media items filtered by the current search query.
   * Uses computed() for automatic reactivity and memoization.
   */
  readonly filteredItems = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.mediaItems();
    return this.mediaItems().filter(item => {
      const filename = (item.filename || '').toLowerCase();
      const mediaId = item.mediaId.toLowerCase();
      return filename.includes(query) || mediaId.includes(query);
    });
  });

  clearSearch(): void {
    this.searchQuery.set('');
  }

  selectItem(item: MediaItem): void {
    // Don't allow selecting items that aren't downloaded
    if (this.needsDownload(item)) return;
    this.selectedItem.set(item);
  }

  isSelected(item: MediaItem): boolean {
    return this.selectedItem()?.mediaId === item.mediaId;
  }

  async confirm(): Promise<void> {
    const selected = this.selectedItem();
    if (!selected) return;

    // Get the blob for the selected item
    const blob = await this.localStorage.getMedia(
      this.projectKey,
      selected.mediaId
    );

    this.dialogRef.close({
      selected,
      blob,
    } as MediaSelectorDialogResult);
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
