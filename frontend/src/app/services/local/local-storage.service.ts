import { inject, Injectable } from '@angular/core';

import { StorageContextService } from '../core/storage-context.service';
import { StorageConfig, StorageService } from './storage.service';

/**
 * Metadata for AI-generated images
 */
export interface GenerationMetadata {
  /** The prompt used to generate the image */
  prompt: string;
  /** AI model used (e.g., "gemini-2.0-flash-exp") */
  model: string;
  /** Provider used (e.g., "openrouter", "openai") */
  provider: string;
  /** Image size requested (e.g., "768x1344") */
  size: string;
  /** When the image was generated */
  generatedAt: string;
}

/**
 * Stored media record in IndexedDB
 */
export interface StoredMedia {
  /** Composite key: "projectKey:mediaId" */
  id: string;
  /** The actual binary data */
  blob: Blob;
  /** MIME type (e.g., 'image/jpeg') */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** When this was stored */
  createdAt: string;
  /** Original filename if applicable */
  filename?: string;
  /** Optional generation metadata for AI-generated images */
  generation?: GenerationMetadata;
}

/**
 * Lightweight media info (without blob) for listing
 */
export interface MediaInfo {
  mediaId: string;
  mimeType: string;
  size: number;
  createdAt: string;
  filename?: string;
  /** Optional generation metadata for AI-generated images */
  generation?: GenerationMetadata;
}

const MEDIA_DB_BASE_NAME = 'inkweld-media';

const STORE_NAME = 'media';

