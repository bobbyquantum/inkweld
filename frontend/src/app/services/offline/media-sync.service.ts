import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { MediaInfo, OfflineStorageService } from './offline-storage.service';
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
}

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
  private http = inject(HttpClient);
  private offlineStorage = inject(OfflineStorageService);
  private projectSync = inject(ProjectSyncService);

  /** Cache of sync states per project */
  private syncStates = new Map<
    string,
    ReturnType<typeof signal<MediaSyncState>>
  >();

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
    return `${environment.apiUrl}/api/v1/media/${username}/${slug}`;
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
      const localMedia = await this.offlineStorage.listMedia(projectKey);

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
          status = 'synced';
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
        item.mediaId === mediaId
          ? { ...item, status: 'downloading' as MediaSyncStatus }
          : item
      ),
    }));

    try {
      const url = `${this.getMediaUrl(projectKey)}/${filename}`;
      const blob = await firstValueFrom(
        this.http.get(url, { responseType: 'blob' })
      );

      // Save to IndexedDB
      await this.offlineStorage.saveMedia(projectKey, mediaId, blob, filename);

      // Update state
      state.update(s => ({
        ...s,
        needsDownload: Math.max(0, s.needsDownload - 1),
        items: s.items.map(item =>
          item.mediaId === mediaId
            ? { ...item, status: 'synced' as MediaSyncStatus }
            : item
        ),
      }));
    } catch (error) {
      // Revert status
      state.update(s => ({
        ...s,
        items: s.items.map(item =>
          item.mediaId === mediaId
            ? { ...item, status: 'server-only' as MediaSyncStatus }
            : item
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
        item => item.status === 'server-only' && item.filename
      );

      if (toDownload.length === 0) {
        state.update(s => ({ ...s, isSyncing: false, downloadProgress: 100 }));
        return;
      }

      let downloaded = 0;
      for (const item of toDownload) {
        await this.downloadFromServer(projectKey, item.filename!);
        downloaded++;
        state.update(s => ({
          ...s,
          downloadProgress: Math.round((downloaded / toDownload.length) * 100),
        }));
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
        item.mediaId === mediaId
          ? { ...item, status: 'uploading' as MediaSyncStatus }
          : item
      ),
    }));

    try {
      const blob = await this.offlineStorage.getMedia(projectKey, mediaId);
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

      const uploadUrl = `${environment.apiUrl}/api/v1/media/${username}/${slug}`;
      await firstValueFrom(this.http.post(uploadUrl, formData));

      // Clear from pending uploads
      await this.projectSync.clearPendingUpload(projectKey, mediaId);

      // Update state
      state.update(s => ({
        ...s,
        needsUpload: Math.max(0, s.needsUpload - 1),
        items: s.items.map(item =>
          item.mediaId === mediaId
            ? { ...item, status: 'synced' as MediaSyncStatus }
            : item
        ),
      }));
    } catch (error) {
      // Revert status
      state.update(s => ({
        ...s,
        items: s.items.map(item =>
          item.mediaId === mediaId
            ? { ...item, status: 'local-only' as MediaSyncStatus }
            : item
        ),
        error: `Failed to upload ${mediaId}`,
      }));
      throw error;
    }
  }

  /**
   * Upload all pending local media to the server
   */
  async uploadAllToServer(projectKey: string): Promise<void> {
    const state = this.getSyncState(projectKey);
    state.update(s => ({ ...s, isSyncing: true, error: undefined }));

    try {
      const currentState = state();
      const toUpload = currentState.items.filter(
        item => item.status === 'local-only'
      );

      for (const item of toUpload) {
        await this.uploadToServer(projectKey, item.mediaId);
      }

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
   * Full bidirectional sync: download missing from server, upload local changes
   */
  async fullSync(projectKey: string): Promise<void> {
    // First check status
    await this.checkSyncStatus(projectKey);

    // Download from server first (so we have latest)
    await this.downloadAllFromServer(projectKey);

    // Then upload local changes
    await this.uploadAllToServer(projectKey);
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
