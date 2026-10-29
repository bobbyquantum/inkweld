import { inject, Injectable } from '@angular/core';
import { LoggerService } from '@services/core/logger.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { MediaAutoSyncService } from '@services/sync/media-auto-sync.service';
import { base64ToBlob } from '@utils/base64-utils';
import { buildMediaReference } from '@utils/media-reference';

import { WorldbuildingService } from './worldbuilding.service';

/** What the "Set image" dialog hands back for a new identity image. */
export interface IdentityImageSource {
  /** An existing project media item to reference instead of copying. */
  mediaId?: string;
  /** The image bytes, when they are not already a media item. */
  imageBlob?: Blob;
  /** The image as a data URL (or an http(s)/media:// reference). */
  imageData?: string;
}

/** Prefix of the media ids this service creates. */
export const IDENTITY_IMAGE_MEDIA_PREFIX = 'identity-';

/**
 * Stores worldbuilding identity images as project media.
 *
 * The identity map only ever holds a `media://<id>.<ext>` reference: an
 * inline `data:` URL would put megabytes of base64 into the element's Yjs
 * document, which every client, sync, snapshot, archive and MCP read then
 * carries. The media item is saved locally first (IndexedDB) and the media
 * sync uploads it, so the server's quota check applies as for any upload.
 *
 * New media ids are derived from the image bytes, so storing the same image
 * twice (or two clients migrating the same inline image at once) yields the
 * same id and reference instead of duplicate files.
 */
@Injectable({ providedIn: 'root' })
export class IdentityImageService {
  private readonly localStorage = inject(LocalStorageService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly mediaAutoSync = inject(MediaAutoSyncService);
  private readonly logger = inject(LoggerService);

  /**
   * Turn a dialog result into the value to store in the identity map.
   * Returns undefined when the result carries no usable image.
   */
  async toIdentityImage(
    projectKey: string,
    source: IdentityImageSource
  ): Promise<string | undefined> {
    if (source.mediaId) {
      const reference = await this.referenceExisting(
        projectKey,
        source.mediaId
      );
      if (reference) return reference;
    }
    if (source.imageBlob && isStorableType(source.imageBlob.type)) {
      return this.storeImage(projectKey, source.imageBlob);
    }
    const data = source.imageData;
    if (!data) return undefined;
    const blob = inlineImageBlob(data);
    return blob ? this.storeImage(projectKey, blob) : data;
  }

  /**
   * Build a reference to a media item in the project library, or null when
   * it is unknown here. The reference must name the server file: a file
   * that came from the server keeps its `<mediaId>.<ext>` filename, and a
   * local one is uploaded under an extension taken from its type.
   */
  async referenceExisting(
    projectKey: string,
    mediaId: string
  ): Promise<string | null> {
    const items = await this.localStorage.listMedia(projectKey, mediaId);
    const item = items.find(i => i.mediaId === mediaId);
    if (!item) return null;
    if (item.filename?.startsWith(`${mediaId}.`)) {
      return `media://${item.filename}`;
    }
    return buildMediaReference({ mediaId, mimeType: item.mimeType });
  }

  /**
   * Save an image as project media and return its `media://` reference.
   * Callers pass a type {@link isStorableType} accepts.
   */
  async storeImage(projectKey: string, blob: Blob): Promise<string> {
    const mediaId = await contentMediaId(blob);
    const reference = buildMediaReference({ mediaId, mimeType: blob.type });
    const existing = await this.localStorage.getMedia(projectKey, mediaId);
    if (!existing) {
      await this.localStorage.saveMedia(
        projectKey,
        mediaId,
        blob,
        reference.substring('media://'.length)
      );
      void this.mediaAutoSync.triggerSyncAfterUpload();
    }
    return reference;
  }

  /**
   * Move an element's inline `data:` identity image into project media and
   * replace it with a reference. Idempotent: an element whose image is
   * already a reference (or absent) is left alone. The replacement only
   * happens while the identity still holds the inline image read at the
   * start, so an image set meanwhile (here or by a collaborator whose update
   * has arrived) is never overwritten.
   *
   * Returns the new reference, or null when nothing was migrated.
   */
  async migrateInlineImage(
    elementId: string,
    username: string,
    slug: string
  ): Promise<string | null> {
    if (!username || !slug) return null;
    try {
      const identity = await this.worldbuildingService.getIdentityData(
        elementId,
        username,
        slug
      );
      const inline = identity.image;
      const blob = inline ? inlineImageBlob(inline) : null;
      if (!inline || !blob) return null;

      const reference = await this.storeImage(`${username}/${slug}`, blob);
      const replaced = await this.worldbuildingService.replaceIdentityImage(
        elementId,
        inline,
        reference,
        username,
        slug
      );
      return replaced ? reference : null;
    } catch (error) {
      this.logger.warn(
        'IdentityImage',
        `Could not move the inline image of ${elementId} to media`,
        error
      );
      return null;
    }
  }
}

/** True for a base64 `data:image/*` URL. */
export function isInlineImage(value: string): boolean {
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

/**
 * Image types stored as media. The media sync names an upload after the
 * blob's type and the reference takes its extension from the same type;
 * these are the types both agree on. Anything else stays inline.
 */
const STORABLE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

function isStorableType(type: string): boolean {
  return STORABLE_TYPES.has(type);
}

/** Decode an inline image of a storable type, else null. */
function inlineImageBlob(value: string): Blob | null {
  if (!isInlineImage(value)) return null;
  try {
    const blob = base64ToBlob(value);
    return isStorableType(blob.type) ? blob : null;
  } catch {
    return null; // malformed base64
  }
}

/** A media id derived from the image bytes (SHA-256, 128 bits). */
async function contentMediaId(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await blob.arrayBuffer()
  );
  const hex = Array.from(new Uint8Array(digest).subarray(0, 16), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `${IDENTITY_IMAGE_MEDIA_PREFIX}${hex}`;
}
