import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { forEachConcurrent, forEachSequential } from '@inkweld/async';
import { StorageContextService } from '@services/core/storage-context.service';
import { StorageUsageService } from '@services/user/storage-usage.service';
import { firstValueFrom } from 'rxjs';

import { LocalStorageService, type MediaInfo } from './local-storage.service';
import { ProjectSyncService } from './project-sync.service';

/**
 * Media item from the server
 */
export interface ServerMediaItem {
  filename: string;
  size: number;
  mimeType?: string;
  uploadedAt?: string;
}

/**
 * Response from the server media list endpoint
 */
export interface ServerMediaListResponse {
  items: ServerMediaItem[];
  total: number;
}

/**
 * Status of a media item in the sync process
 */
export type MediaSyncStatus =
  | 'local-only' // Exists locally but not on server (pending upload)
  | 'server-only' // Exists on server but not locally (needs download)
  | 'synced' // Exists in both places
  | 'downloading' // Currently being downloaded
  | 'uploading'; // Currently being uploaded

/**
 * Media item with sync information
 */
export interface MediaSyncItem {
  /** Media ID (without project key prefix) */
  mediaId: string;
  /** Filename on server (may differ from mediaId) */
  filename?: string;
  /** Size in bytes */
  size: number;
  /** MIME type */
  mimeType?: string;
  /** Sync status */
  status: MediaSyncStatus;
  /** Local media info if available */
  local?: MediaInfo;
  /** Server media info if available */
  server?: ServerMediaItem;
}

/**
 * Overall sync state for a project's media
 */
export interface MediaSyncState {
  /** Whether we're currently syncing */
  isSyncing: boolean;
  /** Last time we checked the server */
  lastChecked: string | null;
  /** Items that need to be downloaded */
  needsDownload: number;
  /** Items that need to be uploaded */
  needsUpload: number;
  /** All media items with their sync status */
  items: MediaSyncItem[];
  /** Any error that occurred */
  error?: string;
  /** Download progress (0-100) */
  downloadProgress: number;
  /**
   * Uploads were refused because the owner's sync capacity is full. Pending
   * files stay local (nothing is lost) until space is freed.
   */
  quotaExceeded?: boolean;
}

/**
 * An upload refused for lack of sync capacity. Distinct from a network or
 * server failure: retrying will not help until the owner frees space.
 */
export class MediaQuotaExceededError extends Error {
  constructor(mediaId: string) {
    super(`Sync capacity is full; ${mediaId} was not uploaded`);
    this.name = 'MediaQuotaExceededError';
  }
}

/**
 * How many media files are downloaded at once. Browsers allow ~6 concurrent
 * connections per origin over HTTP/1.1; leaving headroom keeps the WebSocket
 * and ordinary API calls responsive while a large library downloads.
 */
const DOWNLOAD_CONCURRENCY = 4;

/**
 * After a quota refusal, background syncs stop re-trying uploads for this long.
 * Each refused attempt can cost the server an authoritative usage recompute,
 * so the minute-by-minute auto-sync must not keep knocking. A manual upload
 * (or freeing space via this client) retries immediately.
 */
export const QUOTA_UPLOAD_PAUSE_MS = 15 * 60_000;

const DEFAULT_STATE: MediaSyncState = {
  isSyncing: false,
  lastChecked: null,
  needsDownload: 0,
  needsUpload: 0,
  items: [],
  downloadProgress: 0,
};

/**
 * Service for syncing media between local IndexedDB and the server.
 *
 * This service:
 * - Lists media on the server
 * - Compares with local IndexedDB
 * - Downloads missing media from server
 * - Uploads pending local media to server
 * - Provides reactive state for UI updates
 *
 * @example
 * ```typescript
 * // Check what needs syncing
 * await mediaSyncService.checkSyncStatus('alice/my-novel');
 *
 * // Download all missing media from server
 * await mediaSyncService.downloadAllFromServer('alice/my-novel');
 *
 * // Upload pending local media to server
 * await mediaSyncService.uploadAllToServer('alice/my-novel');
 * ```
 */
@Injectable({
  providedIn: 'root',
})
export class MediaSyncService {
  private readonly http = inject(HttpClient);
  private readonly localStorage = inject(LocalStorageService);
  private readonly projectSync = inject(ProjectSyncService);
  private readonly storageContext = inject(StorageContextService);
  private readonly storageUsage = inject(StorageUsageService);

  /** projectKey → time until which background uploads are paused (quota). */
  private readonly uploadsPausedUntil = new Map<string, number>();

