/**
 * Media Tag Service
 *
 * Manages associations between media items and worldbuilding elements.
 * Tags are stored centrally in the project elements Yjs document,
 * enabling real-time sync and offline-first operation.
 */

import { computed, inject, Injectable, signal } from '@angular/core';
import { type MediaTag } from '@models/media-tag.model';
import { LoggerService } from '@services/core/logger.service';
import { ElementSyncProviderFactory } from '@services/sync/element-sync-provider.factory';
import { nanoid } from 'nanoid';

@Injectable({
  providedIn: 'root',
})
export class MediaTagService {
  private readonly logger = inject(LoggerService);
  private readonly syncProviderFactory = inject(ElementSyncProviderFactory);

  private get syncProvider() {
    return this.syncProviderFactory.getProvider();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Reactive Signals
  // ─────────────────────────────────────────────────────────────────────────

  private readonly mediaTagsSignal = signal<MediaTag[]>([]);
  readonly mediaTags = this.mediaTagsSignal.asReadonly();

  /** Index of media IDs to their tagged element IDs */
  readonly mediaToElements = computed(() => {
    const tags = this.mediaTagsSignal();
    const map = new Map<string, string[]>();
    for (const tag of tags) {
      const existing = map.get(tag.mediaId) ?? [];
      existing.push(tag.elementId);
      map.set(tag.mediaId, existing);
    }
    return map;
  });

  /** Index of element IDs to their tagged media IDs */
  readonly elementToMedia = computed(() => {
    const tags = this.mediaTagsSignal();
    const map = new Map<string, string[]>();
    for (const tag of tags) {
      const existing = map.get(tag.elementId) ?? [];
      existing.push(tag.mediaId);
      map.set(tag.elementId, existing);
    }
    return map;
  });

  constructor() {
    this.syncProvider.mediaTags$.subscribe(tags => {
      this.mediaTagsSignal.set(tags);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────

  /** Get all media tags */
  getAll(): MediaTag[] {
    return this.syncProvider.getMediaTags();
  }

  /** Get all element IDs tagged on a specific media item */
  getElementsForMedia(mediaId: string): string[] {
    return this.mediaToElements().get(mediaId) ?? [];
  }

  /** Get all media IDs tagged on a specific element */
  getMediaForElement(elementId: string): string[] {
    return this.elementToMedia().get(elementId) ?? [];
  }

  /** Check if a specific media-element association exists */
  hasTag(mediaId: string, elementId: string): boolean {
    return this.syncProvider
      .getMediaTags()
      .some(t => t.mediaId === mediaId && t.elementId === elementId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mutations
  // ─────────────────────────────────────────────────────────────────────────

  /** Add a media-to-element association */
  addTag(mediaId: string, elementId: string): void {
    const current = this.syncProvider.getMediaTags();
    if (current.some(t => t.mediaId === mediaId && t.elementId === elementId)) {
      this.logger.debug(
        'MediaTagService',
        `Tag already exists: ${mediaId} → ${elementId}`
      );
      return;
    }

    const newTag: MediaTag = {
      id: nanoid(),
      mediaId,
      elementId,
      createdAt: new Date().toISOString(),
    };

    const updated = [...current, newTag];
    this.syncProvider.updateMediaTags(updated);
    this.logger.debug(
      'MediaTagService',
      `Added tag: ${mediaId} → ${elementId}`
    );
  }

  /** Remove a specific media-to-element association */
  removeTag(mediaId: string, elementId: string): void {
    const current = this.syncProvider.getMediaTags();
    const updated = current.filter(
      t => !(t.mediaId === mediaId && t.elementId === elementId)
    );
    if (updated.length !== current.length) {
      this.syncProvider.updateMediaTags(updated);
      this.logger.debug(
        'MediaTagService',
        `Removed tag: ${mediaId} → ${elementId}`
      );
    }
  }

  /** Remove all tags for a specific media item (used when media is deleted) */
  removeAllForMedia(mediaId: string): void {
    const current = this.syncProvider.getMediaTags();
    const updated = current.filter(t => t.mediaId !== mediaId);
    if (updated.length !== current.length) {
      this.syncProvider.updateMediaTags(updated);
      this.logger.debug(
        'MediaTagService',
        `Removed ${current.length - updated.length} tags for media ${mediaId}`
      );
    }
  }

  /** Remove all tags for a specific element (used when element is deleted) */
  removeAllForElement(elementId: string): void {
    const current = this.syncProvider.getMediaTags();
    const updated = current.filter(t => t.elementId !== elementId);
    if (updated.length !== current.length) {
      this.syncProvider.updateMediaTags(updated);
      this.logger.debug(
        'MediaTagService',
        `Removed ${current.length - updated.length} tags for element ${elementId}`
      );
    }
  }
}
