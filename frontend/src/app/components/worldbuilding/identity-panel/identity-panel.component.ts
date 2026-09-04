import { TextFieldModule } from '@angular/cdk/text-field';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  type OnDestroy,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { GlassCardComponent } from '@components/glass-card/glass-card.component';
import { TranslocoModule } from '@jsverse/transloco';
import { type ElementAppearance } from '@models/element-appearance';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import {
  type WorldbuildingIdentity,
  WorldbuildingService,
} from '@services/worldbuilding/worldbuilding.service';
import {
  mediaIdFromReference,
  mediaReferenceFilename,
} from '@utils/media-reference';
import { debounceTime, firstValueFrom, Subject, takeUntil } from 'rxjs';

import { TagChipListComponent } from '../../tags/tag-chip-list.component';

/**
 * Identity panel for worldbuilding elements.
 * Shows common fields: name (read-only + rename), image, description, tags.
 * Responsive: side panel on desktop, collapsed header on mobile.
 */
@Component({
  selector: 'app-identity-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TextFieldModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    TranslocoModule,
    TagChipListComponent,
    GlassCardComponent,
  ],
  templateUrl: './identity-panel.component.html',
  styleUrls: ['./identity-panel.component.scss'],
})
export class IdentityPanelComponent implements OnDestroy {
  // Inputs
  elementId = input.required<string>();
  elementName = input.required<string>();
  elementIcon = input<string>('category');
  username = input.required<string>();
  slug = input.required<string>();
  canWrite = input<boolean>(true);
  showImage = input<boolean>(true);

  /**
   * When true the panel is read-only: it does not load, sync, or save any
   * identity data. Used for schema previews (e.g. the template designer)
   * where the parent seeds the appearance/image instead, so an async load
   * cannot overwrite the previewed styling.
   */
  readOnly = input(false);

  // Outputs
  renameRequested = output<void>();

  // Services
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly http = inject(HttpClient);
  private readonly storageContext = inject(StorageContextService);
  private readonly localStorage = inject(LocalStorageService);

  // State
  identity = signal<WorldbuildingIdentity>({});
  description = signal<string>('');
  isExpanded = signal(true);

  /**
   * The element's appearance configuration (menu / content backgrounds),
   * kept in sync with realtime identity changes so the editor can apply
   * backgrounds live.
   */
  readonly appearance = signal<ElementAppearance | undefined>(undefined);

  /**
   * Resolved image URL for display.
   * Handles media:// URLs by providing a resolved blob URL.
   */
  resolvedImageUrl = signal<string | null>(null);

  /**
   * Whether we're currently loading an image
   */
  isLoadingImage = signal(false);

  /**
   * Whether identity metadata is loading
   */
  isIdentityLoading = signal(true);

  // Cleanup
  private readonly destroy$ = new Subject<void>();
  private readonly descriptionChange$ = new Subject<{
    value: string;
    elementId: string;
  }>();
  private unsubscribeObserver: (() => void) | null = null;
  private elementSequence = 0;
  /** Tracks whether a realtime update arrived for a given element sequence. */
  private readonly receivedRealtime: Record<number, boolean> = {};

