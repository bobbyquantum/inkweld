import { inject, Injectable, signal } from '@angular/core';
import { nanoid } from 'nanoid';
import { BehaviorSubject } from 'rxjs';

import {
  CreatePublishedFileRequest,
  PublishedFile,
  SharePermission,
  UpdatePublishedFileRequest,
} from '../../models/published-file';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { LocalStorageService } from '../local/local-storage.service';

/**
 * Storage key prefix for published file metadata in IndexedDB
 */
const PUBLISHED_FILES_KEY = 'published-files';

/**
 * Storage key prefix for published file blobs
 */
const PUBLISHED_BLOB_PREFIX = 'published-';

/**
 * Service for managing published files (EPUB, PDF, HTML, Markdown exports).
 *
 * Features:
 * - Offline-first: Files are stored in IndexedDB for immediate access
 * - Online sync: When online, files are uploaded to the server for persistence/sharing
 * - Share links: Generate shareable URLs with configurable permissions
 *
 * Storage strategy:
 * - Metadata: IndexedDB under key "projectKey:published-files" as JSON array
 * - Blobs: IndexedDB under key "projectKey:published-{id}"
 * - Server: POST to /api/v1/projects/:username/:slug/published
 */
@Injectable({
  providedIn: 'root',
})
export class PublishedFilesService {
  private localStorage = inject(LocalStorageService);
  private logger = inject(LoggerService);
  private setupService = inject(SetupService);

  /** Current project's published files (reactive) */
  private filesSubject = new BehaviorSubject<PublishedFile[]>([]);
  readonly files$ = this.filesSubject.asObservable();

  /** Loading state */
  readonly loading = signal(false);

  /** Error state */
  readonly error = signal<string | null>(null);

  /** Currently loaded project key */
  private currentProjectKey: string | null = null;

  /**
   * Check if we're in online (server) mode
   */
  private isOnline(): boolean {
    return this.setupService.getMode() === 'server';
  }

  /**
   * Get the server base URL
   */
  private getServerUrl(): string {
    return this.setupService.getServerUrl() || window.location.origin;
  }

