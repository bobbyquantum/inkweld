import { describe, expect, it, vi } from 'vitest';

import {
  collectImageSources,
  PdfImageAssets,
  type PreparedImage,
  prepareImageForTypst,
  typstImageWidth,
} from './pdf-image-assets';

const png = (): PreparedImage => ({
  bytes: new Uint8Array([1, 2, 3]),
  ext: 'png',
  width: 800,
  height: 600,
});

describe('typstImageWidth', () => {
  it('sets landscapes full width and taller images narrower', () => {
    expect(typstImageWidth({ path: 'a', width: 1536, height: 1024 })).toBe(
      '100%'
    );
    expect(typstImageWidth({ path: 'a', width: 1024, height: 1024 })).toBe(
      '70%'
    );
    expect(typstImageWidth({ path: 'a', width: 1024, height: 1536 })).toBe(
      '55%'
    );
  });

  it('falls back to a safe width when the size is unknown', () => {
    expect(typstImageWidth({ path: 'a' })).toBe('80%');
  });
});

describe('collectImageSources', () => {
  it('finds image sources in nested content, in order', () => {
    const doc = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Before' },
          { type: 'image', attrs: { src: 'media:one' } },
        ],
      },
      {
        nodeName: 'blockquote',
        children: [{ nodeName: 'image', attrs: { src: 'media:two' } }],
      },
      { type: 'image', attrs: { src: '' } },
    ];
    expect(collectImageSources(doc)).toEqual(['media:one', 'media:two']);
  });
});

describe('prepareImageForTypst', () => {
  it('keeps the original bytes of a type Typst reads when it cannot re-encode', async () => {
    const blob = new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' });
    const prepared = await prepareImageForTypst(blob);
    expect(prepared?.ext).toBe('png');
    expect([...(prepared?.bytes ?? [])]).toEqual([9, 8, 7]);
  });

  it('refuses types Typst cannot read', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/x-unknown' });
    expect(await prepareImageForTypst(blob)).toBeNull();
  });
});

describe('PdfImageAssets', () => {
  it('maps each media image once and returns its virtual path', async () => {
    const loadMedia = vi
      .fn()
      .mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    const mapShadow = vi.fn().mockResolvedValue(undefined);
    const assets = new PdfImageAssets(loadMedia, mapShadow, () =>
      Promise.resolve(png())
    );

    const first = await assets.register('media://portrait.png');
    const again = await assets.register('media://portrait.png');

    expect(first).toEqual({
      path: '/images/img-1.png',
      width: 800,
      height: 600,
    });
    expect(again).toBe(first);
    expect(loadMedia).toHaveBeenCalledTimes(1);
    expect(loadMedia).toHaveBeenCalledWith('portrait');
    expect(mapShadow).toHaveBeenCalledWith('/images/img-1.png', png().bytes);
  });

  it('gives distinct images distinct paths', async () => {
    const assets = new PdfImageAssets(
      () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
      () => Promise.resolve(),
      () => Promise.resolve(png())
    );
    const a = await assets.register('media:a');
    const b = await assets.register('media:b');
    expect(a?.path).not.toBe(b?.path);
  });

  it('resolves to null for missing media, foreign URLs and load errors', async () => {
    const mapShadow = vi.fn();
    const assets = new PdfImageAssets(
      id =>
        id === 'broken'
          ? Promise.reject(new Error('storage error'))
          : Promise.resolve(null),
      mapShadow,
      () => Promise.resolve(png())
    );

    expect(await assets.register('media:missing')).toBeNull();
    expect(await assets.register('media:broken')).toBeNull();
    expect(await assets.register('https://example.com/a.png')).toBeNull();
    expect(await assets.register(undefined)).toBeNull();
    expect(mapShadow).not.toHaveBeenCalled();
  });

  it('skips images that cannot be prepared for Typst', async () => {
    const mapShadow = vi.fn();
    const assets = new PdfImageAssets(
      () => Promise.resolve(new Blob(['x'], { type: 'image/x-unknown' })),
      mapShadow,
      () => Promise.resolve(null)
    );
    expect(await assets.register('media:odd')).toBeNull();
    expect(mapShadow).not.toHaveBeenCalled();
  });
});