  constructor() {
    // Setup description debounce
    this.descriptionChange$
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(({ value, elementId }) => {
        void this.saveDescription(value, elementId);
      });

    // Load identity data when elementId changes
    effect(() => {
      const id = this.elementId();
      if (this.readOnly()) {
        this.isIdentityLoading.set(false);
        return;
      }
      if (id) {
        const sequence = ++this.elementSequence;
        void this.setupRealtimeSync(id, sequence);
        void this.loadIdentityData(id, sequence);
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

    // If it's not a media:// URL, use it directly (only safe schemes)
    if (!imageUrl.startsWith('media://')) {
      if (/^(https?:|blob:|data:image\/)/i.test(imageUrl)) {
        this.resolvedImageUrl.set(imageUrl);
      }
      return;
    }

    if (!username || !slug) {
      console.warn(
        '[IdentityPanel] Cannot resolve media URL: missing username or slug'
      );
      return;
    }

    const projectKey = `${username}/${slug}`;
    // Extract filename + mediaId from media://filename.png reference
    const filename = mediaReferenceFilename(imageUrl);
    const mediaId = mediaIdFromReference(imageUrl);

    try {
      // Check if we have it cached in IndexedDB
      const cachedUrl = await this.localStorage.getMediaUrl(
        projectKey,
        mediaId
      );
      if (cachedUrl) {
        // Verify the blob URL is still valid by trying to fetch it. A stale
        // URL is re-created from the stored blob; the media itself is never
        // deleted here so a transient fetch failure can't wipe it from the
        // library.
        try {
          const response = await fetch(cachedUrl);
          if (
            response.ok &&
            response.headers.get('content-type')?.startsWith('image/')
          ) {
            this.resolvedImageUrl.set(cachedUrl);
            return;
          }
        } catch {
          // Fall through and re-create the URL below.
        }
        this.localStorage.revokeUrl(projectKey, mediaId);
        const freshUrl = await this.localStorage.getMediaUrl(
          projectKey,
          mediaId
        );
        if (freshUrl) {
          this.resolvedImageUrl.set(freshUrl);
          return;
        }
      }

      // Not cached or cache was invalid - download from server
      this.isLoadingImage.set(true);
      const apiUrl = `${this.storageContext.getApiBaseUrl()}/api/v1/media/${username}/${slug}/${filename}`;

      const blob = await firstValueFrom(
        this.http.get(apiUrl, { responseType: 'blob' })
      );

      // Save to IndexedDB for future use
      await this.localStorage.saveMedia(projectKey, mediaId, blob, filename);

      // Get the blob URL for display
      const blobUrl = await this.localStorage.getMediaUrl(projectKey, mediaId);
      this.resolvedImageUrl.set(blobUrl);
    } catch (err) {
      console.error('[IdentityPanel] Failed to load image:', err);
      // Could fallback to a placeholder here
      this.resolvedImageUrl.set(null);
    } finally {
      this.isLoadingImage.set(false);
    }
  }

  private async loadIdentityData(
    elementId: string,
    sequence: number
  ): Promise<void> {
    this.isIdentityLoading.set(true);
    try {
      const data = await this.worldbuildingService.getIdentityData(
        elementId,
        this.username(),
        this.slug()
      );

      // Discard an obsolete initial snapshot if the element changed or a newer
      // realtime update was already applied while loading.
      if (
        sequence !== this.elementSequence ||
        this.receivedRealtime[sequence]
      ) {
        return;
      }
      if (data) {
        this.identity.set(data);
        this.description.set(data.description ?? '');
        this.appearance.set(data.appearance);
      }
    } finally {
      if (sequence === this.elementSequence) {
        this.isIdentityLoading.set(false);
      }
    }
  }

  private async setupRealtimeSync(
    elementId: string,
    sequence: number
  ): Promise<void> {
    // Cleanup previous observer
    if (this.unsubscribeObserver) {
      this.unsubscribeObserver();
      this.unsubscribeObserver = null;
    }

    const unsubscribe = await this.worldbuildingService.observeIdentityChanges(
      elementId,
      (data: WorldbuildingIdentity) => {
        if (sequence !== this.elementSequence) return;
        this.receivedRealtime[sequence] = true;
        this.identity.set(data);
        this.appearance.set(data.appearance);
        // Only update description if different to avoid cursor jumps
        if (data.description !== this.description()) {
          this.description.set(data.description ?? '');
        }
      },
      this.username(),
      this.slug()
    );
    // A newer element's registration may have resolved first; release this
    // stale callback immediately instead of overwriting the newer cleanup
    // handle (which would leak the newer observer).
    if (sequence !== this.elementSequence) {
      unsubscribe();
      return;
    }
    this.unsubscribeObserver = unsubscribe;
  }

  onDescriptionChange(value: string): void {
    this.description.set(value);
    this.descriptionChange$.next({ value, elementId: this.elementId() });
  }

  private async saveDescription(
    value: string,
    elementId: string
  ): Promise<void> {
    await this.worldbuildingService.saveIdentityData(
      elementId,
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
  async viewImage(): Promise<void> {
    const imageUrl = this.resolvedImageUrl();
    if (imageUrl) {
      const result = await this.dialogGateway.openImageViewerDialog({
        imageUrl,
        fileName: this.elementName(),
        canEdit: this.canWrite(),
      });
      if (result === 'change-image') {
        await this.onImageClick();
      }
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
    let worldbuildingData: Record<string, unknown> | null = null;
    try {
      // Set a short timeout for loading worldbuilding data
      // This is optional data for AI context, so we shouldn't block the dialog if it's slow
      const timeoutPromise = new Promise<Record<string, unknown> | null>(
        (_, reject) =>
          setTimeout(
            () => reject(new Error('Timeout loading worldbuilding data')),
            1000
          )
      );

      worldbuildingData = await Promise.race([
        this.worldbuildingService.getWorldbuildingData(
          this.elementId(),
          username,
          slug
        ),
        timeoutPromise,
      ]);
    } catch (err) {
      console.warn(
        '[IdentityPanel] Failed to load worldbuilding data for image dialog:',
        err
      );
      // Continue without worldbuilding data - image dialog still works
    }

    const result = await this.dialogGateway.openWorldbuildingImageDialog({
      elementId: this.elementId(),
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
      await this.clearImage();
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

  /** Remove the identity image (keeps everything else). */
  async clearImage(): Promise<void> {
    if (!this.canWrite() || this.readOnly()) return;
    await this.worldbuildingService.saveIdentityData(
      this.elementId(),
      { image: undefined },
      this.username(),
      this.slug()
    );
    this.identity.set({ ...this.identity(), image: undefined });
  }
}
