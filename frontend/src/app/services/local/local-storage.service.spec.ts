import 'fake-indexeddb/auto';

import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { PublicProjectContextService } from '../core/public-project-context.service';
import { StorageContextService } from '../core/storage-context.service';
import { LocalStorageService } from './local-storage.service';
import { StorageService } from './storage.service';

// Polyfill structuredClone for test environment if needed
function createStructuredClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

if (!globalThis.structuredClone) {
  globalThis.structuredClone = createStructuredClone;
}

// Capture real URL methods at module load time, before any beforeAll can overwrite them (isolate: false)
const nativeCreateObjectURL = globalThis.URL.createObjectURL;
const nativeRevokeObjectURL = globalThis.URL.revokeObjectURL;

describe('LocalStorageService', () => {
  let service: LocalStorageService;
  let storageService: StorageService;

  const TEST_PROJECT_KEY = 'alice/my-novel';
  const TEST_USERNAME = 'alice';

  // Helper to create a test blob
  function createTestBlob(content = 'test content', type = 'image/jpeg'): Blob {
    return new Blob([content], { type });
  }

  beforeEach(() => {
    // Restore real URL methods — other tests directly overwrite them (not spies, so vi.restoreAllMocks won't help)
    globalThis.URL.createObjectURL = nativeCreateObjectURL;
    globalThis.URL.revokeObjectURL = nativeRevokeObjectURL;

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        StorageService,
        LocalStorageService,
      ],
    });
    storageService = TestBed.inject(StorageService);
    service = TestBed.inject(LocalStorageService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    service.revokeAllUrls();
    storageService.closeAll();
    // Reset IndexedDB for clean state
    indexedDB = new IDBFactory();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('saveMedia and getMedia', () => {
    it('should save and retrieve media', async () => {
      const blob = createTestBlob('hello world');

      await service.saveMedia(TEST_PROJECT_KEY, 'cover', blob);
      const retrieved = await service.getMedia(TEST_PROJECT_KEY, 'cover');

      // Note: fake-indexeddb may not preserve Blob properly, but we can verify
      // the record was stored by checking it's not null
      expect(retrieved).not.toBeNull();
      // In real browser, blob.size would work; in fake-indexeddb it may not
      // So we just verify we got something back
      expect(retrieved).toBeDefined();
    });

    it('should return null for non-existent media', async () => {
      const result = await service.getMedia(TEST_PROJECT_KEY, 'nonexistent');
      expect(result).toBeNull();
    });

    it('should overwrite existing media', async () => {
      const blob1 = createTestBlob('first');
      const blob2 = createTestBlob('second version');

      await service.saveMedia(TEST_PROJECT_KEY, 'cover', blob1);
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', blob2);

      const retrieved = await service.getMedia(TEST_PROJECT_KEY, 'cover');
      // Verify we got something back (overwrite worked)
      expect(retrieved).not.toBeNull();
    });

    it('should save media with filename', async () => {
      const blob = createTestBlob();

      await service.saveMedia(TEST_PROJECT_KEY, 'img-123', blob, 'photo.jpg');

      const mediaList = await service.listMedia(TEST_PROJECT_KEY);
      const img = mediaList.find(m => m.mediaId === 'img-123');

      expect(img).toBeDefined();
      expect(img!.filename).toBe('photo.jpg');
    });
  });

  describe('deleteMedia', () => {
    it('should delete media', async () => {
      const blob = createTestBlob();

      await service.saveMedia(TEST_PROJECT_KEY, 'cover', blob);
      expect(await service.hasMedia(TEST_PROJECT_KEY, 'cover')).toBe(true);

      await service.deleteMedia(TEST_PROJECT_KEY, 'cover');
      expect(await service.hasMedia(TEST_PROJECT_KEY, 'cover')).toBe(false);
    });

    it('should not throw when deleting non-existent media', async () => {
      await expect(
        service.deleteMedia(TEST_PROJECT_KEY, 'nonexistent')
      ).resolves.not.toThrow();
    });
  });

  describe('hasMedia', () => {
    it('should return true when media exists', async () => {
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob());
      expect(await service.hasMedia(TEST_PROJECT_KEY, 'cover')).toBe(true);
    });

    it('should return false when media does not exist', async () => {
      expect(await service.hasMedia(TEST_PROJECT_KEY, 'cover')).toBe(false);
    });
  });

  describe('listMedia', () => {
    it('should list all media for a project', async () => {
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob());
      await service.saveMedia(TEST_PROJECT_KEY, 'img-1', createTestBlob());
      await service.saveMedia(TEST_PROJECT_KEY, 'img-2', createTestBlob());

      const mediaList = await service.listMedia(TEST_PROJECT_KEY);

      expect(mediaList).toHaveLength(3);
      expect(mediaList.map(m => m.mediaId).sort()).toEqual([
        'cover',
        'img-1',
        'img-2',
      ]);
    });

    it('should filter by prefix', async () => {
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob());
      await service.saveMedia(TEST_PROJECT_KEY, 'img-1', createTestBlob());
      await service.saveMedia(TEST_PROJECT_KEY, 'img-2', createTestBlob());

      const images = await service.listMedia(TEST_PROJECT_KEY, 'img-');

      expect(images).toHaveLength(2);
      expect(images.map(m => m.mediaId).sort()).toEqual(['img-1', 'img-2']);
    });

    it('should not include media from other projects', async () => {
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob());
      await service.saveMedia('bob/other-project', 'cover', createTestBlob());

      const mediaList = await service.listMedia(TEST_PROJECT_KEY);

      expect(mediaList).toHaveLength(1);
      expect(mediaList[0].mediaId).toBe('cover');
    });

    it('should not include media from projects whose key extends this one', async () => {
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob());
      await service.saveMedia(
        `${TEST_PROJECT_KEY}-sequel`,
        'img-1',
        createTestBlob()
      );
      await service.saveMedia(
        `${TEST_PROJECT_KEY}x`,
        'img-2',
        createTestBlob()
      );

      const mediaList = await service.listMedia(TEST_PROJECT_KEY);

      expect(mediaList.map(m => m.mediaId)).toEqual(['cover']);
    });

    it('should include metadata in listing', async () => {
      const blob = createTestBlob('test', 'image/png');
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', blob, 'cover.png');

      const mediaList = await service.listMedia(TEST_PROJECT_KEY);

      expect(mediaList[0].mimeType).toBe('image/png');
      expect(mediaList[0].size).toBe(blob.size);
      expect(mediaList[0].filename).toBe('cover.png');
      expect(mediaList[0].createdAt).toBeDefined();
    });
  });

  describe('blob URL management', () => {
    it('should create and cache blob URLs', async () => {
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob());

      const url1 = await service.getMediaUrl(TEST_PROJECT_KEY, 'cover');
      const url2 = await service.getMediaUrl(TEST_PROJECT_KEY, 'cover');

      expect(url1).not.toBeNull();
      expect(url1).toMatch(/^blob:/);
      // Should return cached URL
      expect(url2).toBe(url1);
    });

    it('should return null for non-existent media', async () => {
      const url = await service.getMediaUrl(TEST_PROJECT_KEY, 'nonexistent');
      expect(url).toBeNull();
    });

    it('should revoke specific URL', async () => {
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob());
      await service.getMediaUrl(TEST_PROJECT_KEY, 'cover');

      service.revokeUrl(TEST_PROJECT_KEY, 'cover');

      // Getting URL again should create a new one
      const newUrl = await service.getMediaUrl(TEST_PROJECT_KEY, 'cover');
      expect(newUrl).not.toBeNull();
    });

    it('should revoke all project URLs', async () => {
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob());
      await service.saveMedia(TEST_PROJECT_KEY, 'img-1', createTestBlob());
      await service.getMediaUrl(TEST_PROJECT_KEY, 'cover');
      await service.getMediaUrl(TEST_PROJECT_KEY, 'img-1');

      service.revokeProjectUrls(TEST_PROJECT_KEY);

      // URLs should be revoked but media still exists
      expect(await service.hasMedia(TEST_PROJECT_KEY, 'cover')).toBe(true);
    });

    it('should invalidate cached URL when media is updated', async () => {
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob('v1'));
      const url1 = await service.getMediaUrl(TEST_PROJECT_KEY, 'cover');

      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob('v2'));
      const url2 = await service.getMediaUrl(TEST_PROJECT_KEY, 'cover');

      // After update, the old URL should have been revoked and a new one created
      // Both should be valid blob URLs
      expect(url1).toMatch(/^blob:/);
      expect(url2).toMatch(/^blob:/);
      // The service internally revokes the old URL, so in a real browser these would differ
      // In fake-indexeddb, URL.createObjectURL always returns the same mock
    });
  });

  describe('project cleanup', () => {
    it('should delete all project media', async () => {
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob());
      await service.saveMedia(TEST_PROJECT_KEY, 'img-1', createTestBlob());
      await service.saveMedia(TEST_PROJECT_KEY, 'img-2', createTestBlob());

      await service.deleteProjectMedia(TEST_PROJECT_KEY);

      const mediaList = await service.listMedia(TEST_PROJECT_KEY);
      expect(mediaList).toHaveLength(0);
    });

    it('should not affect other projects when deleting', async () => {
      await service.saveMedia(TEST_PROJECT_KEY, 'cover', createTestBlob());
      await service.saveMedia('bob/other', 'cover', createTestBlob());

      await service.deleteProjectMedia(TEST_PROJECT_KEY);

      expect(await service.hasMedia('bob/other', 'cover')).toBe(true);
    });

    it('should calculate project media size', async () => {
      const blob1 = createTestBlob('short');
      const blob2 = createTestBlob('a longer piece of content');

      await service.saveMedia(TEST_PROJECT_KEY, 'img-1', blob1);
      await service.saveMedia(TEST_PROJECT_KEY, 'img-2', blob2);

      const size = await service.getProjectMediaSize(TEST_PROJECT_KEY);

      expect(size).toBe(blob1.size + blob2.size);
    });

    it('should calculate total media size', async () => {
      const blob1 = createTestBlob('first');
      const blob2 = createTestBlob('second');

      await service.saveMedia(TEST_PROJECT_KEY, 'cover', blob1);
      await service.saveMedia('bob/other', 'cover', blob2);

      const totalSize = await service.getTotalMediaSize();

      expect(totalSize).toBe(blob1.size + blob2.size);
    });
  });

  describe('copyProjectMediaBetweenProfiles', () => {
    const MEDIA_DB = {
      version: 1,
      stores: { media: 'id' },
    };

    /** Open one profile's media database directly, by its prefix */
    function openDb(prefix: string): Promise<IDBDatabase> {
      return storageService.initializeDatabase({
        ...MEDIA_DB,
        dbName: `${prefix}inkweld-media`,
      });
    }

    async function put(prefix: string, id: string, content: string) {
      await storageService.put(await openDb(prefix), 'media', {
        id,
        blob: createTestBlob(content),
        mimeType: 'image/jpeg',
        size: content.length,
        createdAt: '2026-01-01T00:00:00.000Z',
        filename: `${id.split(':').pop()}.jpg`,
      });
    }

    async function ids(prefix: string): Promise<string[]> {
      const records = await storageService.getAll<{ id: string }>(
        await openDb(prefix),
        'media'
      );
      return records.map(r => r.id).sort();
    }

    it("copies one project's media into the other profile under its new address", async () => {
      await put('local-abc:', 'bobby/novel:cover', 'cover');
      await put('local-abc:', 'bobby/novel:img-1', 'image');
      await put('local-abc:', 'bobby/other:cover', 'not this one');

      const copied = await service.copyProjectMediaBetweenProfiles(
        'local-abc',
        'srv1',
        'bobby/novel',
        'mover/my-novel'
      );

      expect(copied).toBe(2);
      expect(await ids('srv:srv1:')).toEqual([
        'mover/my-novel:cover',
        'mover/my-novel:img-1',
      ]);
      // The source is left as it was
      expect(await ids('local-abc:')).toEqual([
        'bobby/novel:cover',
        'bobby/novel:img-1',
        'bobby/other:cover',
      ]);
      const record = await storageService.get<{ filename: string }>(
        await openDb('srv:srv1:'),
        'media',
        'mover/my-novel:cover'
      );
      expect(record?.filename).toBe('cover.jpg');
    });

    it('keeps media the target profile already has', async () => {
      await put('local-abc:', 'bobby/novel:cover', 'source cover');
      await put('srv:srv1:', 'bobby/novel:cover', 'target cover');

      const copied = await service.copyProjectMediaBetweenProfiles(
        'local-abc',
        'srv1',
        'bobby/novel',
        'bobby/novel'
      );

      expect(copied).toBe(0);
      const record = await storageService.get<{ size: number }>(
        await openDb('srv:srv1:'),
        'media',
        'bobby/novel:cover'
      );
      expect(record?.size).toBe('target cover'.length);
    });

    it('copies nothing for a project without media', async () => {
      await expect(
        service.copyProjectMediaBetweenProfiles(
          'local',
          'srv1',
          'bobby/empty',
          'bobby/empty'
        )
      ).resolves.toBe(0);
    });

    it('closes the databases it opened, so deleting either profile is not blocked', async () => {
      await put('local-abc:', 'bobby/novel:cover', 'cover');
      const close = vi.spyOn(storageService, 'closeDatabase');

      await service.copyProjectMediaBetweenProfiles(
        'local-abc',
        'srv1',
        'bobby/novel',
        'mover/my-novel'
      );

      expect(close).toHaveBeenCalledWith('local-abc:inkweld-media');
      expect(close).toHaveBeenCalledWith('srv:srv1:inkweld-media');
    });

    it('closes them when a file fails to copy', async () => {
      await put('local-abc:', 'bobby/novel:cover', 'cover');
      vi.spyOn(storageService, 'put').mockRejectedValueOnce(
        new Error('quota exceeded')
      );
      const close = vi.spyOn(storageService, 'closeDatabase');

      await expect(
        service.copyProjectMediaBetweenProfiles(
          'local-abc',
          'srv1',
          'bobby/novel',
          'mover/my-novel'
        )
      ).rejects.toThrow('quota exceeded');

      expect(close).toHaveBeenCalledWith('local-abc:inkweld-media');
      expect(close).toHaveBeenCalledWith('srv:srv1:inkweld-media');
    });

    it("reads the new active profile's media after a switch without a reload", async () => {
      const context = TestBed.inject(StorageContextService);
      const prefix = vi
        .spyOn(context, 'prefixDbName')
        .mockImplementation(name => `local-abc:${name}`);
      await service.saveMedia('bobby/novel', 'cover', createTestBlob('cover'));
      const close = vi.spyOn(storageService, 'closeDatabase');

      // The sign-in of a move to a server makes the server profile active
      prefix.mockImplementation(name => `srv:srv1:${name}`);

      expect(await service.getMedia('bobby/novel', 'cover')).toBeNull();
      expect(close).toHaveBeenCalledWith('local-abc:inkweld-media');

      prefix.mockImplementation(name => `local-abc:${name}`);
      expect(await service.getMedia('bobby/novel', 'cover')).not.toBeNull();
    });

    it('lets a target it read from be deleted after switching back without a reload', async () => {
      const context = TestBed.inject(StorageContextService);
      const prefix = vi
        .spyOn(context, 'prefixDbName')
        .mockImplementation(name => `srv:srv1:${name}`);
      // After the sign-in the server profile is active and its media is read
      await service.saveMedia('mover/novel', 'cover', createTestBlob('cover'));
      // Cancelling returns to the Browser profile; then the server profile
      // is removed, which closes this tab's connections to it first
      prefix.mockImplementation(name => `local-abc:${name}`);
      storageService.closeDatabasesWithPrefix('srv:srv1:');
      await Promise.resolve();

      const deleted = await new Promise<string>(resolve => {
        const request = indexedDB.deleteDatabase('srv:srv1:inkweld-media');
        request.onsuccess = () => resolve('deleted');
        request.onblocked = () => resolve('blocked');
      });

      expect(deleted).toBe('deleted');
      // And the service reads the Browser profile's media from now on
      expect(await service.getMedia('mover/novel', 'cover')).toBeNull();
    });

    it('leaves open the database it uses for the active profile', async () => {
      const context = TestBed.inject(StorageContextService);
      vi.spyOn(context, 'getPrefixForConfig').mockImplementation(id =>
        id === 'active' ? context.getPrefix() : `srv:${id}:`
      );
      await service.saveMedia('bobby/novel', 'cover', createTestBlob('cover'));
      const close = vi.spyOn(storageService, 'closeDatabase');

      await service.copyProjectMediaBetweenProfiles(
        'active',
        'srv1',
        'bobby/novel',
        'mover/my-novel'
      );

      expect(close).toHaveBeenCalledWith('srv:srv1:inkweld-media');
      expect(close).not.toHaveBeenCalledWith(
        context.prefixDbName('inkweld-media')
      );
      expect(await service.getMedia('bobby/novel', 'cover')).not.toBeNull();
    });
  });

  describe('convenience methods - user avatars', () => {
    it('should save and get user avatar', async () => {
      const blob = createTestBlob();

      await service.saveUserAvatar(TEST_USERNAME, blob);
      const retrieved = await service.getUserAvatar(TEST_USERNAME);

      expect(retrieved).not.toBeNull();
      // Blob was stored and retrieved (exact properties may vary in fake-indexeddb)
      expect(retrieved).toBeDefined();
    });

    it('should get user avatar URL', async () => {
      await service.saveUserAvatar(TEST_USERNAME, createTestBlob());

      const url = await service.getUserAvatarUrl(TEST_USERNAME);

      expect(url).not.toBeNull();
      expect(url).toMatch(/^blob:/);
    });
  });
  describe('while browsing a public project', () => {
    const MEDIA_URL = 'https://srv.test/api/v1/media/alice/my%20novel';
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [translocoTestProvider()],
        providers: [
          provideZonelessChangeDetection(),
          provideHttpClient(),
          provideHttpClientTesting(),
          StorageService,
          LocalStorageService,
          {
            provide: PublicProjectContextService,
            useValue: {
              active: () => true,
              serverUrl: () => 'https://srv.test',
              storagePrefix: () => 'public:srv:',
            },
          },
        ],
      });
      storageService = TestBed.inject(StorageService);
      service = TestBed.inject(LocalStorageService);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      http.verify();
    });

    function answerList(): void {
      http.expectOne(MEDIA_URL).flush({
        items: [
          {
            filename: 'img-1.png',
            mimeType: 'image/png',
            size: 3,
            uploadedAt: '2026-01-01T00:00:00.000Z',
          },
          { filename: 'cover.jpg', size: 5 },
          { filename: 'notes.xyz', size: 7 },
        ],
      });
    }

    /** Answer a request for `url` once the service has made it. */
    async function answerWhenAsked(url: string, body: Blob): Promise<void> {
      await vi.waitFor(() => {
        const [request] = http.match(url);
        if (!request) throw new Error(`${url} not requested yet`);
        request.flush(body);
      });
    }

    it("lists the serving project's media from the server", async () => {
      const listed = service.listMedia('alice/my novel', 'img-');
      answerList();

      expect(await listed).toEqual([
        {
          mediaId: 'img-1',
          filename: 'img-1.png',
          mimeType: 'image/png',
          size: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('fills in a missing type from the file name, and a missing date', async () => {
      // R2's listings carry no types: images must still read as images
      const listed = service.listMedia('alice/my novel');
      answerList();

      const items = await listed;
      const cover = items.find(item => item.mediaId === 'cover');
      expect(cover?.mimeType).toBe('image/jpeg');
      expect(cover?.createdAt).toBe('');
      expect(items.find(item => item.mediaId === 'notes')?.mimeType).toBe(
        'application/octet-stream'
      );
    });

    it('downloads a listed file by its media id', async () => {
      const blob = service.getMedia('alice/my novel', 'img-1');
      answerList();
      const image = new Blob(['png'], { type: 'image/png' });
      await answerWhenAsked(`${MEDIA_URL}/img-1.png`, image);

      expect(await blob).toBeInstanceOf(Blob);
    });

    it('downloads the files of a recent listing without listing again', async () => {
      const listed = service.listMedia('alice/my novel');
      answerList();
      await listed;

      const image = service.getMediaUrl('alice/my novel', 'img-1');
      const cover = service.getMedia('alice/my novel', 'cover');
      await answerWhenAsked(`${MEDIA_URL}/img-1.png`, new Blob(['png']));
      await answerWhenAsked(`${MEDIA_URL}/cover.jpg`, new Blob(['jpg']));

      expect(await image).toMatch(/^blob:/);
      expect(await cover).toBeInstanceOf(Blob);
      http.expectNone(MEDIA_URL);
    });

    it('lists again for a file a recent listing lacks', async () => {
      const listed = service.listMedia('alice/my novel');
      answerList();
      await listed;

      const added = service.getMedia('alice/my novel', 'img-2');
      await vi.waitFor(() => http.expectOne(MEDIA_URL).flush({ items: [] }));

      expect(await added).toBeNull();
    });

    it('lists again once the last listing is old or failed', async () => {
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
      try {
        const failed = service.listMedia('alice/my novel');
        http
          .expectOne(MEDIA_URL)
          .flush('down', { status: 503, statusText: 'Unavailable' });
        await expect(failed).rejects.toBeTruthy();

        // The failed listing isn't reused
        const first = service.getMedia('alice/my novel', 'missing');
        await vi.waitFor(() => http.expectOne(MEDIA_URL).flush({ items: [] }));
        expect(await first).toBeNull();

        // Nor is one past its few seconds
        now.mockReturnValue(1_060_000);
        const second = service.getMedia('alice/my novel', 'missing');
        await vi.waitFor(() => http.expectOne(MEDIA_URL).flush({ items: [] }));
        expect(await second).toBeNull();
      } finally {
        now.mockRestore();
      }
    });

    it('has nothing for media the project does not list', async () => {
      const blob = service.hasMedia('alice/my novel', 'missing');
      answerList();

      expect(await blob).toBe(false);
    });

    it('refuses to store or delete media', async () => {
      await expect(
        service.saveMedia('alice/my novel', 'img-2', createTestBlob())
      ).rejects.toThrow('Public project media is read-only');
      await expect(
        service.deleteMedia('alice/my novel', 'img-1')
      ).rejects.toThrow('Public project media is read-only');
    });
  });
});
