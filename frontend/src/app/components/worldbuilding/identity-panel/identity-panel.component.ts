import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { OfflineStorageService } from '@services/offline/offline-storage.service';
import {
  WorldbuildingIdentity,
  WorldbuildingService,
} from '@services/worldbuilding/worldbuilding.service';
import { debounceTime, firstValueFrom, Subject, takeUntil } from 'rxjs';

import { environment } from '../../../../environments/environment';

/**
 * Identity panel for worldbuilding elements.
 * Shows common fields: name (read-only + rename), image, description.
 * Responsive: side panel on desktop, collapsed header on mobile.
 */
@Component({
  selector: 'app-identity-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
  ],
  templateUrl: './identity-panel.component.html',
  styleUrls: ['./identity-panel.component.scss'],
})
export class IdentityPanelComponent implements OnDestroy {
  // Inputs
  elementId = input.required<string>();
  elementName = input.required<string>();
  username = input<string>();
  slug = input<string>();

  // Outputs
  renameRequested = output<void>();

  // Services
  private worldbuildingService = inject(WorldbuildingService);
  private dialogGateway = inject(DialogGatewayService);
  private http = inject(HttpClient);
  private offlineStorage = inject(OfflineStorageService);

  // State
  identity = signal<WorldbuildingIdentity>({});
  description = signal<string>('');
  isExpanded = signal(true);

  /**
   * Resolved image URL for display.
   * Handles media:// URLs by providing a resolved blob URL.
   */
  resolvedImageUrl = signal<string | null>(null);

  /**
   * Whether we're currently loading an image
   */
  isLoadingImage = signal(false);

  // Cleanup
  private destroy$ = new Subject<void>();
  private descriptionChange$ = new Subject<string>();
  private unsubscribeObserver: (() => void) | null = null;

