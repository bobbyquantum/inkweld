import 'fake-indexeddb/auto';

import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Project } from '@inkweld/index';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import { environment } from '../../../environments/environment';
import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import { LocalStorageService } from '../local/local-storage.service';
import { MediaSyncService } from '../local/media-sync.service';
import { CoverSyncService } from './cover-sync.service';

const BASE = environment.apiUrl;

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    slug: 'my-novel',
    title: 'My Novel',
    description: null,
    username: 'alice',
    coverImage: 'cover-1711638400000.jpg',
    createdDate: '2024-01-01T00:00:00Z',
    updatedDate: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('CoverSyncService', () => {
  let service: CoverSyncService;
  let httpMock: HttpTestingController;
  let mockLocalStorage: {
    hasMedia: Mock;
    saveMedia: Mock;
    getMedia: Mock;
  };
  let mockMediaSyncService: {
    mediaSyncVersion: ReturnType<typeof signal<number>>;
  };
  let mockSetupService: { getMode: Mock };
  let mockLogger: { info: Mock; warn: Mock; error: Mock; debug: Mock };

  beforeEach(() => {
    mockLocalStorage = {
      hasMedia: vi.fn().mockResolvedValue(false),
      saveMedia: vi.fn().mockResolvedValue(undefined),
      getMedia: vi.fn().mockResolvedValue(null),
    };

    mockMediaSyncService = {
      mediaSyncVersion: signal(0),
    };

    mockSetupService = {
      getMode: vi.fn().mockReturnValue('server'),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        CoverSyncService,
        { provide: LocalStorageService, useValue: mockLocalStorage },
        { provide: MediaSyncService, useValue: mockMediaSyncService },
        { provide: SetupService, useValue: mockSetupService },
        { provide: LoggerService, useValue: mockLogger },
      ],
    });

    service = TestBed.inject(CoverSyncService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('syncCovers', () => {
    it('should skip when already syncing', async () => {
      const project = createProject();

      // Start first sync (will create an HTTP request)
      const firstSync = service.syncCovers([project]);
      expect(service.isSyncing()).toBe(true);

      // Second call should skip (isSyncing is already true)
      await service.syncCovers([project]);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'CoverSync',
        'Skipping — already syncing'
      );

      // Allow microtasks so HTTP request dispatches
      await new Promise(resolve => setTimeout(resolve, 0));

      // Flush to complete first sync
      httpMock
        .expectOne(
          `${BASE}/api/v1/media/alice/my-novel/cover-1711638400000.jpg`
        )
        .flush(new Blob(['img']));
      await firstSync;
    });

    it('should skip in local mode', async () => {
      mockSetupService.getMode.mockReturnValue('local');

      await service.syncCovers([createProject()]);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'CoverSync',
        'Skipping — local mode'
      );
    });

    it('should skip when offline', async () => {
      const original = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      await service.syncCovers([createProject()]);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'CoverSync',
        'Skipping — offline'
      );

      Object.defineProperty(navigator, 'onLine', {
        value: original,
        configurable: true,
      });
    });

    it('should skip projects without coverImage', async () => {
      const project = createProject({ coverImage: null });

      await service.syncCovers([project]);

      expect(mockLocalStorage.hasMedia).not.toHaveBeenCalled();
    });

    it('should skip already-cached covers', async () => {
      mockLocalStorage.hasMedia.mockResolvedValue(true);

      await service.syncCovers([createProject()]);

      expect(mockLocalStorage.hasMedia).toHaveBeenCalledWith(
        'alice/my-novel',
        'cover-1711638400000'
      );
      // No HTTP requests should be made
      httpMock.expectNone(() => true);
    });

    it('should download uncached covers', async () => {
      const project = createProject();
      const coverBlob = new Blob(['image-data'], { type: 'image/jpeg' });

      const syncPromise = service.syncCovers([project]);
      await new Promise(resolve => setTimeout(resolve, 0));

      const req = httpMock.expectOne(
        `${BASE}/api/v1/media/alice/my-novel/cover-1711638400000.jpg`
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      req.flush(coverBlob);

      await syncPromise;

      expect(mockLocalStorage.saveMedia).toHaveBeenCalledWith(
        'alice/my-novel',
        'cover-1711638400000',
        expect.any(Blob),
        'cover-1711638400000.jpg'
      );
    });

    it('should detect changed covers by new mediaId', async () => {
      // Old cover is cached, new one is not
      mockLocalStorage.hasMedia.mockImplementation(
        (_projectKey: string, mediaId: string) => {
          return Promise.resolve(mediaId === 'cover-1111111111111');
        }
      );

      const project = createProject({
        coverImage: 'cover-2222222222222.jpg',
      });

      const syncPromise = service.syncCovers([project]);
      await new Promise(resolve => setTimeout(resolve, 0));

      httpMock
        .expectOne(
          `${BASE}/api/v1/media/alice/my-novel/cover-2222222222222.jpg`
        )
        .flush(new Blob(['new-cover']));

      await syncPromise;

      expect(mockLocalStorage.saveMedia).toHaveBeenCalledWith(
        'alice/my-novel',
        'cover-2222222222222',
        expect.any(Blob),
        'cover-2222222222222.jpg'
      );
    });

    it('should bump mediaSyncVersion after successful downloads', async () => {
      expect(mockMediaSyncService.mediaSyncVersion()).toBe(0);

      const syncPromise = service.syncCovers([createProject()]);
      await new Promise(resolve => setTimeout(resolve, 0));

      httpMock
        .expectOne(
          `${BASE}/api/v1/media/alice/my-novel/cover-1711638400000.jpg`
        )
        .flush(new Blob(['img']));

      await syncPromise;

      expect(mockMediaSyncService.mediaSyncVersion()).toBe(1);
    });

    it('should not bump mediaSyncVersion when all covers are cached', async () => {
      mockLocalStorage.hasMedia.mockResolvedValue(true);

      await service.syncCovers([createProject()]);

      expect(mockMediaSyncService.mediaSyncVersion()).toBe(0);
    });

    it('should handle individual download failures gracefully', async () => {
      const projects = [
        createProject({ id: '1', slug: 'proj-a', coverImage: 'cover-a.jpg' }),
        createProject({ id: '2', slug: 'proj-b', coverImage: 'cover-b.jpg' }),
      ];

      const syncPromise = service.syncCovers(projects);
      await new Promise(resolve => setTimeout(resolve, 0));

      // Flush both — order depends on concurrency, so match flexibly
      const requests = httpMock.match(() => true);
      for (const req of requests) {
        if (req.request.url.includes('proj-a')) {
          req.error(new ProgressEvent('error'), {
            status: 404,
            statusText: 'Not Found',
          });
        } else {
          req.flush(new Blob(['img']));
        }
      }

      await syncPromise;

      // Should save the successful one
      expect(mockLocalStorage.saveMedia).toHaveBeenCalledTimes(1);
      expect(mockLocalStorage.saveMedia).toHaveBeenCalledWith(
        'alice/proj-b',
        'cover-b',
        expect.any(Blob),
        'cover-b.jpg'
      );

      // Should still bump version for the one that succeeded
      expect(mockMediaSyncService.mediaSyncVersion()).toBe(1);

      // Should log warning for the failed one
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'CoverSync',
        expect.stringContaining('alice/proj-a')
      );
    });

    it('should download multiple projects concurrently', async () => {
      const projects = [
        createProject({ id: '1', slug: 'p1', coverImage: 'c1.jpg' }),
        createProject({ id: '2', slug: 'p2', coverImage: 'c2.jpg' }),
        createProject({ id: '3', slug: 'p3', coverImage: 'c3.jpg' }),
        createProject({ id: '4', slug: 'p4', coverImage: 'c4.jpg' }),
      ];

      const syncPromise = service.syncCovers(projects);

      // Flush all pending requests in batches (concurrency pool)
      let totalFlushed = 0;
      for (let batch = 0; batch < 5 && totalFlushed < 4; batch++) {
        const requests = httpMock.match(() => true);
        for (const req of requests) {
          req.flush(new Blob(['img']));
          totalFlushed++;
        }
        // Allow microtasks to run so next batch of requests fires
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      await syncPromise;

      expect(mockLocalStorage.saveMedia).toHaveBeenCalledTimes(4);
    });

    it('should set isSyncing during sync and clear after', async () => {
      expect(service.isSyncing()).toBe(false);

      const project = createProject();
      const syncPromise = service.syncCovers([project]);

      expect(service.isSyncing()).toBe(true);

      // Allow microtasks to run so HTTP request is dispatched
      await new Promise(resolve => setTimeout(resolve, 0));

      httpMock
        .expectOne(
          `${BASE}/api/v1/media/alice/my-novel/cover-1711638400000.jpg`
        )
        .flush(new Blob(['img']));

      await syncPromise;

      expect(service.isSyncing()).toBe(false);
    });

    it('should handle empty project list', async () => {
      await service.syncCovers([]);

      expect(service.isSyncing()).toBe(false);
    });

    it('should strip file extension to derive mediaId', async () => {
      const project = createProject({ coverImage: 'my-cover.png' });

      const syncPromise = service.syncCovers([project]);

      // Allow microtasks to run so HTTP request is dispatched
      await new Promise(resolve => setTimeout(resolve, 0));

      httpMock
        .expectOne(`${BASE}/api/v1/media/alice/my-novel/my-cover.png`)
        .flush(new Blob(['img']));

      await syncPromise;

      expect(mockLocalStorage.hasMedia).toHaveBeenCalledWith(
        'alice/my-novel',
        'my-cover'
      );
      expect(mockLocalStorage.saveMedia).toHaveBeenCalledWith(
        'alice/my-novel',
        'my-cover',
        expect.any(Blob),
        'my-cover.png'
      );
    });
  });
});
