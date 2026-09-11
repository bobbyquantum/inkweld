/**
 * Element Reference Tooltip Component
 *
 * A rich tooltip shown when hovering over an element reference.
 * Designed for future expansion to include:
 * - Async content previews (first paragraph of document, character bio, etc.)
 * - Element metadata (type, location in tree, last modified)
 * - Quick actions
 * - Custom styling per element type
 */

import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  Input,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@jsverse/transloco';
import { StorageContextService } from '@services/core/storage-context.service';
import { flattenToPlainText } from '@utils/prosemirror-text';
import { isWorldbuildingType } from '@utils/worldbuilding.utils';
import { firstValueFrom } from 'rxjs';

import { ElementType } from '../../../../api-client';
import { LocalStorageService } from '../../../services/local/local-storage.service';
import { DocumentService } from '../../../services/project/document.service';
import { ProjectStateService } from '../../../services/project/project-state.service';
import { WorldbuildingService } from '../../../services/worldbuilding/worldbuilding.service';
import { ElementRefService } from '../element-ref.service';

/**
 * Data for the tooltip
 */
export interface ElementRefTooltipData {
  /** Element ID */
  elementId: string;
  /** Element type */
  elementType: ElementType;
  /** Display name */
  displayText: string;
  /** Original element name */
  originalName: string;
  /** Screen position for tooltip */
  position: { x: number; y: number };
}

/**
 * Preview content loaded asynchronously
 */
export interface ElementPreviewContent {
  /** Short description or first paragraph */
  excerpt?: string;
  /** Path in the project tree */
  path?: string;
  /** Last modified date */
  lastModified?: Date;
  /** Word count (for documents) */
  wordCount?: number;
  /** Custom metadata fields */
  metadata?: Record<string, string>;
}

