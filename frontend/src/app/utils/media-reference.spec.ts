import { describe, expect, it } from 'vitest';

import {
  buildMediaReference,
  mediaIdFromReference,
  mediaReferenceFilename,
} from './media-reference';

describe('media-reference utils', () => {
  describe('mediaReferenceFilename', () => {
    it('should strip the media:// prefix', () => {
      expect(mediaReferenceFilename('media://cover.png')).toBe('cover.png');
    });

    it('should return non-media references unchanged', () => {
      expect(mediaReferenceFilename('data:image/png;base64,abc')).toBe(
        'data:image/png;base64,abc'
      );
    });
  });

  describe('mediaIdFromReference', () => {
    it('should strip the prefix and extension', () => {
      expect(mediaIdFromReference('media://cover.png')).toBe('cover');
    });

    it('should keep a name without extension', () => {
      expect(mediaIdFromReference('media://cover')).toBe('cover');
    });

    it('should keep multiple dots in the id', () => {
      expect(mediaIdFromReference('media://photo.v2.png')).toBe('photo.v2');
    });
  });

  describe('buildMediaReference', () => {
    it('should build a reference from the mediaId and filename extension', () => {
      const ref = buildMediaReference({
        mediaId: 'upload-123',
        filename: 'sunset.png',
        mimeType: 'image/png',
      });
      expect(ref).toBe('media://upload-123.png');
      // Round-trips: mediaId matches and filename is server-resolvable.
      expect(mediaIdFromReference(ref)).toBe('upload-123');
      expect(mediaReferenceFilename(ref)).toBe('upload-123.png');
    });

    it('should fall back to the MIME type when there is no filename', () => {
      const ref = buildMediaReference({
        mediaId: 'generated-9',
        filename: 'ai-generated-9.png',
        mimeType: 'image/png',
      });
      expect(ref).toBe('media://generated-9.png');
    });

    it('should default to a safe extension for unknown types', () => {
      const ref = buildMediaReference({ mediaId: 'thing' });
      expect(mediaIdFromReference(ref)).toBe('thing');
      expect(mediaReferenceFilename(ref)).toBe('thing.png');
    });
  });
});