  /** Cache of sync states per project */
  private readonly syncStates = new Map<
    string,
    ReturnType<typeof signal<MediaSyncState>>
  >();

  /**
   * Version counter that increments whenever media downloads complete.
   * Components can watch this to trigger cover image refreshes.
   */
  readonly mediaSyncVersion = signal(0);

  /**
   * Get the sync state signal for a project
   */
  getSyncState(projectKey: string): ReturnType<typeof signal<MediaSyncState>> {
    if (!this.syncStates.has(projectKey)) {
      this.syncStates.set(projectKey, signal({ ...DEFAULT_STATE }));
    }
    return this.syncStates.get(projectKey)!;
  }

  /**
   * Parse project key into username and slug
   */
  private parseProjectKey(projectKey: string): {
    username: string;
    slug: string;
  } {
    const [username, slug] = projectKey.split('/');
    return { username, slug };
  }

  /**
   * Get the API base URL for media endpoints
   */
  private getMediaUrl(projectKey: string): string {
    const { username, slug } = this.parseProjectKey(projectKey);
    return `${this.storageContext.getApiBaseUrl()}/api/v1/media/${username}/${slug}`;
  }

  /**
   * Convert server filename to mediaId (may need transformation)
   * Server stores files with descriptive names, but we use IDs internally
   */
  private filenameToMediaId(filename: string): string {
    // Remove file extension for mediaId
    // e.g., "cover.jpg" -> "cover", "media-abc123.png" -> "media-abc123"
    const lastDot = filename.lastIndexOf('.');
    return lastDot > 0 ? filename.substring(0, lastDot) : filename;
  }

  /**
   * Check the sync status between local and server
   */
  async checkSyncStatus(projectKey: string): Promise<MediaSyncState> {
    const state = this.getSyncState(projectKey);
    state.update(s => ({ ...s, isSyncing: true, error: undefined }));

    try {
      // Fetch server media list
      const url = this.getMediaUrl(projectKey);
      const serverResponse = await firstValueFrom(
        this.http.get<ServerMediaListResponse>(url)
      );

      // Fetch local media list
      const localMedia = await this.localStorage.listMedia(projectKey);

      // Build a map of local media by ID
      const localMap = new Map<string, MediaInfo>();
      for (const item of localMedia) {
        localMap.set(item.mediaId, item);
      }

      // Build a map of server media by ID
      const serverMap = new Map<string, ServerMediaItem>();
      for (const item of serverResponse.items) {
        const mediaId = this.filenameToMediaId(item.filename);
        serverMap.set(mediaId, item);
      }

      // Combine into unified list with sync status
      const allMediaIds = new Set([...localMap.keys(), ...serverMap.keys()]);
      const items: MediaSyncItem[] = [];
      let needsDownload = 0;
      let needsUpload = 0;

      for (const mediaId of allMediaIds) {
        const local = localMap.get(mediaId);
        const server = serverMap.get(mediaId);

        let status: MediaSyncStatus;
        if (local && server) {
          // Check if server file has been updated (size changed)
          if (local.size === server.size) {
            status = 'synced';
          } else {
            status = 'server-only';
            needsDownload++;
          }
        } else if (local) {
          status = 'local-only';
          needsUpload++;
        } else {
          status = 'server-only';
          needsDownload++;
        }

        items.push({
          mediaId,
          filename: server?.filename,
          size: server?.size ?? local?.size ?? 0,
          mimeType: server?.mimeType ?? local?.mimeType,
          status,
          local,
          server,
        });
      }

      const newState: MediaSyncState = {
        isSyncing: false,
        lastChecked: new Date().toISOString(),
        needsDownload,
        needsUpload,
        items,
        downloadProgress: 0,
        // A quota pause outlives a status refresh.
        quotaExceeded: this.isUploadPaused(projectKey),
      };

      state.set(newState);
      return newState;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      state.update(s => ({
        ...s,
        isSyncing: false,
        error: `Failed to check sync status: ${errorMessage}`,
      }));
      throw error;
    }
  }

