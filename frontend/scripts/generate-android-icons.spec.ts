import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { __test__ as iconGen } from './generate-android-icons';

const {
  SAFE_ZONE_RATIO,
  FOREGROUND_SIZE,
  MIPMAP_SIZES,
  PRIMARY_COLOR,
  RES_DIR,
  makeForeground,
  makeMipmap,
} = iconGen;

async function readPng(path: string) {
  const buf = readFileSync(path);
  const meta = await sharp(buf).metadata();
  const raw = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { meta, raw };
}

// Find the opaque-bounds of a PNG (pixels with alpha > threshold).
function opaqueBounds(data: Buffer, w: number, h: number, threshold = 16) {
  return colorBounds(data, w, h, (_r, _g, _b, a) => a > threshold);
}

// Find bounds of pixels that differ from a reference color (used for mipmaps
// where the whole canvas is an opaque solid color, so alpha alone can't
// distinguish the logo from the background).
function nonColorBounds(
  data: Buffer,
  w: number,
  h: number,
  refR: number,
  refG: number,
  refB: number,
  tol = 8
) {
  return colorBounds(
    data,
    w,
    h,
    (r, g, b) =>
      Math.abs(r - refR) > tol ||
      Math.abs(g - refG) > tol ||
      Math.abs(b - refB) > tol
  );
}

function colorBounds(
  data: Buffer,
  w: number,
  h: number,
  matches: (r: number, g: number, b: number, a: number) => boolean
) {
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0,
    found = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (matches(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return { minX: w, minY: h, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

describe('generate-android-icons constants', () => {
  it('uses the exact 66/108 Android adaptive-icon safe-zone ratio', () => {
    expect(SAFE_ZONE_RATIO).toBeCloseTo(66 / 108, 10);
  });

  it('targets the 108dp @ 4x foreground size', () => {
    expect(FOREGROUND_SIZE).toBe(432);
  });

  it('covers all five Android density buckets', () => {
    expect(MIPMAP_SIZES.map(m => m.size)).toEqual([48, 72, 96, 144, 192]);
  });

  it('matches the committed primary_color', () => {
    expect(PRIMARY_COLOR).toBe('#006874');
  });
});

describe('makeForeground', () => {
  it('produces a 432x432 transparent PNG with the logo within the safe zone', async () => {
    // Regenerate against the real RES_DIR; the generator is deterministic, so
    // running it here reproduces the committed asset exactly.
    await makeForeground();

    const path = join(RES_DIR, 'drawable', 'ic_launcher_foreground.png');
    expect(existsSync(path)).toBe(true);

    const { meta, raw } = await readPng(path);
    expect(meta.width).toBe(FOREGROUND_SIZE);
    expect(meta.height).toBe(FOREGROUND_SIZE);
    expect(meta.channels).toBe(4);

    const { minX, minY, maxX, maxY } = opaqueBounds(
      raw.data,
      raw.info.width,
      raw.info.height
    );
    // Logo must fit within the 66dp safe zone (66/108 ≈ 0.611).
    expect((maxX - minX) / FOREGROUND_SIZE).toBeLessThanOrEqual(
      SAFE_ZONE_RATIO + 0.01
    );
    expect((maxY - minY) / FOREGROUND_SIZE).toBeLessThanOrEqual(
      SAFE_ZONE_RATIO + 0.01
    );

    // Must have transparent padding on all four sides.
    expect(minX).toBeGreaterThan(0);
    expect(minY).toBeGreaterThan(0);
    expect(maxX).toBeLessThan(FOREGROUND_SIZE - 1);
    expect(maxY).toBeLessThan(FOREGROUND_SIZE - 1);

    // Corner pixel must be transparent (foreground layer).
    expect(raw.data[3]).toBe(0);
  });
});

describe('makeMipmap', () => {
  it('produces both launcher filenames at every density with solid brand background', async () => {
    for (const { folder, size } of MIPMAP_SIZES) {
      await makeMipmap(folder, size);

      for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
        const path = join(RES_DIR, folder, name);
        expect(existsSync(path)).toBe(true);

        const { meta, raw } = await readPng(path);
        expect(meta.width).toBe(size);
        expect(meta.height).toBe(size);
        expect(meta.channels).toBe(4);

        // Corner pixel should be the brand color (opaque #006874).
        const [r, g, b, a] = [
          raw.data[0],
          raw.data[1],
          raw.data[2],
          raw.data[3],
        ];
        expect(a).toBe(255);
        expect(r).toBe(0);
        expect(g).toBe(0x68);
        expect(b).toBe(0x74);

        // Logo must fit within the safe zone (logo = pixels != brand bg).
        const { minX, minY, maxX, maxY } = nonColorBounds(
          raw.data,
          raw.info.width,
          raw.info.height,
          0x00,
          0x68,
          0x74
        );
        expect((maxX - minX) / size).toBeLessThanOrEqual(
          SAFE_ZONE_RATIO + 0.02
        );
        expect((maxY - minY) / size).toBeLessThanOrEqual(
          SAFE_ZONE_RATIO + 0.02
        );
      }
    }
  });
});
