import { describe, expect, it } from 'vitest';

import {
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
});
