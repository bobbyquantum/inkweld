import { describe, expect, it } from 'vitest';

import {
  buildMediaReference,
  isSafeMediaFilename,
  mediaFilePath,
  mediaIdFromReference,
  mediaReferenceFilename,
  projectMediaPath,
  safeMediaReferenceFilename,
} from './media-reference';

/** Filenames the server, the MCP tools and this app create. */
const VALID_FILENAMES = [
  'cover.jpg',
  'cover-1711638400000.jpg',
  'img-0f8fad5b-d9cb-469f-a165-70867728950e.png',
  'identity-0123456789abcdef0123456789abcdef.webp',
  'generated-1711638400000-0.png',
  'upload-1711638400000.png',
  'photo.v2.png',
  'My Picture (1) [final].png',
  'noextension',
  '50%off.png',
  'café.png',
];

/** Filenames that are not a single plain path segment. */
const INVALID_FILENAMES: Array<[string, string]> = [
  ['empty', ''],
  ['the current-directory segment', '.'],
  ['the parent-directory segment', '..'],
  ['a slash', 'a/b.png'],
  ['a parent segment', '../x.png'],
  ['a leading slash', '/img.png'],
  ['a backslash', '..\\x.png'],
  ['an encoded dot', '%2e%2e'],
  ['an upper-case encoded dot', '%2E%2E'],
  ['an encoded slash', '..%2fx.png'],
  ['an encoded backslash', '..%5Cx.png'],
  ['a double-encoded dot', '%252e%252e'],
  ['a query', 'img.png?download=1'],
  ['a fragment', 'img.png#top'],
  ['a tab', '.\t.'],
  ['a newline', 'img\n.png'],
  ['a NUL character', 'img\u0000.png'],
  ['a DEL character', 'img\u007f.png'],
];

describe('media-reference utils', () => {
  describe('isSafeMediaFilename', () => {
    it.each(VALID_FILENAMES)('accepts %j', filename => {
      expect(isSafeMediaFilename(filename)).toBe(true);
    });

    it.each(INVALID_FILENAMES)('rejects a name with %s', (_what, filename) => {
      expect(isSafeMediaFilename(filename)).toBe(false);
    });

    it('accepts a reference made by buildMediaReference', () => {
      const reference = buildMediaReference({
        mediaId: 'upload-123',
        filename: 'sunset.png',
      });
      expect(isSafeMediaFilename(mediaReferenceFilename(reference))).toBe(true);
    });

    // Each row is wrapped, since it.each spreads array rows into arguments.
    it.each([[['..']], [['a.png']], [null], [undefined], [42]])(
      'rejects a value that is not a string: %j',
      (value: unknown) => {
        expect(isSafeMediaFilename(value)).toBe(false);
      }
    );
  });

  describe('safeMediaReferenceFilename', () => {
    it('returns the filename of a valid reference', () => {
      expect(safeMediaReferenceFilename('media://cover.png')).toBe('cover.png');
    });

    it.each(INVALID_FILENAMES)(
      'returns null for a reference with %s',
      (_what, filename) => {
        expect(safeMediaReferenceFilename(`media://${filename}`)).toBeNull();
      }
    );

    it('returns null for anything but a media:// reference', () => {
      expect(
        safeMediaReferenceFilename('https://example.com/a.png')
      ).toBeNull();
      expect(safeMediaReferenceFilename('media:img-1')).toBeNull();
      expect(safeMediaReferenceFilename('cover.png')).toBeNull();
    });

    it.each([[['media://a.png']], [null], [undefined], [42]])(
      'returns null for a value that is not a string: %j',
      (value: unknown) => {
        expect(safeMediaReferenceFilename(value)).toBeNull();
      }
    );
  });

  describe('media paths', () => {
    it('builds the project media path', () => {
      expect(projectMediaPath('alice', 'my-novel')).toBe(
        '/api/v1/media/alice/my-novel'
      );
      expect(mediaFilePath('alice', 'my-novel', 'cover.jpg')).toBe(
        '/api/v1/media/alice/my-novel/cover.jpg'
      );
    });

    it.each(VALID_FILENAMES)(
      'requests %j inside the project media path',
      filename => {
        const url = new URL(
          `https://inkweld.test${mediaFilePath('alice', 'my-novel', filename)}`
        );
        expect(url.pathname.split('/').slice(0, 6)).toEqual([
          '',
          'api',
          'v1',
          'media',
          'alice',
          'my-novel',
        ]);
        expect(url.pathname.split('/')).toHaveLength(7);
        expect(decodeURIComponent(url.pathname.split('/')[6])).toBe(filename);
        expect(url.search).toBe('');
        expect(url.hash).toBe('');
      }
    );

    it('encodes a filename that would leave its segment', () => {
      const url = new URL(
        `https://inkweld.test${mediaFilePath('alice', 'my-novel', '../x.png')}`
      );
      expect(url.pathname).toBe('/api/v1/media/alice/my-novel/..%2Fx.png');
    });
  });

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
