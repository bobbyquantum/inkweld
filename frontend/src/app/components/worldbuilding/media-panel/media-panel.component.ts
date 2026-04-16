import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MediaItemCardComponent } from '@components/media-item-card/media-item-card.component';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { MediaTagService } from '@services/media-tag/media-tag.service';

/**
 * Media panel for worldbuilding elements.
 * Shows all media items tagged with this element and allows
 * adding/removing tags via the media selector.
 */
@Component({
  selector: 'app-media-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MediaItemCardComponent,
  ],
  templateUrl: './media-panel.component.html',
  styleUrl: './media-panel.component.scss',
})
export class MediaPanelComponent {
  elementId = input.required<string>();
  username = input.required<string>();
  slug = input.required<string>();

  private readonly mediaTagService = inject(MediaTagService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly dialogGateway = inject(DialogGatewayService);

  /** Media IDs tagged with this element (reactive) */
  readonly taggedMediaIds = computed(() => {
    return this.mediaTagService.getMediaForElement(this.elementId());
  });

  /** Cache of resolved blob URLs (signal for OnPush reactivity) */
  readonly mediaUrls = signal<Map<string, string>>(new Map());

  constructor() {
    effect(() => {
      const mediaIds = this.taggedMediaIds();
      const currentUrls = this.mediaUrls();
      for (const mediaId of mediaIds) {
        if (!currentUrls.has(mediaId)) {
          void this.loadMediaUrl(mediaId);
        }
      }
    });
  }

  /** Open the media selector dialog to tag media with this element */
  async openMediaSelector(): Promise<void> {
    const result = await this.dialogGateway.openMediaSelectorDialog({
      username: this.username(),
      slug: this.slug(),
      filterType: 'image',
      title: 'Select media to tag',
      multiSelect: true,
    });

    if (result?.selectedItems?.length) {
      for (const item of result.selectedItems) {
        this.mediaTagService.addTag(item.mediaId, this.elementId());
        void this.loadMediaUrl(item.mediaId);
      }
    } else if (result?.selected) {
      this.mediaTagService.addTag(result.selected.mediaId, this.elementId());
      void this.loadMediaUrl(result.selected.mediaId);
    }
  }

  /** Remove a tag from a media item */
  removeTag(mediaId: string): void {
    this.mediaTagService.removeTag(mediaId, this.elementId());
  }

  /** View an image in the image viewer dialog */
  async viewImage(mediaId: string): Promise<void> {
    const projectKey = `${this.username()}/${this.slug()}`;
    const url = await this.localStorage.getMediaUrl(projectKey, mediaId);
    if (url) {
      const result = await this.dialogGateway.openImageViewerDialog({
        imageUrl: url,
        fileName: mediaId,
        mediaId,
      });
      if (result === 'delete') {
        this.removeTag(mediaId);
      }
    }
  }

  private async loadMediaUrl(mediaId: string): Promise<void> {
    const projectKey = `${this.username()}/${this.slug()}`;
    const url = await this.localStorage.getMediaUrl(projectKey, mediaId);
    if (url) {
      this.mediaUrls.update(map => {
        const next = new Map(map);
        next.set(mediaId, url);
        return next;
      });
    }
  }
}
