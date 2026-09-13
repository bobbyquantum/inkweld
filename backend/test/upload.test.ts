import { describe, expect, it } from 'bun:test';
import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_MEDIA_UPLOAD_BYTES,
  sanitizeUploadFilename,
} from '../src/utils/upload';

describe('sanitizeUploadFilename', () => {
  it('keeps ordinary filenames intact', () => {
    expect(sanitizeUploadFilename('cover.jpg')).toBe('cover.jpg');
    expect(sanitizeUploadFilename('Chapter 1 (draft) [v2].md')).toBe('Chapter 1 (draft) [v2].md');
  });

  it('keeps only the last path segment for either separator', () => {
    expect(sanitizeUploadFilename('sub/dir/evil.png')).toBe('evil.png');
    expect(sanitizeUploadFilename('..\\..\\evil.png')).toBe('evil.png');
    expect(sanitizeUploadFilename('/absolute/path.png')).toBe('path.png');
  });

  it('never yields a traversal or hidden-file name', () => {
    expect(sanitizeUploadFilename('..')).toBeNull();
    expect(sanitizeUploadFilename('.')).toBeNull();
    expect(sanitizeUploadFilename('')).toBeNull();
    expect(sanitizeUploadFilename('///')).toBeNull();
    expect(sanitizeUploadFilename('.htaccess')).toBe('htaccess');
    expect(sanitizeUploadFilename('a..b.png')).toBe('a.b.png');
  });

  it('replaces characters outside the allow-list and strips control characters', () => {
    expect(sanitizeUploadFilename('we\u0000ird<>:"|?*.png')).toBe('weird_______.png');
  });

  it('truncates very long names but keeps the extension', () => {
    const name = sanitizeUploadFilename('x'.repeat(300) + '.jpeg');
    expect(name?.length).toBeLessThanOrEqual(200);
    expect(name?.endsWith('.jpeg')).toBe(true);
  });
});

describe('upload limits', () => {
  it('lets images be at least as large as validateImage accepts', () => {
    expect(MAX_IMAGE_UPLOAD_BYTES).toBeGreaterThanOrEqual(10 * 1024 * 1024);
  });
  it('allows media larger than images (video, audio)', () => {
    expect(MAX_MEDIA_UPLOAD_BYTES).toBeGreaterThan(MAX_IMAGE_UPLOAD_BYTES);
  });
});