  /**
   * Download a single media file from the server
   */
  async downloadFromServer(
    projectKey: string,
    filename: string
  ): Promise<void> {
    const state = this.getSyncState(projectKey);
    const mediaId = this.filenameToMediaId(filename);

    // Mark as downloading
    state.update(s => ({
      ...s,
      items: s.items.map(item =>
        item.mediaId === mediaId ? { ...item, status: 'downloading' } : item
      ),
    }));

    try {
      const url = `${this.getMediaUrl(projectKey)}/${filename}`;
      const blob = await firstValueFrom(
        this.http.get(url, { responseType: 'blob' })
      );

      // Save to IndexedDB
      await this.localStorage.saveMedia(projectKey, mediaId, blob, filename);

      // Update state
      state.update(s => ({
        ...s,
        needsDownload: Math.max(0, s.needsDownload - 1),
        items: s.items.map(item =>
          item.mediaId === mediaId ? { ...item, status: 'synced' } : item
        ),
      }));
    } catch (error) {
      // Revert status
      state.update(s => ({
        ...s,
        items: s.items.map(item =>
          item.mediaId === mediaId ? { ...item, status: 'server-only' } : item
        ),
        error: `Failed to download ${filename}`,
      }));
      throw error;
    }
  }

  /**
   * Download all missing media from the server
   */
  async downloadAllFromServer(projectKey: string): Promise<void> {
    const state = this.getSyncState(projectKey);
    state.update(s => ({
      ...s,
      isSyncing: true,
      error: undefined,
      downloadProgress: 0,
    }));

    try {
      const currentState = state();
      const toDownload = currentState.items.filter(
        (item): item is MediaSyncItem & { filename: string } =>
          item.status === 'server-only' && Boolean(item.filename)
      );

      if (toDownload.length === 0) {
        state.update(s => ({ ...s, isSyncing: false, downloadProgress: 100 }));
        return;
      }

      // A small pool of workers pulls from a shared queue, so several files
      // are in flight at once instead of paying one round trip per file in
      // series. A failed file does not stop the others; the first failure is
      // rethrown once the queue has drained.
      let downloaded = 0;
      let settled = 0;
      const errors: unknown[] = [];
      await forEachConcurrent(toDownload, DOWNLOAD_CONCURRENCY, async item => {
        try {
          await this.downloadFromServer(projectKey, item.filename);
          downloaded++;
        } catch (error) {
          errors.push(error);
        }
        settled++;
        state.update(s => ({
          ...s,
          downloadProgress: Math.round((settled / toDownload.length) * 100),
        }));
      });

      // Increment version to trigger UI refreshes (e.g., project covers),
      // including after a partial failure — what did arrive should show.
      if (downloaded > 0) {
        this.mediaSyncVersion.update(v => v + 1);
      }

      if (errors.length > 0) {
        throw errors[0];
      }

      state.update(s => ({ ...s, isSyncing: false, downloadProgress: 100 }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      state.update(s => ({
        ...s,
        isSyncing: false,
        error: `Download failed: ${errorMessage}`,
      }));
      throw error;
    }
  }

  /**
   * Upload a single media file to the server
   * Note: This uses the existing image upload endpoint
   */
  async uploadToServer(projectKey: string, mediaId: string): Promise<void> {
    const state = this.getSyncState(projectKey);

    // Mark as uploading
    state.update(s => ({
      ...s,
      items: s.items.map(item =>
        item.mediaId === mediaId ? { ...item, status: 'uploading' } : item
      ),
    }));

    try {
      const blob = await this.localStorage.getMedia(projectKey, mediaId);
      if (!blob) {
        throw new Error(`Media not found: ${mediaId}`);
      }

      // Use the media upload endpoint
      const { username, slug } = this.parseProjectKey(projectKey);
      const formData = new FormData();
      formData.append(
        'file',
        blob,
        `${mediaId}.${this.getExtension(blob.type)}`
      );

      const uploadUrl = `${this.storageContext.getApiBaseUrl()}/api/v1/media/${username}/${slug}`;
      try {
        await firstValueFrom(this.http.post(uploadUrl, formData));
      } catch (error) {
        if (this.storageUsage.noteQuotaError(error)) {
          throw new MediaQuotaExceededError(mediaId);
        }
        throw error;
      }

      // Clear from pending uploads
      await this.projectSync.clearPendingUpload(projectKey, mediaId);

      // Update state
      state.update(s => ({
        ...s,
        needsUpload: Math.max(0, s.needsUpload - 1),
        items: s.items.map(item =>
          item.mediaId === mediaId ? { ...item, status: 'synced' } : item
        ),
      }));
    } catch (error) {
      const quotaExceeded = error instanceof MediaQuotaExceededError;
      if (quotaExceeded) {
        this.uploadsPausedUntil.set(
          projectKey,
          Date.now() + QUOTA_UPLOAD_PAUSE_MS
        );
      }
      // Revert status
      state.update(s => ({
        ...s,
        items: s.items.map(item =>
          item.mediaId === mediaId ? { ...item, status: 'local-only' } : item
        ),
        quotaExceeded: quotaExceeded || s.quotaExceeded,
        error: quotaExceeded
          ? `Sync capacity is full; ${mediaId} was not uploaded`
          : `Failed to upload ${mediaId}`,
      }));
      throw error;
    }
  }

  /**
   * Whether background syncs should skip uploads for this project because the
   * server recently refused one for lack of sync capacity.
   */
  isUploadPaused(projectKey: string): boolean {
    const until = this.uploadsPausedUntil.get(projectKey);
    if (until === undefined) return false;
    if (Date.now() >= until) {
      this.uploadsPausedUntil.delete(projectKey);
      return false;
    }
    return true;
  }

  /** Lift a quota pause (space was freed, or the user retries manually). */
  resumeUploads(projectKey: string): void {
    this.uploadsPausedUntil.delete(projectKey);
    this.getSyncState(projectKey).update(s => ({
      ...s,
      quotaExceeded: false,
    }));
  }

  /**
   * Delete a media file from the server, freeing its share of the owner's
   * sync capacity. Resolves quietly when the server has no such file. Lifts a
   * quota pause, since there may now be room for pending uploads.
   */
  async deleteFromServer(projectKey: string, mediaId: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.get<ServerMediaListResponse>(this.getMediaUrl(projectKey))
    );
    const matches = response.items.filter(
      item => this.filenameToMediaId(item.filename) === mediaId
    );
    // Sequential: a handful of variants at most, and each delete must finish
    // before the item is dropped from local state.
    await forEachSequential(matches, item =>
      firstValueFrom(
        this.http.delete(
          `${this.getMediaUrl(projectKey)}/${encodeURIComponent(item.filename)}`
        )
      )
    );

    if (matches.length > 0) {
      this.getSyncState(projectKey).update(s => ({
        ...s,
        items: s.items.filter(item => item.mediaId !== mediaId),
      }));
      this.resumeUploads(projectKey);
    }
  }

  /**
   * Upload all pending local media to the server.
   *
   * Background callers pass `{ background: true }`: while uploads are paused
   * after a quota refusal they skip uploading entirely (downloads elsewhere
   * still run). A manual upload always tries, and lifts the pause.
   */
  async uploadAllToServer(
    projectKey: string,
    options: { background?: boolean } = {}
  ): Promise<void> {
    if (options.background && this.isUploadPaused(projectKey)) {
      return;
    }
    if (!options.background) {
      this.uploadsPausedUntil.delete(projectKey);
    }
    const state = this.getSyncState(projectKey);
    state.update(s => ({
      ...s,
      isSyncing: true,
      error: undefined,
      quotaExceeded: false,
    }));

    try {
      const currentState = state();
      const toUpload = currentState.items.filter(
        item => item.status === 'local-only'
      );

      // Sequential: uploads go out one at a time and the first failure stops
      // the rest.
      await forEachSequential(toUpload, item =>
        this.uploadToServer(projectKey, item.mediaId)
      );

      // Mark the project as synced
      await this.projectSync.markSynced(projectKey);

      state.update(s => ({ ...s, isSyncing: false }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      state.update(s => ({
        ...s,
        isSyncing: false,
        error: `Upload failed: ${errorMessage}`,
      }));
      throw error;
    }
  }

  /**
   * Full bidirectional sync: download missing from server, upload local changes.
   * `background` honours a quota pause (see {@link uploadAllToServer}).
   */
  async fullSync(
    projectKey: string,
    options: { background?: boolean } = {}
  ): Promise<void> {
    // First check status
    await this.checkSyncStatus(projectKey);

    // Download from server first (so we have latest)
    await this.downloadAllFromServer(projectKey);

    // Then upload local changes
    await this.uploadAllToServer(projectKey, options);
  }

  /**
   * Get file extension from MIME type
   */
  private getExtension(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'application/pdf': 'pdf',
      'application/epub+zip': 'epub',
      'text/html': 'html',
      'text/markdown': 'md',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
    };
    return extensions[mimeType] || 'bin';
  }

  /**
   * Clear cached state for a project
   */
  clearState(projectKey: string): void {
    this.syncStates.delete(projectKey);
  }

  /**
   * Clear all cached states (for testing)
   */
  clearAllStates(): void {
    this.syncStates.clear();
  }
}