  /**
   * Load published files for a project
   */
  async loadFiles(projectKey: string): Promise<PublishedFile[]> {
    this.loading.set(true);
    this.error.set(null);
    this.currentProjectKey = projectKey;

    try {
      // Load from offline storage first (fast, always available)
      const offlineFiles = this.loadOfflineMetadata(projectKey);
      this.filesSubject.next(offlineFiles);

      // If online, fetch from server and merge
      if (this.isOnline()) {
        const serverFiles = await this.fetchFromServer(projectKey);
        if (serverFiles) {
          // Merge: server is source of truth for synced files
          const merged = this.mergeFiles(offlineFiles, serverFiles);
          this.filesSubject.next(merged);
          this.saveOfflineMetadata(projectKey, merged);
        }
      }

      return this.filesSubject.value;
    } catch (err) {
      this.logger.error('Failed to load published files', String(err));
      this.error.set('Failed to load published files');
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Save a newly published file
   *
   * @param projectKey - "username/slug" format
   * @param blob - The generated file blob
   * @param request - File metadata
   * @returns The created PublishedFile record
   */
  async savePublishedFile(
    projectKey: string,
    blob: Blob,
    request: CreatePublishedFileRequest
  ): Promise<PublishedFile> {
    const id = nanoid(12);
    const now = new Date().toISOString();

    const file: PublishedFile = {
      id,
      projectId: projectKey, // Will be replaced with actual ID on server sync
      filename: request.filename,
      format: request.format,
      mimeType: request.mimeType,
      size: blob.size,
      planName: request.planName,
      sharePermission: request.sharePermission || SharePermission.Private,
      createdAt: now,
      updatedAt: now,
      metadata: request.metadata,
    };

    // Save blob to offline storage
    await this.localStorage.saveMedia(
      projectKey,
      `${PUBLISHED_BLOB_PREFIX}${id}`,
      blob,
      request.filename
    );

    // Update metadata list
    const files = [...this.filesSubject.value, file];
    this.saveOfflineMetadata(projectKey, files);
    this.filesSubject.next(files);

    // Upload to server if online
    if (this.isOnline()) {
      try {
        const serverFile = await this.uploadToServer(projectKey, blob, request);
        if (serverFile) {
          // Update local record with server data (including real project ID and share token)
          const updated = files.map(f =>
            f.id === id ? { ...serverFile, id } : f
          );
          this.saveOfflineMetadata(projectKey, updated);
          this.filesSubject.next(updated);
          return updated.find(f => f.id === id) || file;
        }
      } catch (err) {
        this.logger.warn(
          'Failed to upload published file to server',
          String(err)
        );
        // Continue with offline-only file
      }
    }

    return file;
  }

  /**
   * Get the blob for a published file
   */
  async getFileBlob(projectKey: string, fileId: string): Promise<Blob | null> {
    // Try offline first
    const blob = await this.localStorage.getMedia(
      projectKey,
      `${PUBLISHED_BLOB_PREFIX}${fileId}`
    );

    if (blob) {
      return blob;
    }

    // If online, try to download from server
    if (this.isOnline()) {
      return this.downloadFromServer(projectKey, fileId);
    }

    return null;
  }

  /**
   * Download a published file (triggers browser download)
   */
  async downloadFile(projectKey: string, fileId: string): Promise<void> {
    const file = this.filesSubject.value.find(f => f.id === fileId);
    if (!file) {
      throw new Error('File not found');
    }

    const blob = await this.getFileBlob(projectKey, fileId);
    if (!blob) {
      throw new Error('File content not found');
    }

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Update file sharing permissions
   */
  async updateSharePermission(
    projectKey: string,
    fileId: string,
    permission: SharePermission
  ): Promise<PublishedFile | null> {
    const files = this.filesSubject.value;
    const fileIndex = files.findIndex(f => f.id === fileId);

    if (fileIndex === -1) {
      return null;
    }

    const file = files[fileIndex];
    const updated: PublishedFile = {
      ...file,
      sharePermission: permission,
      updatedAt: new Date().toISOString(),
      // Generate share token if enabling sharing
      shareToken:
        permission === SharePermission.Link ||
        permission === SharePermission.Public
          ? file.shareToken || nanoid(16)
          : undefined,
    };

    // Update local state
    const newFiles = [...files];
    newFiles[fileIndex] = updated;
    this.saveOfflineMetadata(projectKey, newFiles);
    this.filesSubject.next(newFiles);

    // Update on server if online
    if (this.isOnline()) {
      try {
        await this.updateOnServer(projectKey, fileId, {
          sharePermission: permission,
        });
      } catch (err) {
        this.logger.warn(
          'Failed to update share permission on server',
          String(err)
        );
      }
    }

    return updated;
  }

  /**
   * Get share URL for a file
   */
  getShareUrl(file: PublishedFile): string | null {
    if (!file.shareToken) {
      return null;
    }

    const baseUrl = this.getServerUrl();
    return `${baseUrl}/share/${file.shareToken}`;
  }

  /**
   * Delete a published file
   */
  async deleteFile(projectKey: string, fileId: string): Promise<void> {
    // Delete blob from offline storage
    await this.localStorage.deleteMedia(
      projectKey,
      `${PUBLISHED_BLOB_PREFIX}${fileId}`
    );

    // Update metadata
    const files = this.filesSubject.value.filter(f => f.id !== fileId);
    this.saveOfflineMetadata(projectKey, files);
    this.filesSubject.next(files);

    // Delete on server if online
    if (this.isOnline()) {
      try {
        await this.deleteOnServer(projectKey, fileId);
      } catch (err) {
        this.logger.warn('Failed to delete file on server', String(err));
      }
    }
  }

  /**
   * Clear all published files for a project (used when deleting project)
   */
  async clearProjectFiles(projectKey: string): Promise<void> {
    const files = this.filesSubject.value;

    // Delete all blobs
    for (const file of files) {
      await this.localStorage.deleteMedia(
        projectKey,
        `${PUBLISHED_BLOB_PREFIX}${file.id}`
      );
    }

    // Clear metadata
    this.saveOfflineMetadata(projectKey, []);
    this.filesSubject.next([]);
  }

  // ============================================
  // PRIVATE: Offline Storage
  // ============================================

  private loadOfflineMetadata(projectKey: string): PublishedFile[] {
    try {
      const key = `${projectKey}:${PUBLISHED_FILES_KEY}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        return JSON.parse(stored) as PublishedFile[];
      }
    } catch (err) {
      this.logger.warn(
        'Failed to load offline published files metadata',
        String(err)
      );
    }
    return [];
  }

  private saveOfflineMetadata(
    projectKey: string,
    files: PublishedFile[]
  ): void {
    try {
      const key = `${projectKey}:${PUBLISHED_FILES_KEY}`;
      localStorage.setItem(key, JSON.stringify(files));
    } catch (err) {
      this.logger.warn(
        'Failed to save offline published files metadata',
        String(err)
      );
    }
  }

  // ============================================
  // PRIVATE: Server Operations
  // ============================================

  private async fetchFromServer(
    projectKey: string
  ): Promise<PublishedFile[] | null> {
    try {
      const [username, slug] = projectKey.split('/');
      const response = await fetch(
        `${this.getServerUrl()}/api/v1/projects/${username}/${slug}/published`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as PublishedFile[];
    } catch {
      return null;
    }
  }

  private async uploadToServer(
    projectKey: string,
    blob: Blob,
    request: CreatePublishedFileRequest
  ): Promise<PublishedFile | null> {
    try {
      const [username, slug] = projectKey.split('/');
      const formData = new FormData();
      formData.append('file', blob, request.filename);
      formData.append('metadata', JSON.stringify(request));

      const response = await fetch(
        `${this.getServerUrl()}/api/v1/projects/${username}/${slug}/published`,
        {
          method: 'POST',
          body: formData,
          credentials: 'include',
        }
      );

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as PublishedFile;
    } catch {
      return null;
    }
  }

  private async downloadFromServer(
    projectKey: string,
    fileId: string
  ): Promise<Blob | null> {
    try {
      const [username, slug] = projectKey.split('/');
      const response = await fetch(
        `${this.getServerUrl()}/api/v1/projects/${username}/${slug}/published/${fileId}`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        return null;
      }

      return await response.blob();
    } catch {
      return null;
    }
  }

  private async updateOnServer(
    projectKey: string,
    fileId: string,
    request: UpdatePublishedFileRequest
  ): Promise<void> {
    const [username, slug] = projectKey.split('/');
    await fetch(
      `${this.getServerUrl()}/api/v1/projects/${username}/${slug}/published/${fileId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        credentials: 'include',
      }
    );
  }

  private async deleteOnServer(
    projectKey: string,
    fileId: string
  ): Promise<void> {
    const [username, slug] = projectKey.split('/');
    await fetch(
      `${this.getServerUrl()}/api/v1/projects/${username}/${slug}/published/${fileId}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    );
  }

  // ============================================
  // PRIVATE: Merge Logic
  // ============================================

  private mergeFiles(
    offline: PublishedFile[],
    server: PublishedFile[]
  ): PublishedFile[] {
    // Server files take precedence for synced items
    // Offline-only files (not yet synced) are kept
    const serverIds = new Set(server.map(f => f.id));
    const offlineOnly = offline.filter(f => !serverIds.has(f.id));
    return [...server, ...offlineOnly];
  }
}