/**
 * Service for storing and retrieving media (images, covers, etc.) in IndexedDB.
 *
 * Key format: "projectKey:mediaId" where:
 * - projectKey = "username/slug"
 * - mediaId = "cover" | "avatar" | "img-{uuid}" | "export-epub" | etc.
 *
 * @example
 * ```typescript
 * // Save a project cover
 * await localStorage.saveMedia('alice/my-novel', 'cover', coverBlob);
 *
 * // Get a blob URL for display
 * const url = await localStorage.getMediaUrl('alice/my-novel', 'cover');
 *
 * // Save an inline image
 * await localStorage.saveMedia('alice/my-novel', `img-${uuid}`, imageBlob);
 *
 * // List all images in a project
 * const images = await localStorage.listMedia('alice/my-novel');
 *
 * // Cleanup when closing project
 * localStorage.revokeProjectUrls('alice/my-novel');
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {
  private storageService = inject(StorageService);
  private storageContext = inject(StorageContextService);
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  /** Cache of active blob URLs to prevent memory leaks */
  private activeUrls = new Map<string, string>();

  /**
   * Get the database config with the prefixed database name
   */
  private get dbConfig(): StorageConfig {
    return {
      dbName: this.storageContext.prefixDbName(MEDIA_DB_BASE_NAME),
      version: 1,
      stores: {
        media: 'id', // Primary store, keyed by composite "projectKey:mediaId"
      },
    };
  }

  /**
   * Initialize the media database. Called automatically on first use.
   */
  private async ensureDb(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.storageService
      .initializeDatabase(this.dbConfig)
      .then(db => {
        this.db = db;
        return db;
      });

    return this.initPromise;
  }

  /**
   * Create the composite key for storage
   */
  private makeKey(projectKey: string, mediaId: string): string {
    return `${projectKey}:${mediaId}`;
  }

  /**
   * Parse a composite key back into parts
   */
  private parseKey(key: string): { projectKey: string; mediaId: string } {
    const lastColon = key.lastIndexOf(':');
    return {
      projectKey: key.substring(0, lastColon),
      mediaId: key.substring(lastColon + 1),
    };
  }

  // ============================================
  // CORE MEDIA OPERATIONS
  // ============================================

  /**
   * Save media to IndexedDB
   *
   * @param projectKey - "username/slug" format
   * @param mediaId - Identifier like "cover", "avatar", "img-{uuid}"
   * @param blob - The binary data to store
   * @param filename - Optional original filename
   * @param generation - Optional generation metadata for AI-generated images
   */
  async saveMedia(
    projectKey: string,
    mediaId: string,
    blob: Blob,
    filename?: string,
    generation?: GenerationMetadata
  ): Promise<void> {
    const db = await this.ensureDb();
    const key = this.makeKey(projectKey, mediaId);

    const record: StoredMedia = {
      id: key,
      blob,
      mimeType: blob.type || 'application/octet-stream',
      size: blob.size,
      createdAt: new Date().toISOString(),
      filename,
      generation,
    };

    await this.storageService.put(db, STORE_NAME, record);

    // Invalidate any cached URL for this media
    this.revokeUrl(projectKey, mediaId);
  }

  /**
   * Get media blob from IndexedDB
   *
   * @param projectKey - "username/slug" format
   * @param mediaId - Identifier like "cover", "avatar", "img-{uuid}"
   * @returns The blob or null if not found
   */
  async getMedia(projectKey: string, mediaId: string): Promise<Blob | null> {
    const db = await this.ensureDb();
    const key = this.makeKey(projectKey, mediaId);

    const record = await this.storageService.get<StoredMedia>(
      db,
      STORE_NAME,
      key
    );
    return record?.blob ?? null;
  }

  /**
   * Delete media from IndexedDB
   *
   * @param projectKey - "username/slug" format
   * @param mediaId - Identifier like "cover", "avatar", "img-{uuid}"
   */
  async deleteMedia(projectKey: string, mediaId: string): Promise<void> {
    const db = await this.ensureDb();
    const key = this.makeKey(projectKey, mediaId);

    await this.storageService.delete(db, STORE_NAME, key);

    // Revoke any cached URL
    this.revokeUrl(projectKey, mediaId);
  }

  /**
   * Check if media exists in IndexedDB
   *
   * @param projectKey - "username/slug" format
   * @param mediaId - Identifier like "cover", "avatar", "img-{uuid}"
   */
  async hasMedia(projectKey: string, mediaId: string): Promise<boolean> {
    const blob = await this.getMedia(projectKey, mediaId);
    return blob !== null;
  }

  /**
   * List all media IDs for a project
   *
   * @param projectKey - "username/slug" format
   * @param prefix - Optional prefix filter (e.g., "img-" for just images)
   * @returns Array of mediaIds
   */
  async listMedia(projectKey: string, prefix?: string): Promise<MediaInfo[]> {
    const db = await this.ensureDb();
    const keyPrefix = `${projectKey}:${prefix ?? ''}`;

    return new Promise<MediaInfo[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const results: MediaInfo[] = [];

      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value as StoredMedia;
          if (record.id.startsWith(keyPrefix)) {
            const { mediaId } = this.parseKey(record.id);
            results.push({
              mediaId,
              mimeType: record.mimeType,
              size: record.size,
              createdAt: record.createdAt,
              filename: record.filename,
              generation: record.generation,
            });
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () =>
        reject(new Error(`Failed to list media: ${request.error?.message}`));
    });
  }

  // ============================================
  // BLOB URL MANAGEMENT
  // ============================================

  /**
   * Get or create a blob URL for media.
   * URLs are cached to prevent memory leaks from creating duplicates.
   *
   * @param projectKey - "username/slug" format
   * @param mediaId - Identifier like "cover", "avatar", "img-{uuid}"
   * @returns Blob URL or null if media doesn't exist
   */
  async getMediaUrl(
    projectKey: string,
    mediaId: string
  ): Promise<string | null> {
    const key = this.makeKey(projectKey, mediaId);

    // Return cached URL if it exists
    const cachedUrl = this.activeUrls.get(key);
    if (cachedUrl) {
      return cachedUrl;
    }

    // Load blob and create URL
    const blob = await this.getMedia(projectKey, mediaId);
    if (!blob) {
      return null;
    }

    const url = URL.createObjectURL(blob);
    this.activeUrls.set(key, url);
    return url;
  }

  /**
   * Revoke a specific blob URL
   *
   * @param projectKey - "username/slug" format
   * @param mediaId - Identifier like "cover", "avatar", "img-{uuid}"
   */
  revokeUrl(projectKey: string, mediaId: string): void {
    const key = this.makeKey(projectKey, mediaId);
    const url = this.activeUrls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      this.activeUrls.delete(key);
    }
  }

  /**
   * Pre-cache a blob URL for a media item so that subsequent calls
   * to getMediaUrl() return it instantly without hitting IndexedDB.
   *
   * @param projectKey - "username/slug" format
   * @param mediaId - Identifier like "img-{uuid}"
   * @param blob - The blob to create a URL for
   * @returns The created blob URL
   */
  preCacheMediaUrl(projectKey: string, mediaId: string, blob: Blob): string {
    const key = this.makeKey(projectKey, mediaId);
    // Revoke any existing URL first
    const existing = this.activeUrls.get(key);
    if (existing) {
      URL.revokeObjectURL(existing);
    }
    const url = URL.createObjectURL(blob);
    this.activeUrls.set(key, url);
    return url;
  }

  /**
   * Revoke all blob URLs for a project.
   * Call this when closing a project to prevent memory leaks.
   *
   * @param projectKey - "username/slug" format
   */
  revokeProjectUrls(projectKey: string): void {
    const prefix = `${projectKey}:`;
    for (const [key, url] of this.activeUrls) {
      if (key.startsWith(prefix)) {
        URL.revokeObjectURL(url);
        this.activeUrls.delete(key);
      }
    }
  }

  /**
   * Revoke all blob URLs. Call on app shutdown.
   */
  revokeAllUrls(): void {
    for (const url of this.activeUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.activeUrls.clear();
  }

  // ============================================
  // PROJECT CLEANUP
  // ============================================

  /**
   * Delete all media for a project.
   * Call this when deleting a project.
   *
   * @param projectKey - "username/slug" format
   */
  async deleteProjectMedia(projectKey: string): Promise<void> {
    const mediaList = await this.listMedia(projectKey);

    for (const media of mediaList) {
      await this.deleteMedia(projectKey, media.mediaId);
    }

    // Revoke any remaining URLs
    this.revokeProjectUrls(projectKey);
  }

  /**
   * Get total storage size for a project
   *
   * @param projectKey - "username/slug" format
   * @returns Total bytes used
   */
  async getProjectMediaSize(projectKey: string): Promise<number> {
    const mediaList = await this.listMedia(projectKey);
    return mediaList.reduce((sum, media) => sum + media.size, 0);
  }

  /**
   * Get total storage size across all projects
   *
   * @returns Total bytes used
   */
  async getTotalMediaSize(): Promise<number> {
    const db = await this.ensureDb();

    return new Promise<number>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      let totalSize = 0;

      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const record = cursor.value as StoredMedia;
          totalSize += record.size;
          cursor.continue();
        } else {
          resolve(totalSize);
        }
      };

      request.onerror = () =>
        reject(
          new Error(`Failed to get total media size: ${request.error?.message}`)
        );
    });
  }

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  /**
   * Save a project cover image
   */
  async saveProjectCover(
    username: string,
    slug: string,
    blob: Blob
  ): Promise<void> {
    await this.saveMedia(`${username}/${slug}`, 'cover', blob);
  }

  /**
   * Get a project cover image
   */
  async getProjectCover(username: string, slug: string): Promise<Blob | null> {
    return this.getMedia(`${username}/${slug}`, 'cover');
  }

  /**
   * Get URL for a project cover image
   */
  async getProjectCoverUrl(
    username: string,
    slug: string
  ): Promise<string | null> {
    return this.getMediaUrl(`${username}/${slug}`, 'cover');
  }

  /**
   * Delete a project cover image
   */
  async deleteProjectCover(username: string, slug: string): Promise<void> {
    await this.deleteMedia(`${username}/${slug}`, 'cover');
  }

  /**
   * Save a user avatar
   */
  async saveUserAvatar(username: string, blob: Blob): Promise<void> {
    await this.saveMedia(`${username}/_user`, 'avatar', blob);
  }

  /**
   * Get a user avatar
   */
  async getUserAvatar(username: string): Promise<Blob | null> {
    return this.getMedia(`${username}/_user`, 'avatar');
  }

  /**
   * Get URL for a user avatar
   */
  async getUserAvatarUrl(username: string): Promise<string | null> {
    return this.getMediaUrl(`${username}/_user`, 'avatar');
  }
}
