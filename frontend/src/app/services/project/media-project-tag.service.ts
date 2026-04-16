/**
 * Media Project Tag Service
 *
 * Manages associations between media items and project tag definitions (TagDefinition).
 * Tags are stored centrally in the project elements Yjs document,
 * enabling real-time sync and offline-first operation.
 *
 * This is separate from MediaTagService (media→element) — this links media→project tags.
 */

import { computed, inject, Injectable, signal } from '@angular/core';
import { type MediaProjectTag } from '@models/media-project-tag.model';
import { LoggerService } from '@services/core/logger.service';
import { ElementSyncProviderFactory } from '@services/sync/element-sync-provider.factory';
import { nanoid } from 'nanoid';

@Injectable({
  providedIn: 'root',
})
export class MediaProjectTagService {
  private readonly logger = inject(LoggerService);
  private readonly syncProviderFactory = inject(ElementSyncProviderFactory);

  private get syncProvider() {
    return this.syncProviderFactory.getProvider();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Reactive Signals
  // ─────────────────────────────────────────────────────────────────────────

  private readonly mediaProjectTagsSignal = signal<MediaProjectTag[]>([]);
  readonly mediaProjectTags = this.mediaProjectTagsSignal.asReadonly();

  /** Index of media IDs to their assigned tag IDs */
  readonly mediaToTags = computed(() => {
    const tags = this.mediaProjectTagsSignal();
    const map = new Map<string, string[]>();
    for (const tag of tags) {
      const existing = map.get(tag.mediaId) ?? [];
      existing.push(tag.tagId);
      map.set(tag.mediaId, existing);
    }
    return map;
  });

  /** Index of tag IDs to their assigned media IDs */
  readonly tagToMedia = computed(() => {
    const tags = this.mediaProjectTagsSignal();
    const map = new Map<string, string[]>();
    for (const tag of tags) {
      const existing = map.get(tag.tagId) ?? [];
      existing.push(tag.mediaId);
      map.set(tag.tagId, existing);
    }
    return map;
  });

  constructor() {
    this.syncProvider.mediaProjectTags$.subscribe(tags => {
      this.mediaProjectTagsSignal.set(tags);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────

  /** Get all media project tags */
  getAll(): MediaProjectTag[] {
    return this.syncProvider.getMediaProjectTags();
  }

  /** Get all tag IDs assigned to a specific media item */
  getTagsForMedia(mediaId: string): string[] {
    return this.mediaToTags().get(mediaId) ?? [];
  }

  /** Get all media IDs assigned to a specific tag */
  getMediaForTag(tagId: string): string[] {
    return this.tagToMedia().get(tagId) ?? [];
  }

  /** Check if a specific media-tag association exists */
  hasTag(mediaId: string, tagId: string): boolean {
    return this.syncProvider
      .getMediaProjectTags()
      .some(t => t.mediaId === mediaId && t.tagId === tagId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mutations
  // ─────────────────────────────────────────────────────────────────────────

  /** Add a project tag to a media item */
  addTag(mediaId: string, tagId: string): void {
    if (this.hasTag(mediaId, tagId)) {
      this.logger.debug(
        'MediaProjectTagService',
        `Tag already exists: ${mediaId} → ${tagId}`
      );
      return;
    }

    const newTag: MediaProjectTag = {
      id: nanoid(),
      mediaId,
      tagId,
      createdAt: new Date().toISOString(),
    };

    const updated = [...this.syncProvider.getMediaProjectTags(), newTag];
    this.syncProvider.updateMediaProjectTags(updated);
    this.logger.debug(
      'MediaProjectTagService',
      `Added tag: ${mediaId} → ${tagId}`
    );
  }

  /** Remove a specific media-tag association */
  removeTag(mediaId: string, tagId: string): void {
    const current = this.syncProvider.getMediaProjectTags();
    const updated = current.filter(
      t => !(t.mediaId === mediaId && t.tagId === tagId)
    );
    if (updated.length !== current.length) {
      this.syncProvider.updateMediaProjectTags(updated);
      this.logger.debug(
        'MediaProjectTagService',
        `Removed tag: ${mediaId} → ${tagId}`
      );
    }
  }

  /** Remove all project tags for a specific media item (used when media is deleted) */
  removeAllForMedia(mediaId: string): void {
    const current = this.syncProvider.getMediaProjectTags();
    const updated = current.filter(t => t.mediaId !== mediaId);
    if (updated.length !== current.length) {
      this.syncProvider.updateMediaProjectTags(updated);
      this.logger.debug(
        'MediaProjectTagService',
        `Removed ${current.length - updated.length} tags for media ${mediaId}`
      );
    }
  }

  /** Remove all media associations for a specific tag (used when tag is deleted) */
  removeAllForTag(tagId: string): void {
    const current = this.syncProvider.getMediaProjectTags();
    const updated = current.filter(t => t.tagId !== tagId);
    if (updated.length !== current.length) {
      this.syncProvider.updateMediaProjectTags(updated);
      this.logger.debug(
        'MediaProjectTagService',
        `Removed ${current.length - updated.length} media for tag ${tagId}`
      );
    }
  }
}
