import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';

import { PublishFormat } from '../../models/publish-plan';
import {
  PublishedFile,
  PublishedFileMetadata,
  SharePermission,
} from '../../models/published-file';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { OfflineStorageService } from '../offline/offline-storage.service';
import { PublishedFilesService } from './published-files.service';

describe('PublishedFilesService', () => {
  let service: PublishedFilesService;
  let offlineStorage: DeepMockProxy<OfflineStorageService>;
  let logger: DeepMockProxy<LoggerService>;
  let setupService: DeepMockProxy<SetupService>;

  const mockProjectKey = 'testuser/test-project';

  const mockMetadata: PublishedFileMetadata = {
    title: 'Test Book',
    author: 'Test Author',
    itemCount: 10,
    wordCount: 5000,
  };

  const mockFile: PublishedFile = {
    id: 'file-1',
    projectId: mockProjectKey,
    filename: 'test-book.epub',
    format: PublishFormat.EPUB,
    mimeType: 'application/epub+zip',
    size: 1024,
    planName: 'Default Export',
    sharePermission: SharePermission.Private,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    metadata: mockMetadata,
  };

  const mockBlob = new Blob(['test content'], {
    type: 'application/epub+zip',
  });

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    offlineStorage = mockDeep<OfflineStorageService>();
    logger = mockDeep<LoggerService>();
    setupService = mockDeep<SetupService>();

    // Default to offline mode
    setupService.getMode.mockReturnValue('offline');
    setupService.getServerUrl.mockReturnValue('http://localhost:8333');

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        PublishedFilesService,
        { provide: OfflineStorageService, useValue: offlineStorage },
        { provide: LoggerService, useValue: logger },
        { provide: SetupService, useValue: setupService },
      ],
    });

    service = TestBed.inject(PublishedFilesService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should initialize with empty files', () => {
      expect(service.loading()).toBe(false);
      expect(service.error()).toBeNull();
    });
  });

  describe('loadFiles', () => {
    it('should load files from offline storage in offline mode', async () => {
      // Store mock data in localStorage
      const key = `${mockProjectKey}:published-files`;
      localStorage.setItem(key, JSON.stringify([mockFile]));

      const files = await service.loadFiles(mockProjectKey);

      expect(files).toHaveLength(1);
      expect(files[0].id).toBe('file-1');
      expect(service.loading()).toBe(false);
    });

    it('should return empty array when no files stored', async () => {
      const files = await service.loadFiles(mockProjectKey);

      expect(files).toHaveLength(0);
    });

    it('should handle corrupted localStorage data gracefully', async () => {
      const key = `${mockProjectKey}:published-files`;
      localStorage.setItem(key, 'invalid json');

      const files = await service.loadFiles(mockProjectKey);

      expect(files).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should fetch from server when in online mode', async () => {
      setupService.getMode.mockReturnValue('server');

      const serverFiles = [mockFile];
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(serverFiles),
        })
      );

      const files = await service.loadFiles(mockProjectKey);

      expect(files).toHaveLength(1);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8333/api/v1/projects/testuser/test-project/published',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should merge offline and server files', async () => {
      setupService.getMode.mockReturnValue('server');

      // Offline file
      const offlineFile: PublishedFile = {
        ...mockFile,
        id: 'offline-only',
      };
      const key = `${mockProjectKey}:published-files`;
      localStorage.setItem(key, JSON.stringify([offlineFile]));

      // Server file
      const serverFile: PublishedFile = {
        ...mockFile,
        id: 'server-file',
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve([serverFile]),
        })
      );

      const files = await service.loadFiles(mockProjectKey);

      // Should have both files
      expect(files).toHaveLength(2);
      expect(files.find(f => f.id === 'offline-only')).toBeDefined();
      expect(files.find(f => f.id === 'server-file')).toBeDefined();
    });

    it('should handle server fetch failure gracefully', async () => {
      setupService.getMode.mockReturnValue('server');

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        })
      );

      // Should still work with empty result
      const files = await service.loadFiles(mockProjectKey);
      expect(files).toHaveLength(0);
    });
  });

  describe('savePublishedFile', () => {
    it('should save file to offline storage', async () => {
      offlineStorage.saveMedia.mockResolvedValue(undefined);

      const result = await service.savePublishedFile(mockProjectKey, mockBlob, {
        filename: 'new-book.epub',
        format: PublishFormat.EPUB,
        mimeType: 'application/epub+zip',
        planName: 'Default Export',
        metadata: mockMetadata,
      });

      expect(result.filename).toBe('new-book.epub');
      expect(result.format).toBe(PublishFormat.EPUB);
      expect(result.size).toBe(mockBlob.size);
      expect(offlineStorage.saveMedia).toHaveBeenCalled();
    });

    it('should generate unique ID for new files', async () => {
      offlineStorage.saveMedia.mockResolvedValue(undefined);

      const result = await service.savePublishedFile(mockProjectKey, mockBlob, {
        filename: 'new-book.epub',
        format: PublishFormat.EPUB,
        mimeType: 'application/epub+zip',
        planName: 'Default Export',
        metadata: mockMetadata,
      });

      expect(result.id).toBeDefined();
      expect(result.id.length).toBeGreaterThan(0);
    });

    it('should upload to server in online mode', async () => {
      setupService.getMode.mockReturnValue('server');
      offlineStorage.saveMedia.mockResolvedValue(undefined);

      const serverResponse: PublishedFile = {
        ...mockFile,
        shareToken: 'server-token',
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(serverResponse),
        })
      );

      const result = await service.savePublishedFile(mockProjectKey, mockBlob, {
        filename: 'new-book.epub',
        format: PublishFormat.EPUB,
        mimeType: 'application/epub+zip',
        planName: 'Default Export',
        metadata: mockMetadata,
      });

      expect(fetch).toHaveBeenCalled();
      expect(result.shareToken).toBe('server-token');
    });

    it('should continue with offline file when server upload fails', async () => {
      setupService.getMode.mockReturnValue('server');
      offlineStorage.saveMedia.mockResolvedValue(undefined);

      // uploadToServer catches fetch errors internally and returns null
      // so the file just gets saved offline without triggering the warning
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new Error('Network error'))
      );

      const result = await service.savePublishedFile(mockProjectKey, mockBlob, {
        filename: 'new-book.epub',
        format: PublishFormat.EPUB,
        mimeType: 'application/epub+zip',
        planName: 'Default Export',
        metadata: mockMetadata,
      });

      // File should still be saved with correct properties
      expect(result.filename).toBe('new-book.epub');
      expect(result.format).toBe(PublishFormat.EPUB);
      // No shareToken since server upload failed
      expect(result.shareToken).toBeUndefined();
    });
  });

  describe('getFileBlob', () => {
    it('should return blob from offline storage', async () => {
      offlineStorage.getMedia.mockResolvedValue(mockBlob);

      const blob = await service.getFileBlob(mockProjectKey, 'file-1');

      expect(blob).toBe(mockBlob);
      expect(offlineStorage.getMedia).toHaveBeenCalledWith(
        mockProjectKey,
        'published-file-1'
      );
    });

    it('should download from server if not in offline storage', async () => {
      setupService.getMode.mockReturnValue('server');
      offlineStorage.getMedia.mockResolvedValue(null);

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          blob: () => Promise.resolve(mockBlob),
        })
      );

      const blob = await service.getFileBlob(mockProjectKey, 'file-1');

      expect(blob).toBe(mockBlob);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8333/api/v1/projects/testuser/test-project/published/file-1',
        expect.objectContaining({ credentials: 'include' })
      );
    });

    it('should return null if file not found anywhere', async () => {
      offlineStorage.getMedia.mockResolvedValue(null);

      const blob = await service.getFileBlob(mockProjectKey, 'nonexistent');

      expect(blob).toBeNull();
    });
  });

  describe('downloadFile', () => {
    it('should trigger browser download', async () => {
      // Setup file in service
      const key = `${mockProjectKey}:published-files`;
      localStorage.setItem(key, JSON.stringify([mockFile]));
      await service.loadFiles(mockProjectKey);

      offlineStorage.getMedia.mockResolvedValue(mockBlob);

      // Mock DOM APIs
      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(
        mockAnchor as unknown as HTMLAnchorElement
      );
      vi.spyOn(document.body, 'appendChild').mockImplementation(
        () => mockAnchor as unknown as Node
      );
      vi.spyOn(document.body, 'removeChild').mockImplementation(
        () => mockAnchor as unknown as Node
      );
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      await service.downloadFile(mockProjectKey, 'file-1');

      expect(mockAnchor.click).toHaveBeenCalled();
      expect(mockAnchor.download).toBe('test-book.epub');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });

    it('should throw error if file not found', async () => {
      await expect(
        service.downloadFile(mockProjectKey, 'nonexistent')
      ).rejects.toThrow('File not found');
    });

    it('should throw error if blob not found', async () => {
      const key = `${mockProjectKey}:published-files`;
      localStorage.setItem(key, JSON.stringify([mockFile]));
      await service.loadFiles(mockProjectKey);

      offlineStorage.getMedia.mockResolvedValue(null);

      await expect(
        service.downloadFile(mockProjectKey, 'file-1')
      ).rejects.toThrow('File content not found');
    });
  });

  describe('updateSharePermission', () => {
    beforeEach(async () => {
      const key = `${mockProjectKey}:published-files`;
      localStorage.setItem(key, JSON.stringify([mockFile]));
      await service.loadFiles(mockProjectKey);
    });

    it('should update share permission to Link', async () => {
      const result = await service.updateSharePermission(
        mockProjectKey,
        'file-1',
        SharePermission.Link
      );

      expect(result?.sharePermission).toBe(SharePermission.Link);
      expect(result?.shareToken).toBeDefined();
    });

    it('should update share permission to Public', async () => {
      const result = await service.updateSharePermission(
        mockProjectKey,
        'file-1',
        SharePermission.Public
      );

      expect(result?.sharePermission).toBe(SharePermission.Public);
      expect(result?.shareToken).toBeDefined();
    });

    it('should remove share token when setting to Private', async () => {
      // First set to Link to get a token
      await service.updateSharePermission(
        mockProjectKey,
        'file-1',
        SharePermission.Link
      );

      // Then set back to Private
      const result = await service.updateSharePermission(
        mockProjectKey,
        'file-1',
        SharePermission.Private
      );

      expect(result?.sharePermission).toBe(SharePermission.Private);
      expect(result?.shareToken).toBeUndefined();
    });

    it('should return null for nonexistent file', async () => {
      const result = await service.updateSharePermission(
        mockProjectKey,
        'nonexistent',
        SharePermission.Link
      );

      expect(result).toBeNull();
    });

    it('should call server in online mode', async () => {
      setupService.getMode.mockReturnValue('server');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await service.updateSharePermission(
        mockProjectKey,
        'file-1',
        SharePermission.Link
      );

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8333/api/v1/projects/testuser/test-project/published/file-1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('sharePermission'),
        })
      );
    });
  });

  describe('getShareUrl', () => {
    it('should return share URL for file with token', () => {
      const fileWithToken: PublishedFile = {
        ...mockFile,
        shareToken: 'abc123',
      };

      const url = service.getShareUrl(fileWithToken);

      expect(url).toBe('http://localhost:8333/share/abc123');
    });

    it('should return null for file without token', () => {
      const url = service.getShareUrl(mockFile);

      expect(url).toBeNull();
    });
  });

  describe('deleteFile', () => {
    beforeEach(async () => {
      const key = `${mockProjectKey}:published-files`;
      localStorage.setItem(key, JSON.stringify([mockFile]));
      await service.loadFiles(mockProjectKey);
    });

    it('should delete blob and update metadata', async () => {
      offlineStorage.deleteMedia.mockResolvedValue(undefined);

      await service.deleteFile(mockProjectKey, 'file-1');

      expect(offlineStorage.deleteMedia).toHaveBeenCalledWith(
        mockProjectKey,
        'published-file-1'
      );

      // Verify file is removed from list
      const key = `${mockProjectKey}:published-files`;
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      expect(stored).toHaveLength(0);
    });

    it('should call server in online mode', async () => {
      setupService.getMode.mockReturnValue('server');
      offlineStorage.deleteMedia.mockResolvedValue(undefined);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

      await service.deleteFile(mockProjectKey, 'file-1');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8333/api/v1/projects/testuser/test-project/published/file-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('clearProjectFiles', () => {
    it('should clear all files for a project', async () => {
      const files = [mockFile, { ...mockFile, id: 'file-2' }];
      const key = `${mockProjectKey}:published-files`;
      localStorage.setItem(key, JSON.stringify(files));
      await service.loadFiles(mockProjectKey);

      offlineStorage.deleteMedia.mockResolvedValue(undefined);

      await service.clearProjectFiles(mockProjectKey);

      expect(offlineStorage.deleteMedia).toHaveBeenCalledTimes(2);

      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      expect(stored).toHaveLength(0);
    });
  });
});
