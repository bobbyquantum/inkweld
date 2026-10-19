import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@services/core/logger.service';
import {
  LocalStorageService,
  type MediaInfo,
} from '@services/local/local-storage.service';
import { MediaAutoSyncService } from '@services/sync/media-auto-sync.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdentityImageService, isInlineImage } from './identity-image.service';
import { WorldbuildingService } from './worldbuilding.service';

const PROJECT = 'alice/novel';
const PNG_DATA_URL = `data:image/png;base64,${btoa('png-bytes')}`;

describe('IdentityImageService', () => {
  let service: IdentityImageService;
  let stored: Map<string, Blob>;
  let listed: MediaInfo[];
  let localStorage: {
    getMedia: ReturnType<typeof vi.fn>;
    saveMedia: ReturnType<typeof vi.fn>;
    listMedia: ReturnType<typeof vi.fn>;
  };
  let worldbuilding: {
    getIdentityData: ReturnType<typeof vi.fn>;
    replaceIdentityImage: ReturnType<typeof vi.fn>;
  };
  let autoSync: { triggerSyncAfterUpload: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    stored = new Map();
    listed = [];
    localStorage = {
      getMedia: vi.fn((_key: string, id: string) =>
        Promise.resolve(stored.get(id) ?? null)
      ),
      saveMedia: vi.fn((_key: string, id: string, blob: Blob) => {
        stored.set(id, blob);
        return Promise.resolve();
      }),
      listMedia: vi.fn(() => Promise.resolve(listed)),
    };
    worldbuilding = {
      getIdentityData: vi.fn().mockResolvedValue({}),
      replaceIdentityImage: vi.fn().mockResolvedValue(true),
    };
    autoSync = { triggerSyncAfterUpload: vi.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      providers: [
        IdentityImageService,
        { provide: LocalStorageService, useValue: localStorage },
        { provide: WorldbuildingService, useValue: worldbuilding },
        { provide: MediaAutoSyncService, useValue: autoSync },
        {
          provide: LoggerService,
          useValue: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
        },
      ],
    });
    service = TestBed.inject(IdentityImageService);
  });

  describe('storeImage', () => {
    it('saves the blob as project media and returns a media reference', async () => {
      const blob = new Blob(['png-bytes'], { type: 'image/png' });

      const reference = await service.storeImage(PROJECT, blob);

      expect(reference).toMatch(/^media:\/\/identity-[0-9a-f]{32}\.png$/);
      const mediaId = reference.slice('media://'.length, -'.png'.length);
      expect(localStorage.saveMedia).toHaveBeenCalledWith(
        PROJECT,
        mediaId,
        blob,
        `${mediaId}.png`
      );
      expect(autoSync.triggerSyncAfterUpload).toHaveBeenCalled();
    });

    it('derives the id from the bytes, so the same image is stored once', async () => {
      const first = await service.storeImage(
        PROJECT,
        new Blob(['same'], { type: 'image/jpeg' })
      );
      const second = await service.storeImage(
        PROJECT,
        new Blob(['same'], { type: 'image/jpeg' })
      );
      const other = await service.storeImage(
        PROJECT,
        new Blob(['different'], { type: 'image/jpeg' })
      );

      expect(second).toBe(first);
      expect(first).toMatch(/\.jpg$/);
      expect(other).not.toBe(first);
      expect(localStorage.saveMedia).toHaveBeenCalledTimes(2);
    });
  });

  describe('toIdentityImage', () => {
    it('stores a data URL as media instead of returning it', async () => {
      const reference = await service.toIdentityImage(PROJECT, {
        imageData: PNG_DATA_URL,
      });

      expect(reference).toMatch(/^media:\/\/identity-[0-9a-f]{32}\.png$/);
      expect(localStorage.saveMedia).toHaveBeenCalledTimes(1);
      const savedBlob = localStorage.saveMedia.mock.calls[0][2] as Blob;
      expect(await savedBlob.text()).toBe('png-bytes');
    });

    it('prefers the blob over decoding the data URL', async () => {
      const blob = new Blob(['cropped'], { type: 'image/png' });

      await service.toIdentityImage(PROJECT, {
        imageData: PNG_DATA_URL,
        imageBlob: blob,
      });

      expect(localStorage.saveMedia.mock.calls[0][2]).toBe(blob);
    });

    it('references an existing media item instead of copying it', async () => {
      // A generated image: display filename, uploaded as <id>.<ext of type>.
      listed = [
        {
          mediaId: 'generated-1-0',
          mimeType: 'image/webp',
          size: 1,
          createdAt: '',
          filename: 'ai-generated-1-0.webp',
        },
      ];

      const reference = await service.toIdentityImage(PROJECT, {
        mediaId: 'generated-1-0',
        imageData: PNG_DATA_URL,
        imageBlob: new Blob(['x'], { type: 'image/png' }),
      });

      expect(reference).toBe('media://generated-1-0.webp');
      expect(localStorage.saveMedia).not.toHaveBeenCalled();
    });

    it('keeps the server filename of a downloaded item', async () => {
      listed = [
        {
          mediaId: 'Photo',
          mimeType: 'image/jpeg',
          size: 1,
          createdAt: '',
          filename: 'Photo.jpeg',
        },
      ];

      const reference = await service.toIdentityImage(PROJECT, {
        mediaId: 'Photo',
      });

      expect(reference).toBe('media://Photo.jpeg');
    });

    it('keeps an image of an unusual type inline', async () => {
      const avif = `data:image/avif;base64,${btoa('avif')}`;

      expect(await service.toIdentityImage(PROJECT, { imageData: avif })).toBe(
        avif
      );
      expect(localStorage.saveMedia).not.toHaveBeenCalled();
    });

    it('falls back to storing the image when the media item is unknown', async () => {
      const reference = await service.toIdentityImage(PROJECT, {
        mediaId: 'missing',
        imageData: PNG_DATA_URL,
      });

      expect(reference).toMatch(/^media:\/\/identity-/);
      expect(localStorage.saveMedia).toHaveBeenCalledTimes(1);
    });

    it('passes references and URLs through unchanged', async () => {
      expect(
        await service.toIdentityImage(PROJECT, {
          imageData: 'media://img-2.png',
        })
      ).toBe('media://img-2.png');
      expect(
        await service.toIdentityImage(PROJECT, {
          imageData: 'https://example.com/a.png',
        })
      ).toBe('https://example.com/a.png');
      expect(await service.toIdentityImage(PROJECT, {})).toBeUndefined();
      expect(localStorage.saveMedia).not.toHaveBeenCalled();
    });
  });

  describe('migrateInlineImage', () => {
    it('moves an inline image to media and swaps in the reference', async () => {
      worldbuilding.getIdentityData.mockResolvedValue({ image: PNG_DATA_URL });

      const reference = await service.migrateInlineImage(
        'el-1',
        'alice',
        'novel'
      );

      expect(reference).toMatch(/^media:\/\/identity-[0-9a-f]{32}\.png$/);
      expect(localStorage.saveMedia).toHaveBeenCalledTimes(1);
      expect(worldbuilding.replaceIdentityImage).toHaveBeenCalledWith(
        'el-1',
        PNG_DATA_URL,
        reference,
        'alice',
        'novel'
      );
    });

    it('leaves malformed or unusual inline images alone', async () => {
      worldbuilding.getIdentityData.mockResolvedValue({
        image: 'data:image/png;base64,%%%not-base64',
      });
      expect(
        await service.migrateInlineImage('el-1', 'alice', 'novel')
      ).toBeNull();

      worldbuilding.getIdentityData.mockResolvedValue({
        image: `data:image/svg+xml;base64,${btoa('<svg/>')}`,
      });
      expect(
        await service.migrateInlineImage('el-1', 'alice', 'novel')
      ).toBeNull();

      expect(worldbuilding.replaceIdentityImage).not.toHaveBeenCalled();
    });

    it('does nothing for a media reference or no image', async () => {
      worldbuilding.getIdentityData.mockResolvedValue({
        image: 'media://identity-abc.png',
      });
      expect(
        await service.migrateInlineImage('el-1', 'alice', 'novel')
      ).toBeNull();

      worldbuilding.getIdentityData.mockResolvedValue({});
      expect(
        await service.migrateInlineImage('el-1', 'alice', 'novel')
      ).toBeNull();

      expect(localStorage.saveMedia).not.toHaveBeenCalled();
      expect(worldbuilding.replaceIdentityImage).not.toHaveBeenCalled();
    });

    it('reports no migration when the image changed in the meantime', async () => {
      worldbuilding.getIdentityData.mockResolvedValue({ image: PNG_DATA_URL });
      worldbuilding.replaceIdentityImage.mockResolvedValue(false);

      expect(
        await service.migrateInlineImage('el-1', 'alice', 'novel')
      ).toBeNull();
    });

    it('two runs on the same image produce the same reference', async () => {
      worldbuilding.getIdentityData.mockResolvedValue({ image: PNG_DATA_URL });

      const first = await service.migrateInlineImage('el-1', 'alice', 'novel');
      const second = await service.migrateInlineImage('el-1', 'alice', 'novel');

      expect(second).toBe(first);
      expect(localStorage.saveMedia).toHaveBeenCalledTimes(1);
    });

    it('swallows storage failures and leaves the element unchanged', async () => {
      worldbuilding.getIdentityData.mockResolvedValue({ image: PNG_DATA_URL });
      localStorage.saveMedia.mockRejectedValue(new Error('quota'));

      expect(
        await service.migrateInlineImage('el-1', 'alice', 'novel')
      ).toBeNull();
      expect(worldbuilding.replaceIdentityImage).not.toHaveBeenCalled();
    });

    it('needs a project', async () => {
      expect(await service.migrateInlineImage('el-1', '', 'novel')).toBeNull();
      expect(worldbuilding.getIdentityData).not.toHaveBeenCalled();
    });
  });

  it('isInlineImage recognises only base64 image data URLs', () => {
    expect(isInlineImage(PNG_DATA_URL)).toBe(true);
    expect(isInlineImage('data:text/html;base64,PGI+')).toBe(false);
    expect(isInlineImage('media://identity-abc.png')).toBe(false);
    expect(isInlineImage('https://example.com/a.png')).toBe(false);
  });
});
