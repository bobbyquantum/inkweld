/**
 * Reading an image's pixel size from its header: file size says little about
 * what an image takes once decoded, and Workers have no sharp to ask.
 */
import { describe, it, expect } from 'bun:test';
import sharp from 'sharp';
import { readImageSize } from '../src/services/image.service';

const pixels = (format: 'png' | 'jpeg' | 'gif', options: object = {}) =>
  sharp({ create: { width: 30, height: 20, channels: 3, background: '#336699' } })
    [format](options)
    .toBuffer();

describe('readImageSize', () => {
  it('reads a PNG', async () => {
    expect(readImageSize(await pixels('png'), 'image/png')).toEqual({ width: 30, height: 20 });
  });

  it('reads a GIF', async () => {
    expect(readImageSize(await pixels('gif'), 'image/gif')).toEqual({ width: 30, height: 20 });
  });

  it('reads a JPEG', async () => {
    expect(readImageSize(await pixels('jpeg'), 'image/jpeg')).toEqual({ width: 30, height: 20 });
  });

  it('reads a progressive JPEG', async () => {
    const jpeg = await pixels('jpeg', { progressive: true });
    expect(readImageSize(jpeg, 'image/jpeg')).toEqual({ width: 30, height: 20 });
  });

  it('finds a JPEG frame after other segments and padding', async () => {
    const jpeg = await pixels('jpeg');
    const comment = Buffer.from([0xff, 0xfe, 0x00, 0x06, 0xff, 0xc0, 0xff, 0xc0]);
    const padded = Buffer.concat([
      jpeg.subarray(0, 2),
      comment,
      Buffer.from([0xff, 0xff]),
      jpeg.subarray(2),
    ]);
    expect(readImageSize(padded, 'image/jpeg')).toEqual({ width: 30, height: 20 });
  });

  it('does not take a table segment for the frame', () => {
    const huffmanOnly = Buffer.from([
      0xff, 0xd8, 0xff, 0xc4, 0x00, 0x06, 0x7f, 0xff, 0x7f, 0xff, 0xff, 0xd9,
    ]);
    expect(readImageSize(huffmanOnly, 'image/jpeg')).toBeNull();
  });

  it('has no size for a file cut short', async () => {
    const png = await pixels('png');
    expect(readImageSize(png.subarray(0, 20), 'image/png')).toBeNull();
    const gif = await pixels('gif');
    expect(readImageSize(gif.subarray(0, 8), 'image/gif')).toBeNull();
    const jpeg = await pixels('jpeg');
    expect(readImageSize(jpeg.subarray(0, 6), 'image/jpeg')).toBeNull();
  });

  it('has no size for an image with no pixels', async () => {
    const png = Buffer.from(await pixels('png'));
    png.writeUInt32BE(0, 16);
    expect(readImageSize(png, 'image/png')).toBeNull();
  });

  it('has no size for what is not a JPEG past its first bytes', () => {
    const noise = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(readImageSize(noise, 'image/jpeg')).toBeNull();
  });

  it('has none for a type it does not read', async () => {
    expect(readImageSize(await pixels('png'), 'image/webp')).toBeNull();
  });
});
