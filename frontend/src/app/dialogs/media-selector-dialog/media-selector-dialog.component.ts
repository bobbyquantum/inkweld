import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  MediaInfo,
  OfflineStorageService,
} from '@services/offline/offline-storage.service';

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
}

@Component({
  selector: 'app-media-selector-dialog',
  templateUrl: './media-selector-dialog.component.html',
  styleUrls: ['./media-selector-dialog.component.scss'],
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
})
export class MediaSelectorDialogComponent implements OnInit, OnDestroy {
  private readonly dialogRef = inject(
    MatDialogRef<MediaSelectorDialogComponent>
  );
  private readonly data = inject<MediaSelectorDialogData>(MAT_DIALOG_DATA);
  private readonly offlineStorage = inject(OfflineStorageService);

  readonly title = this.data.title || 'Select Image';
  readonly isLoading = signal(true);
  readonly error = signal<string | null>(null);
  readonly mediaItems = signal<MediaItem[]>([]);
  readonly selectedItem = signal<MediaItem | null>(null);

  private objectUrls: string[] = [];

  ngOnInit(): void {
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
      const projectKey = `${this.data.username}/${this.data.slug}`;
      const items = await this.offlineStorage.listMedia(projectKey);

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
          const blob = await this.offlineStorage.getMedia(
            projectKey,
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
    } catch (err) {
      console.error('Failed to load media:', err);
      this.error.set('Failed to load media library');
    } finally {
      this.isLoading.set(false);
    }
  }

  selectItem(item: MediaItem): void {
    this.selectedItem.set(item);
  }

  isSelected(item: MediaItem): boolean {
    return this.selectedItem()?.mediaId === item.mediaId;
  }

  async confirm(): Promise<void> {
    const selected = this.selectedItem();
    if (!selected) return;

    // Get the blob for the selected item
    const projectKey = `${this.data.username}/${this.data.slug}`;
    const blob = await this.offlineStorage.getMedia(
      projectKey,
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
