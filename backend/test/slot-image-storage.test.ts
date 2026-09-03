import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { config } from '../src/config/env';
import { FileStorageService } from '../src/services/file-storage.service';
import {
  MAX_BACKGROUND_UPLOAD_BYTES,
  imageService,
  sniffImageType,
} from '../src/services/image.service';

const TEST_DATA_DIR = path.resolve(config.dataPath);

/** Minimal valid file headers, enough for magic-byte sniffing. */
const HEADERS = {
  jpeg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]),
  png: Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16),
  ]),
  gif: Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(16)]),
  webp: Buffer.concat([
    Buffer.from('RIFF', 'latin1'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('WEBP', 'latin1'),
    Buffer.alloc(16),
  ]),
  avif: Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from('ftyp', 'latin1'),
    Buffer.from('avif', 'latin1'),
    Buffer.alloc(16),
  ]),
};

describe('sniffImageType', () => {
  it.each(Object.entries(HEADERS))('identifies %s from its magic bytes', (kind, buffer) => {
    expect(sniffImageType(buffer)).toBe(`image/${kind}`);
  });

  it('refuses SVG — it is markup, not a raster image', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(Buffer.from('<?xml version="1.0"?><svg><script/></svg>'))).toBeNull();
  });

  it('refuses non-image payloads', () => {
    expect(sniffImageType(Buffer.from('#!/bin/sh\necho hi\n'.padEnd(64, ' ')))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.7'.padEnd(64, ' ')))).toBeNull();
  });

  it('refuses a buffer too short to identify', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  it('does not mistake a non-avif ISO-BMFF file for an image', () => {
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x20]),
      Buffer.from('ftyp', 'latin1'),
      Buffer.from('isom', 'latin1'),
      Buffer.alloc(16),
    ]);
    expect(sniffImageType(mp4)).toBeNull();
  });
});

describe('imageService.validateBackground', () => {
  it('rejects an oversized upload', async () => {
    const oversized = Buffer.alloc(MAX_BACKGROUND_UPLOAD_BYTES + 1);
    const result = await imageService.validateBackground(oversized);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('too large');
  });

  it('rejects SVG', async () => {
    const result = await imageService.validateBackground(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')
    );

    expect(result.valid).toBe(false);
  });

  it('rejects a payload that only claims to be an image', async () => {
    const result = await imageService.validateBackground(
      Buffer.from('not an image at all, just text'.padEnd(64, ' '))
    );

    expect(result.valid).toBe(false);
  });
});

describe('imageService.processBackground', () => {
  /** A real 4x4 PNG, so sharp has something valid to decode. */
  async function tinyPng(): Promise<Buffer> {
    const sharp = (await import('sharp')).default;
    return await sharp({
      create: { width: 4, height: 4, channels: 3, background: '#0d6b74' },
    })
      .png()
      .toBuffer();
  }

  it('transcodes to webp', async () => {
    const result = await imageService.processBackground(await tinyPng());

    expect(result.contentType).toBe('image/webp');
    expect(sniffImageType(result.data)).toBe('image/webp');
  });

  it('caps large images without enlarging small ones', async () => {
    const sharp = (await import('sharp')).default;

    const small = await imageService.processBackground(await tinyPng());
    expect(await sharp(small.data).metadata()).toMatchObject({ width: 4, height: 4 });

    const huge = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    const capped = await imageService.processBackground(huge);
    const metadata = await sharp(capped.data).metadata();

    expect(metadata.width).toBeLessThanOrEqual(2560);
    expect(metadata.height).toBeLessThanOrEqual(1440);
  });
});

describe('FileStorageService slot images', () => {
  let service: FileStorageService;
  const key = `__test_slot_${process.pid}`;

  beforeEach(() => {
    service = new FileStorageService();
  });

  afterEach(async () => {
    for (const namespace of ['branding', 'backgrounds'] as const) {
      await service.deleteSlotImage(namespace, key).catch(() => {});
    }
  });

  it('round-trips an image with its content type', async () => {
    await service.saveSlotImage('branding', key, HEADERS.webp, 'image/webp');

    const stored = await service.getSlotImage('branding', key);
    expect(stored?.contentType).toBe('image/webp');
    expect(Buffer.from(stored!.data).equals(HEADERS.webp)).toBe(true);
    expect(await service.hasSlotImage('branding', key)).toBe(true);
  });

  it('reports nothing for an empty slot', async () => {
    expect(await service.getSlotImage('branding', key)).toBeNull();
    expect(await service.hasSlotImage('branding', key)).toBe(false);
  });

  it('keeps namespaces separate', async () => {
    await service.saveSlotImage('branding', key, HEADERS.png, 'image/png');

    expect(await service.hasSlotImage('branding', key)).toBe(true);
    expect(await service.hasSlotImage('backgrounds', key)).toBe(false);
  });

  it('replaces a previous variant rather than leaving two files behind', async () => {
    await service.saveSlotImage('branding', key, HEADERS.png, 'image/png');
    await service.saveSlotImage('branding', key, HEADERS.webp, 'image/webp');

    const stored = await service.getSlotImage('branding', key);
    expect(stored?.contentType).toBe('image/webp');

    // The .png must be gone: two files for one slot would make reads depend on
    // the probe order rather than on what was last written.
    const files = await fs.readdir(path.join(TEST_DATA_DIR, 'branding'));
    expect(files.filter((name) => name.startsWith(key))).toEqual([`${key}.webp`]);
  });

  it('deletes idempotently', async () => {
    await service.saveSlotImage('branding', key, HEADERS.png, 'image/png');
    await service.deleteSlotImage('branding', key);
    await service.deleteSlotImage('branding', key);

    expect(await service.hasSlotImage('branding', key)).toBe(false);
  });

  it('refuses a slot key that would escape the namespace directory', async () => {
    for (const hostile of ['../evil', 'a/b', 'a\\b', '..']) {
      await expect(
        service.saveSlotImage('branding', hostile, HEADERS.png, 'image/png')
      ).rejects.toThrow();
    }
  });

  it('stores an unexpected content type under .bin rather than mislabelling it', async () => {
    await service.saveSlotImage('branding', key, HEADERS.png, 'application/octet-stream');

    const files = await fs.readdir(path.join(TEST_DATA_DIR, 'branding'));
    expect(files.filter((name) => name.startsWith(key))).toEqual([`${key}.bin`]);
    // .bin is outside the probe list, so the slot reads back as empty rather
    // than as an image the browser would fail to decode.
    expect(await service.getSlotImage('branding', key)).toBeNull();

    await fs.rm(path.join(TEST_DATA_DIR, 'branding', `${key}.bin`), { force: true });
  });
});
