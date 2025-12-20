import { HttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MediaSyncService,
  ServerMediaListResponse,
} from './media-sync.service';
import { OfflineStorageService } from './offline-storage.service';
import { ProjectSyncService } from './project-sync.service';

describe('MediaSyncService', () => {
  let service: MediaSyncService;
  let httpMock: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
  let offlineStorageMock: {
    listMedia: ReturnType<typeof vi.fn>;
    getMedia: ReturnType<typeof vi.fn>;
    saveMedia: ReturnType<typeof vi.fn>;
  };
  let projectSyncMock: {
    clearPendingUpload: ReturnType<typeof vi.fn>;
    markSynced: ReturnType<typeof vi.fn>;
  };

  const TEST_PROJECT_KEY = 'alice/my-novel';

  beforeEach(() => {
    TestBed.resetTestingModule();

    httpMock = {
      get: vi.fn(),
      post: vi.fn(),
    };

    offlineStorageMock = {
      listMedia: vi.fn().mockResolvedValue([]),
      getMedia: vi.fn().mockResolvedValue(null),
      saveMedia: vi.fn().mockResolvedValue(undefined),
    };

    projectSyncMock = {
      clearPendingUpload: vi.fn().mockResolvedValue(undefined),
      markSynced: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: HttpClient, useValue: httpMock },
        { provide: OfflineStorageService, useValue: offlineStorageMock },
        { provide: ProjectSyncService, useValue: projectSyncMock },
      ],
    });

    // Override the root-provided service to get a fresh instance each test
    TestBed.overrideProvider(MediaSyncService, {
      useFactory: () => new MediaSyncService(),
    });

    service = TestBed.inject(MediaSyncService);
  });

  afterEach(() => {
    service.clearAllStates();
  });

  describe('getSyncState', () => {
    it('should return a signal with default state', () => {
      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state()).toEqual({
        isSyncing: false,
        lastChecked: null,
        needsDownload: 0,
        needsUpload: 0,
        items: [],
        downloadProgress: 0,
      });
    });

    it('should return same signal for same project', () => {
      const state1 = service.getSyncState(TEST_PROJECT_KEY);
      const state2 = service.getSyncState(TEST_PROJECT_KEY);
      expect(state1).toBe(state2);
    });
  });

  describe('checkSyncStatus', () => {
    it('should identify synced items', async () => {
      const serverResponse: ServerMediaListResponse = {
        items: [{ filename: 'cover.jpg', size: 1000, mimeType: 'image/jpeg' }],
        total: 1,
      };

      httpMock.get.mockReturnValue(of(serverResponse));
      offlineStorageMock.listMedia.mockResolvedValue([
        {
          mediaId: 'cover',
          mimeType: 'image/jpeg',
          size: 1000,
          createdAt: '2024-01-01',
        },
      ]);

      const result = await service.checkSyncStatus(TEST_PROJECT_KEY);

      expect(result.needsDownload).toBe(0);
      expect(result.needsUpload).toBe(0);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('synced');
    });

    it('should identify server-only items', async () => {
      const serverResponse: ServerMediaListResponse = {
        items: [{ filename: 'cover.jpg', size: 1000, mimeType: 'image/jpeg' }],
        total: 1,
      };

      httpMock.get.mockReturnValue(of(serverResponse));
      offlineStorageMock.listMedia.mockResolvedValue([]);

      const result = await service.checkSyncStatus(TEST_PROJECT_KEY);

      expect(result.needsDownload).toBe(1);
      expect(result.needsUpload).toBe(0);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('server-only');
    });

    it('should identify local-only items', async () => {
      const serverResponse: ServerMediaListResponse = {
        items: [],
        total: 0,
      };

      httpMock.get.mockReturnValue(of(serverResponse));
      offlineStorageMock.listMedia.mockResolvedValue([
        {
          mediaId: 'cover',
          mimeType: 'image/jpeg',
          size: 1000,
          createdAt: '2024-01-01',
        },
      ]);

      const result = await service.checkSyncStatus(TEST_PROJECT_KEY);

      expect(result.needsDownload).toBe(0);
      expect(result.needsUpload).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('local-only');
    });

    it('should handle errors gracefully', async () => {
      httpMock.get.mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      await expect(service.checkSyncStatus(TEST_PROJECT_KEY)).rejects.toThrow(
        'Network error'
      );

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().error).toContain('Failed to check sync status');
    });
  });

  describe('downloadFromServer', () => {
    it('should download and save file', async () => {
      const blob = new Blob(['test'], { type: 'image/jpeg' });
      httpMock.get.mockReturnValue(of(blob));

      // Setup initial state with server-only item
      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        needsDownload: 1,
        items: [
          {
            mediaId: 'cover',
            filename: 'cover.jpg',
            size: 1000,
            status: 'server-only',
          },
        ],
      }));

      await service.downloadFromServer(TEST_PROJECT_KEY, 'cover.jpg');

      expect(offlineStorageMock.saveMedia).toHaveBeenCalledWith(
        TEST_PROJECT_KEY,
        'cover',
        blob,
        'cover.jpg'
      );

      const newState = state();
      expect(newState.needsDownload).toBe(0);
      expect(newState.items[0].status).toBe('synced');
    });
  });

  describe('clearState', () => {
    it('should remove cached state', () => {
      const state1 = service.getSyncState(TEST_PROJECT_KEY);
      state1.update(s => ({ ...s, needsDownload: 5 }));

      service.clearState(TEST_PROJECT_KEY);

      const state2 = service.getSyncState(TEST_PROJECT_KEY);
      expect(state2()).toEqual({
        isSyncing: false,
        lastChecked: null,
        needsDownload: 0,
        needsUpload: 0,
        items: [],
        downloadProgress: 0,
      });
    });
  });

  describe('downloadFromServer - error handling', () => {
    it('should revert status to server-only on download error', async () => {
      httpMock.get.mockReturnValue(
        throwError(() => new Error('Download failed'))
      );

      // Setup initial state with server-only item
      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        needsDownload: 1,
        items: [
          {
            mediaId: 'cover',
            filename: 'cover.jpg',
            size: 1000,
            status: 'server-only',
          },
        ],
      }));

      await expect(
        service.downloadFromServer(TEST_PROJECT_KEY, 'cover.jpg')
      ).rejects.toThrow('Download failed');

      const newState = state();
      expect(newState.items[0].status).toBe('server-only');
      expect(newState.error).toBe('Failed to download cover.jpg');
    });
  });

  describe('downloadAllFromServer', () => {
    it('should download all server-only items with progress', async () => {
      const blob = new Blob(['test'], { type: 'image/jpeg' });
      httpMock.get.mockReturnValue(of(blob));

      // Setup initial state with multiple server-only items
      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        needsDownload: 2,
        items: [
          {
            mediaId: 'cover',
            filename: 'cover.jpg',
            size: 1000,
            status: 'server-only',
          },
          {
            mediaId: 'hero',
            filename: 'hero.png',
            size: 2000,
            status: 'server-only',
          },
        ],
      }));

      await service.downloadAllFromServer(TEST_PROJECT_KEY);

      const newState = state();
      expect(newState.isSyncing).toBe(false);
      expect(newState.downloadProgress).toBe(100);
      expect(newState.items.every(item => item.status === 'synced')).toBe(true);
      expect(offlineStorageMock.saveMedia).toHaveBeenCalledTimes(2);
    });

    it('should complete immediately when nothing to download', async () => {
      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        items: [
          {
            mediaId: 'cover',
            filename: 'cover.jpg',
            size: 1000,
            status: 'synced',
          },
        ],
      }));

      await service.downloadAllFromServer(TEST_PROJECT_KEY);

      const newState = state();
      expect(newState.isSyncing).toBe(false);
      expect(newState.downloadProgress).toBe(100);
    });

    it('should handle errors and set error state', async () => {
      httpMock.get.mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        needsDownload: 1,
        items: [
          {
            mediaId: 'cover',
            filename: 'cover.jpg',
            size: 1000,
            status: 'server-only',
          },
        ],
      }));

      await expect(
        service.downloadAllFromServer(TEST_PROJECT_KEY)
      ).rejects.toThrow('Network error');

      const newState = state();
      expect(newState.isSyncing).toBe(false);
      expect(newState.error).toContain('Download failed');
    });

    it('should skip items without filename', async () => {
      const blob = new Blob(['test'], { type: 'image/jpeg' });
      httpMock.get.mockReturnValue(of(blob));

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        needsDownload: 2,
        items: [
          {
            mediaId: 'cover',
            filename: 'cover.jpg',
            size: 1000,
            status: 'server-only',
          },
          {
            mediaId: 'nofile',
            size: 500,
            status: 'server-only',
          },
        ],
      }));

      await service.downloadAllFromServer(TEST_PROJECT_KEY);

      // Only one file should be downloaded (the one with filename)
      expect(offlineStorageMock.saveMedia).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadToServer', () => {
    it('should upload media and update status to synced', async () => {
      const blob = new Blob(['test'], { type: 'image/jpeg' });
      offlineStorageMock.getMedia.mockResolvedValue(blob);
      httpMock.post.mockReturnValue(of({ filename: 'cover.jpg' }));

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        needsUpload: 1,
        items: [
          {
            mediaId: 'cover',
            size: 1000,
            mimeType: 'image/jpeg',
            status: 'local-only',
          },
        ],
      }));

      await service.uploadToServer(TEST_PROJECT_KEY, 'cover');

      expect(httpMock.post).toHaveBeenCalled();
      expect(projectSyncMock.clearPendingUpload).toHaveBeenCalledWith(
        TEST_PROJECT_KEY,
        'cover'
      );

      const newState = state();
      expect(newState.needsUpload).toBe(0);
      expect(newState.items[0].status).toBe('synced');
    });

    it('should throw error if media not found locally', async () => {
      offlineStorageMock.getMedia.mockResolvedValue(null);

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        items: [
          {
            mediaId: 'missing',
            size: 1000,
            status: 'local-only',
          },
        ],
      }));

      await expect(
        service.uploadToServer(TEST_PROJECT_KEY, 'missing')
      ).rejects.toThrow('Media not found: missing');

      const newState = state();
      expect(newState.items[0].status).toBe('local-only');
      expect(newState.error).toBe('Failed to upload missing');
    });

    it('should revert status on upload error', async () => {
      const blob = new Blob(['test'], { type: 'image/png' });
      offlineStorageMock.getMedia.mockResolvedValue(blob);
      httpMock.post.mockReturnValue(
        throwError(() => new Error('Upload failed'))
      );

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        items: [
          {
            mediaId: 'cover',
            size: 1000,
            mimeType: 'image/png',
            status: 'local-only',
          },
        ],
      }));

      await expect(
        service.uploadToServer(TEST_PROJECT_KEY, 'cover')
      ).rejects.toThrow('Upload failed');

      const newState = state();
      expect(newState.items[0].status).toBe('local-only');
      expect(newState.error).toBe('Failed to upload cover');
    });

    it('should handle different mime types for file extension', async () => {
      const testCases = [
        { mimeType: 'image/jpeg', expectedExt: 'jpg' },
        { mimeType: 'image/png', expectedExt: 'png' },
        { mimeType: 'image/gif', expectedExt: 'gif' },
        { mimeType: 'image/webp', expectedExt: 'webp' },
        { mimeType: 'image/svg+xml', expectedExt: 'svg' },
        { mimeType: 'application/octet-stream', expectedExt: 'bin' },
      ];

      for (const { mimeType, expectedExt } of testCases) {
        const blob = new Blob(['test'], { type: mimeType });
        offlineStorageMock.getMedia.mockResolvedValue(blob);
        httpMock.post.mockReturnValue(of({ filename: `test.${expectedExt}` }));

        const state = service.getSyncState(TEST_PROJECT_KEY);
        state.update(s => ({
          ...s,
          items: [
            {
              mediaId: 'test-file',
              size: 1000,
              mimeType,
              status: 'local-only',
            },
          ],
        }));

        await service.uploadToServer(TEST_PROJECT_KEY, 'test-file');

        // Verify the FormData was created with correct extension
        const postCall = httpMock.post.mock.calls[
          httpMock.post.mock.calls.length - 1
        ] as [string, FormData];
        const formData = postCall[1];
        const file = formData.get('file') as File;
        expect(file.name).toBe(`test-file.${expectedExt}`);
      }
    });
  });

  describe('uploadAllToServer', () => {
    it('should upload all local-only items', async () => {
      const blob = new Blob(['test'], { type: 'image/jpeg' });
      offlineStorageMock.getMedia.mockResolvedValue(blob);
      httpMock.post.mockReturnValue(of({ filename: 'uploaded.jpg' }));

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        needsUpload: 2,
        items: [
          {
            mediaId: 'cover',
            size: 1000,
            mimeType: 'image/jpeg',
            status: 'local-only',
          },
          {
            mediaId: 'hero',
            size: 2000,
            mimeType: 'image/jpeg',
            status: 'local-only',
          },
        ],
      }));

      await service.uploadAllToServer(TEST_PROJECT_KEY);

      expect(httpMock.post).toHaveBeenCalledTimes(2);
      expect(projectSyncMock.markSynced).toHaveBeenCalledWith(TEST_PROJECT_KEY);

      const newState = state();
      expect(newState.isSyncing).toBe(false);
      expect(newState.items.every(item => item.status === 'synced')).toBe(true);
    });

    it('should complete without uploading when no local-only items', async () => {
      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        items: [
          {
            mediaId: 'cover',
            filename: 'cover.jpg',
            size: 1000,
            status: 'synced',
          },
        ],
      }));

      await service.uploadAllToServer(TEST_PROJECT_KEY);

      expect(httpMock.post).not.toHaveBeenCalled();
      expect(projectSyncMock.markSynced).toHaveBeenCalledWith(TEST_PROJECT_KEY);
    });

    it('should handle upload errors', async () => {
      offlineStorageMock.getMedia.mockResolvedValue(null);

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        items: [
          {
            mediaId: 'cover',
            size: 1000,
            status: 'local-only',
          },
        ],
      }));

      await expect(service.uploadAllToServer(TEST_PROJECT_KEY)).rejects.toThrow(
        'Media not found: cover'
      );

      const newState = state();
      expect(newState.isSyncing).toBe(false);
      expect(newState.error).toContain('Upload failed');
    });
  });

  describe('fullSync', () => {
    it('should perform full bidirectional sync', async () => {
      const serverResponse: ServerMediaListResponse = {
        items: [{ filename: 'server.jpg', size: 1000, mimeType: 'image/jpeg' }],
        total: 1,
      };

      const blob = new Blob(['test'], { type: 'image/jpeg' });

      // First call for checkSyncStatus, second for download
      httpMock.get
        .mockReturnValueOnce(of(serverResponse))
        .mockReturnValueOnce(of(blob));
      httpMock.post.mockReturnValue(of({ filename: 'uploaded.jpg' }));

      offlineStorageMock.listMedia.mockResolvedValue([
        {
          mediaId: 'local',
          mimeType: 'image/jpeg',
          size: 500,
          createdAt: '2024-01-01',
        },
      ]);
      offlineStorageMock.getMedia.mockResolvedValue(blob);

      await service.fullSync(TEST_PROJECT_KEY);

      // Should have called checkSyncStatus (get), downloadAllFromServer (get), uploadAllToServer (post)
      expect(httpMock.get).toHaveBeenCalledTimes(2);
      expect(httpMock.post).toHaveBeenCalledTimes(1);
      expect(projectSyncMock.markSynced).toHaveBeenCalledWith(TEST_PROJECT_KEY);
    });
  });

  describe('checkSyncStatus - edge cases', () => {
    it('should handle filenames without extensions', async () => {
      const serverResponse: ServerMediaListResponse = {
        items: [{ filename: 'cover', size: 1000 }],
        total: 1,
      };

      httpMock.get.mockReturnValue(of(serverResponse));
      offlineStorageMock.listMedia.mockResolvedValue([]);

      const result = await service.checkSyncStatus(TEST_PROJECT_KEY);

      expect(result.items[0].mediaId).toBe('cover');
      expect(result.items[0].filename).toBe('cover');
    });

    it('should handle mixed local and server items correctly', async () => {
      const serverResponse: ServerMediaListResponse = {
        items: [
          { filename: 'synced.jpg', size: 1000, mimeType: 'image/jpeg' },
          { filename: 'server-only.png', size: 2000, mimeType: 'image/png' },
        ],
        total: 2,
      };

      httpMock.get.mockReturnValue(of(serverResponse));
      offlineStorageMock.listMedia.mockResolvedValue([
        {
          mediaId: 'synced',
          mimeType: 'image/jpeg',
          size: 1000,
          createdAt: '2024-01-01',
        },
        {
          mediaId: 'local-only',
          mimeType: 'image/gif',
          size: 500,
          createdAt: '2024-01-01',
        },
      ]);

      const result = await service.checkSyncStatus(TEST_PROJECT_KEY);

      expect(result.needsDownload).toBe(1);
      expect(result.needsUpload).toBe(1);
      expect(result.items).toHaveLength(3);

      const syncedItem = result.items.find(i => i.mediaId === 'synced');
      const serverOnlyItem = result.items.find(
        i => i.mediaId === 'server-only'
      );
      const localOnlyItem = result.items.find(i => i.mediaId === 'local-only');

      expect(syncedItem?.status).toBe('synced');
      expect(serverOnlyItem?.status).toBe('server-only');
      expect(localOnlyItem?.status).toBe('local-only');
    });

    it('should handle non-Error exceptions', async () => {
      httpMock.get.mockReturnValue(throwError(() => 'String error'));

      await expect(service.checkSyncStatus(TEST_PROJECT_KEY)).rejects.toBe(
        'String error'
      );

      const state = service.getSyncState(TEST_PROJECT_KEY);
      expect(state().error).toContain('Unknown error');
    });

    it('should use local size when server size is not available', async () => {
      const serverResponse: ServerMediaListResponse = {
        items: [],
        total: 0,
      };

      httpMock.get.mockReturnValue(of(serverResponse));
      offlineStorageMock.listMedia.mockResolvedValue([
        {
          mediaId: 'local',
          mimeType: 'image/jpeg',
          size: 12345,
          createdAt: '2024-01-01',
        },
      ]);

      const result = await service.checkSyncStatus(TEST_PROJECT_KEY);

      expect(result.items[0].size).toBe(12345);
    });

    it('should use local mimeType when server mimeType is not available', async () => {
      const serverResponse: ServerMediaListResponse = {
        items: [],
        total: 0,
      };

      httpMock.get.mockReturnValue(of(serverResponse));
      offlineStorageMock.listMedia.mockResolvedValue([
        {
          mediaId: 'local',
          mimeType: 'image/webp',
          size: 1000,
          createdAt: '2024-01-01',
        },
      ]);

      const result = await service.checkSyncStatus(TEST_PROJECT_KEY);

      expect(result.items[0].mimeType).toBe('image/webp');
    });
  });

  describe('downloadAllFromServer - non-Error exceptions', () => {
    it('should handle non-Error exceptions', async () => {
      httpMock.get.mockReturnValue(throwError(() => 'String error'));

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        needsDownload: 1,
        items: [
          {
            mediaId: 'cover',
            filename: 'cover.jpg',
            size: 1000,
            status: 'server-only',
          },
        ],
      }));

      await expect(
        service.downloadAllFromServer(TEST_PROJECT_KEY)
      ).rejects.toBe('String error');

      const newState = state();
      expect(newState.error).toContain('Unknown error');
    });
  });

  describe('uploadAllToServer - non-Error exceptions', () => {
    it('should handle non-Error exceptions', async () => {
      offlineStorageMock.getMedia.mockRejectedValue('String error');

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        items: [
          {
            mediaId: 'cover',
            size: 1000,
            status: 'local-only',
          },
        ],
      }));

      await expect(service.uploadAllToServer(TEST_PROJECT_KEY)).rejects.toBe(
        'String error'
      );

      const newState = state();
      expect(newState.isSyncing).toBe(false);
      expect(newState.error).toContain('Unknown error');
    });
  });

  describe('downloadFromServer - preserves other items', () => {
    it('should not affect other items when one item is downloading', async () => {
      const blob = new Blob(['test'], { type: 'image/jpeg' });
      httpMock.get.mockReturnValue(of(blob));

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        needsDownload: 1,
        items: [
          {
            mediaId: 'cover',
            filename: 'cover.jpg',
            size: 1000,
            status: 'server-only',
          },
          {
            mediaId: 'other',
            filename: 'other.jpg',
            size: 2000,
            status: 'synced',
          },
        ],
      }));

      await service.downloadFromServer(TEST_PROJECT_KEY, 'cover.jpg');

      const newState = state();
      expect(newState.items[0].status).toBe('synced');
      expect(newState.items[1].status).toBe('synced');
    });
  });

  describe('uploadToServer - preserves other items', () => {
    it('should not affect other items during upload', async () => {
      const blob = new Blob(['test'], { type: 'image/jpeg' });
      offlineStorageMock.getMedia.mockResolvedValue(blob);
      httpMock.post.mockReturnValue(of({ filename: 'cover.jpg' }));

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        needsUpload: 1,
        items: [
          {
            mediaId: 'cover',
            size: 1000,
            mimeType: 'image/jpeg',
            status: 'local-only',
          },
          {
            mediaId: 'other',
            size: 2000,
            status: 'synced',
          },
        ],
      }));

      await service.uploadToServer(TEST_PROJECT_KEY, 'cover');

      const newState = state();
      expect(newState.items[0].status).toBe('synced');
      expect(newState.items[1].status).toBe('synced');
    });

    it('should preserve other items status on upload error', async () => {
      offlineStorageMock.getMedia.mockResolvedValue(null);

      const state = service.getSyncState(TEST_PROJECT_KEY);
      state.update(s => ({
        ...s,
        items: [
          {
            mediaId: 'cover',
            size: 1000,
            status: 'local-only',
          },
          {
            mediaId: 'other',
            size: 2000,
            status: 'synced',
          },
        ],
      }));

      await expect(
        service.uploadToServer(TEST_PROJECT_KEY, 'cover')
      ).rejects.toThrow('Media not found: cover');

      const newState = state();
      expect(newState.items[0].status).toBe('local-only');
      expect(newState.items[1].status).toBe('synced');
    });
  });

  describe('checkSyncStatus - zero size fallback', () => {
    it('should use 0 size when neither server nor local has size', async () => {
      const serverResponse: ServerMediaListResponse = {
        items: [{ filename: 'nosize', size: 0 }],
        total: 1,
      };

      httpMock.get.mockReturnValue(of(serverResponse));
      offlineStorageMock.listMedia.mockResolvedValue([]);

      const result = await service.checkSyncStatus(TEST_PROJECT_KEY);

      expect(result.items[0].size).toBe(0);
    });
  });
});
