import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PUBLISH_IMAGE_MAX_SIDE,
  shrinkImageToJpeg,
} from './publish-image-shrink';

describe('shrinkImageToJpeg', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null where the browser cannot re-encode images', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const blob = new Blob(['x'], { type: 'image/png' });
    expect(await shrinkImageToJpeg(blob)).toBeNull();
  });

  it('scales the longest side down and keeps the aspect ratio', async () => {
    const sizes: number[][] = [];
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 3200, height: 1600, close: vi.fn() })
    );
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(width: number, height: number) {
          sizes.push([width, height]);
        }
        getContext() {
          return { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
        }
        convertToBlob(options: { type: string }) {
          return Promise.resolve(new Blob(['j'], { type: options.type }));
        }
      }
    );

    const shrunk = await shrinkImageToJpeg(
      new Blob(['x'], { type: 'image/png' })
    );

    expect(shrunk?.width).toBe(PUBLISH_IMAGE_MAX_SIDE);
    expect(shrunk?.height).toBe(PUBLISH_IMAGE_MAX_SIDE / 2);
    expect(shrunk?.blob.type).toBe('image/jpeg');
    expect(sizes).toEqual([
      [PUBLISH_IMAGE_MAX_SIDE, PUBLISH_IMAGE_MAX_SIDE / 2],
    ]);
  });

  it('leaves SVG alone', async () => {
    const svg = new Blob(['<svg/>'], { type: 'image/svg+xml' });
    expect(await shrinkImageToJpeg(svg)).toBeNull();
  });
});