  constructor() {
    // Setup description debounce
    this.descriptionChange$
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(value => {
        void this.saveDescription(value);
      });

    // Load identity data when elementId changes
    effect(() => {
      const id = this.elementId();
      if (id) {
        void this.loadIdentityData(id);
        void this.setupRealtimeSync(id);
      }
    });

    // Resolve image URL when identity.image changes
    effect(() => {
      const imageUrl = this.identity().image;
      if (imageUrl) {
        void this.resolveImageUrl(imageUrl);
      } else {
        this.resolvedImageUrl.set(null);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.unsubscribeObserver) {
      this.unsubscribeObserver();
    }
  }

  /**
   * Resolve an image URL for display.
   * Handles media:// URLs by downloading from the server and caching in IndexedDB.
   */
  private async resolveImageUrl(imageUrl: string): Promise<void> {
    const username = this.username();
    const slug = this.slug();

    // If it's not a media:// URL, use it directly
    if (!imageUrl.startsWith('media://')) {
      this.resolvedImageUrl.set(imageUrl);
      return;
    }

    if (!username || !slug) {
      console.warn(
        '[IdentityPanel] Cannot resolve media URL: missing username or slug'
      );
      return;
    }

    const projectKey = `${username}/${slug}`;
    // Extract filename from media://filename.png
    const filename = imageUrl.substring('media://'.length);
    // Use filename without extension as mediaId for IndexedDB
    const mediaId = filename.includes('.')
      ? filename.substring(0, filename.lastIndexOf('.'))
      : filename;

    try {
      // Check if we have it cached in IndexedDB
      const cachedUrl = await this.offlineStorage.getMediaUrl(
        projectKey,
        mediaId
      );
      if (cachedUrl) {
        // Verify the blob URL is still valid by trying to fetch it
        try {
          const response = await fetch(cachedUrl);
          if (
            response.ok &&
            response.headers.get('content-type')?.startsWith('image/')
          ) {
            this.resolvedImageUrl.set(cachedUrl);
            return;
          } else {
            // Revoke the stale URL and delete from cache
            this.offlineStorage.revokeUrl(projectKey, mediaId);
            await this.offlineStorage.deleteMedia(projectKey, mediaId);
          }
        } catch {
          this.offlineStorage.revokeUrl(projectKey, mediaId);
          await this.offlineStorage.deleteMedia(projectKey, mediaId);
        }
      }

      // Not cached or cache was invalid - download from server
      this.isLoadingImage.set(true);
      const apiUrl = `${environment.apiUrl}/api/v1/media/${username}/${slug}/${filename}`;

      const blob = await firstValueFrom(
        this.http.get(apiUrl, { responseType: 'blob' })
      );

      // Save to IndexedDB for future use
      await this.offlineStorage.saveMedia(projectKey, mediaId, blob, filename);

      // Get the blob URL for display
      const blobUrl = await this.offlineStorage.getMediaUrl(
        projectKey,
        mediaId
      );
      this.resolvedImageUrl.set(blobUrl);
    } catch (err) {
      console.error('[IdentityPanel] Failed to load image:', err);
      // Could fallback to a placeholder here
      this.resolvedImageUrl.set(null);
    } finally {
      this.isLoadingImage.set(false);
    }
  }

  private async loadIdentityData(elementId: string): Promise<void> {
    const data = await this.worldbuildingService.getIdentityData(
      elementId,
      this.username(),
      this.slug()
    );
    if (data) {
      this.identity.set(data);
      this.description.set(data.description ?? '');
    }
  }

  private async setupRealtimeSync(elementId: string): Promise<void> {
    // Cleanup previous observer
    if (this.unsubscribeObserver) {
      this.unsubscribeObserver();
    }

    this.unsubscribeObserver =
      await this.worldbuildingService.observeIdentityChanges(
        elementId,
        (data: WorldbuildingIdentity) => {
          this.identity.set(data);
          // Only update description if different to avoid cursor jumps
          if (data.description !== this.description()) {
            this.description.set(data.description ?? '');
          }
        },
        this.username(),
        this.slug()
      );
  }

  onDescriptionChange(value: string): void {
    this.description.set(value);
    this.descriptionChange$.next(value);
  }

  private async saveDescription(value: string): Promise<void> {
    await this.worldbuildingService.saveIdentityData(
      this.elementId(),
      { description: value },
      this.username(),
      this.slug()
    );
  }

  onRenameClick(): void {
    this.renameRequested.emit();
  }

  toggleExpanded(): void {
    this.isExpanded.set(!this.isExpanded());
  }

  /**
   * View the current image in full size viewer
   */
  viewImage(): void {
    const imageUrl = this.resolvedImageUrl();
    if (imageUrl) {
      this.dialogGateway.openImageViewerDialog({
        imageUrl,
        fileName: this.elementName(),
      });
    }
  }

  async onImageClick(): Promise<void> {
    const username = this.username();
    const slug = this.slug();

    if (!username || !slug) {
      console.warn(
        '[IdentityPanel] Cannot open image dialog: missing username or slug'
      );
      return;
    }

    // Get worldbuilding data for prompt context
    const worldbuildingData =
      await this.worldbuildingService.getWorldbuildingData(
        this.elementId(),
        username,
        slug
      );

    const result = await this.dialogGateway.openWorldbuildingImageDialog({
      elementName: this.elementName(),
      username,
      slug,
      // Pass the resolved blob URL for display, not the raw media:// URL
      currentImage: this.resolvedImageUrl() ?? undefined,
      description: this.description(),
      worldbuildingFields: worldbuildingData ?? undefined,
    });

    if (!result) {
      return; // Dialog cancelled
    }

    if (result.removed) {
      // Remove the image
      await this.worldbuildingService.saveIdentityData(
        this.elementId(),
        { image: undefined },
        username,
        slug
      );
      this.identity.set({ ...this.identity(), image: undefined });
    } else if (result.imageData) {
      // Save the new image
      await this.worldbuildingService.saveIdentityData(
        this.elementId(),
        { image: result.imageData },
        username,
        slug
      );
      this.identity.set({ ...this.identity(), image: result.imageData });
    }
  }
}