@Component({
  selector: 'app-element-ref-tooltip',
  imports: [
    CommonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './element-ref-tooltip.component.html',
  styleUrls: ['./element-ref-tooltip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ElementRefTooltipComponent {
  private readonly elementRefService = inject(ElementRefService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly projectState = inject(ProjectStateService);
  private readonly http = inject(HttpClient);
  private readonly storageContext = inject(StorageContextService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly documentService = inject(DocumentService);

  /** The tooltip data */
  @Input() set tooltipData(value: ElementRefTooltipData | null) {
    this._data.set(value);
    // Bump the generation so any in-flight preview/image resolution for the
    // previous element can no longer write its (now stale) result onto this
    // one. Also clear the resolved image so B doesn't briefly show A's picture.
    const generation = ++this.previewGeneration;
    this.resolvedImageUrl.set(null);
    if (value) {
      void this.loadPreviewContent(value.elementId, generation);
    } else {
      this.previewContent.set(null);
      this.isLoadingPreview.set(false);
    }
  }

  // Internal state
  private readonly _data = signal<ElementRefTooltipData | null>(null);
  readonly data = this._data.asReadonly();

  /**
   * Monotonic token identifying the current tooltip target. Async loads capture
   * it on entry and discard their result if it has since changed.
   */
  private previewGeneration = 0;

  /** Whether tooltip is visible */
  readonly isVisible = computed(() => this._data() !== null);

  /** Preview content (loaded async) */
  readonly previewContent = signal<ElementPreviewContent | null>(null);
  readonly isLoadingPreview = signal(false);

  /** Resolved image URL for display */
  readonly resolvedImageUrl = signal<string | null>(null);

  /** Whether to show tooltip above the element (if near bottom of screen) */
  readonly showAbove = computed(() => {
    const data = this._data();
    if (!data) return false;
    const tooltipHeight = 200; // Approximate max height
    return data.position.y + tooltipHeight > globalThis.innerHeight - 20;
  });

  /** Calculated tooltip position */
  readonly tooltipPosition = computed(() => {
    const data = this._data();
    if (!data) return { x: 0, y: 0 };

    const tooltipWidth = 340;
    const tooltipHeight = 200;
    const padding = 12;

    let x = data.position.x;
    let y = this.showAbove()
      ? data.position.y - tooltipHeight - padding
      : data.position.y + padding;

    // Keep within viewport horizontally
    if (x + tooltipWidth > globalThis.innerWidth - padding) {
      x = globalThis.innerWidth - tooltipWidth - padding;
    }
    if (x < padding) x = padding;

    // Ensure y is within bounds
    if (y < padding) y = padding;
    if (y + tooltipHeight > globalThis.innerHeight - padding) {
      y = globalThis.innerHeight - tooltipHeight - padding;
    }

    return { x, y };
  });

  /** Get icon for element type (delegates to service for consistency with tree/tabs) */
  getTypeIcon(): string {
    const data = this._data();
    if (!data) return 'article';

    // Try to get the actual element for full icon resolution (including custom metadata icons)
    const element = this.elementRefService.getElementById(data.elementId);
    if (element) {
      return this.elementRefService.getElementIcon(element);
    }

    // Fallback to type-based icon if element not found
    return this.elementRefService.getDefaultIconForType(data.elementType);
  }

  /** Format element type for display (delegates to service, resolving schema name for worldbuilding) */
  formatElementType(): string {
    const data = this._data();
    if (!data) return 'Unknown';

    // Try to resolve the full element for schema-aware formatting
    const element = this.elementRefService.getElementById(data.elementId);
    if (element) {
      return this.elementRefService.formatElementTypeForElement(element);
    }

    return this.elementRefService.formatElementType(data.elementType);
  }

  /** Resolve a media:// URL to a displayable blob URL */
  private async resolveImageUrl(
    imageUrl: string,
    username: string,
    slug: string,
    generation: number
  ): Promise<void> {
    if (!imageUrl.startsWith('media://')) {
      // Only pass through schemes the browser can actually load. A raw
      // `media:img-...` (single-colon legacy form) or any other scheme must
      // not reach an `<img src>` — the deployed CSP blocks it and it logs a
      // console error for every render.
      this.setResolvedImage(
        /^(https?:|blob:|data:image\/)/i.test(imageUrl) ? imageUrl : null,
        generation
      );
      return;
    }

    const projectKey = `${username}/${slug}`;
    const filename = imageUrl.substring('media://'.length);
    const mediaId = filename.includes('.')
      ? filename.substring(0, filename.lastIndexOf('.'))
      : filename;

    try {
      const cachedUrl = await this.localStorage.getMediaUrl(
        projectKey,
        mediaId
      );
      if (cachedUrl) {
        this.setResolvedImage(cachedUrl, generation);
        return;
      }

      const apiUrl = `${this.storageContext.getApiBaseUrl()}/api/v1/media/${username}/${slug}/${filename}`;
      const blob = await firstValueFrom(
        this.http.get(apiUrl, { responseType: 'blob' })
      );

      await this.localStorage.saveMedia(projectKey, mediaId, blob, filename);
      const blobUrl = await this.localStorage.getMediaUrl(projectKey, mediaId);
      this.setResolvedImage(blobUrl, generation);
    } catch {
      this.setResolvedImage(null, generation);
    }
  }

  /** Apply a resolved image only if it still belongs to the current tooltip. */
  private setResolvedImage(url: string | null, generation: number): void {
    if (generation !== this.previewGeneration) return;
    this.resolvedImageUrl.set(url);
  }

  /** Load preview content for an element */
  private async loadPreviewContent(
    elementId: string,
    generation: number
  ): Promise<void> {
    this.isLoadingPreview.set(true);

    try {
      const element = this.elementRefService.getElementById(elementId);
      if (!element) {
        return;
      }

      const project = this.projectState.project();
      if (project && isWorldbuildingType(element.type)) {
        await this.loadWorldbuildingPreview(elementId, project, generation);
        return;
      }

      if (project && element.type === ElementType.Item) {
        const loaded = await this.loadItemDocumentPreview(
          elementId,
          project,
          generation
        );
        if (loaded) {
          return;
        }
      }

      if (generation !== this.previewGeneration) return;
      this.previewContent.set({
        path: undefined,
        excerpt: undefined,
        wordCount: undefined,
      });
    } finally {
      if (generation === this.previewGeneration) {
        this.isLoadingPreview.set(false);
      }
    }
  }

  /** Load preview for worldbuilding elements (identity data + optional image). */
  private async loadWorldbuildingPreview(
    elementId: string,
    project: { username: string; slug: string },
    generation: number
  ): Promise<void> {
    let identityData: Awaited<
      ReturnType<typeof this.worldbuildingService.getIdentityData>
    >;
    try {
      identityData = await this.worldbuildingService.getIdentityData(
        elementId,
        project.username,
        project.slug
      );
    } catch (error) {
      console.error('Failed to load worldbuilding preview', error);
      if (generation === this.previewGeneration) {
        this.previewContent.set({});
      }
      return;
    }

    if (generation !== this.previewGeneration) return;

    this.previewContent.set({
      path: undefined,
      excerpt: identityData.description,
      wordCount: undefined,
    });

    if (identityData.image) {
      void this.resolveImageUrl(
        identityData.image,
        project.username,
        project.slug,
        generation
      );
    }
  }

  /**
   * Load a document excerpt for an Item element.
   * Returns true when a non-empty preview was set, false otherwise.
   */
  private async loadItemDocumentPreview(
    elementId: string,
    project: { username: string; slug: string },
    generation: number
  ): Promise<boolean> {
    try {
      const docId = `${project.username}:${project.slug}:${elementId}`;
      const content = await this.documentService.getDocumentContent(docId);
      if (!content || !Array.isArray(content) || content.length === 0) {
        return false;
      }

      if (generation !== this.previewGeneration) return false;

      const plainText = flattenToPlainText(content).trim();
      const wordCount = plainText ? plainText.split(/\s+/).length : 0;
      const excerpt =
        plainText.length > 200
          ? plainText.substring(0, 200) + '…'
          : plainText || undefined;

      this.previewContent.set({
        path: undefined,
        excerpt,
        wordCount: wordCount > 0 ? wordCount : undefined,
      });
      return true;
    } catch {
      // Fall through to default empty preview
      return false;
    }
  }

  /** Close tooltip on Escape */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this._data.set(null);
  }
}
