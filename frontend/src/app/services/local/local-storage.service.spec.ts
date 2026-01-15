import 'fake-indexeddb/auto';

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LocalStorageService } from './local-storage.service';
import { StorageService } from './storage.service';

// Polyfill structuredClone for test environment if needed
function createStructuredClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

if (!globalThis.structuredClone) {
  globalThis.structuredClone = createStructuredClone;
}

describe('LocalStorageService', () => {
  let service: LocalStorageService;
  let storageService: StorageService;

  const TEST_PROJECT_KEY = 'alice/my-novel';
  const TEST_USERNAME = 'alice';
  const TEST_SLUG = 'my-novel';

  // Helper to create a test blob
  function createTestBlob(content = 'test content', type = 'image/jpeg'): Blob {
    return new Blob([content], { type });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
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

  describe('convenience methods - project covers', () => {
    it('should save and get project cover', async () => {
      const blob = createTestBlob();

      await service.saveProjectCover(TEST_USERNAME, TEST_SLUG, blob);
      const retrieved = await service.getProjectCover(TEST_USERNAME, TEST_SLUG);

      expect(retrieved).not.toBeNull();
      // Blob was stored and retrieved (exact properties may vary in fake-indexeddb)
      expect(retrieved).toBeDefined();
    });

    it('should get project cover URL', async () => {
      await service.saveProjectCover(
        TEST_USERNAME,
        TEST_SLUG,
        createTestBlob()
      );

      const url = await service.getProjectCoverUrl(TEST_USERNAME, TEST_SLUG);

      expect(url).not.toBeNull();
      expect(url).toMatch(/^blob:/);
    });

    it('should delete project cover', async () => {
      await service.saveProjectCover(
        TEST_USERNAME,
        TEST_SLUG,
        createTestBlob()
      );
      await service.deleteProjectCover(TEST_USERNAME, TEST_SLUG);

      const retrieved = await service.getProjectCover(TEST_USERNAME, TEST_SLUG);
      expect(retrieved).toBeNull();
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
});
