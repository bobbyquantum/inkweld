import { describe, expect, it } from 'vitest';

import { coverTimestamp, resolveMediaType } from './archive-media';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = new TextEncoder().encode('%PDF-1.7\n');

function entry(
  mimeType: string,
  archivePath = 'media/file',
  filename?: string
) {
  return { mimeType, archivePath, filename };
}

describe('resolveMediaType', () => {
  it('uses the recorded type, normalised', async () => {
    const blob = new Blob([PNG]);
    expect(await resolveMediaType(entry('image/png'), blob)).toBe('image/png');
    expect(await resolveMediaType(entry('Image/JPG; q=1'), blob)).toBe(
      'image/jpeg'
    );
  });

  it('sniffs images and PDFs when the archive has no usable type', async () => {
    expect(
      await resolveMediaType(entry('application/octet-stream'), new Blob([PNG]))
    ).toBe('image/png');
    expect(await resolveMediaType(entry(''), new Blob([PDF]))).toBe(
      'application/pdf'
    );
  });

  it('falls back to the archive path, then the original filename', async () => {
    const blob = new Blob(['????']);
    expect(await resolveMediaType(entry('', 'media/a.GIF'), blob)).toBe(
      'image/gif'
    );
    expect(await resolveMediaType(entry('', 'media/a', 'scan.pdf'), blob)).toBe(
      'application/pdf'
    );
    expect(await resolveMediaType(entry('', 'media/a.bin'), blob)).toBe(
      'application/octet-stream'
    );
  });
});

describe('coverTimestamp', () => {
  it('orders timestamped covers after untimestamped ones', () => {
    expect(coverTimestamp('cover-1700000000000')).toBe(1700000000000);
    expect(coverTimestamp('cover')).toBe(0);
    expect(coverTimestamp('cover-the-drowned-lantern')).toBe(0);
  });

  it('returns null for media that is not a cover', () => {
    expect(coverTimestamp('img-1')).toBeNull();
    expect(coverTimestamp('covers')).toBeNull();
  });
});
