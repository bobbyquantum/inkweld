import { describe, expect, it } from 'vitest';

import {
  buildNavTree,
  coreImageExtension,
  dataUrlToBlob,
  detectImageType,
  epubTimestamp,
  escapeXml,
  firstHref,
  isRtlLanguage,
  navTreeDepth,
  normalizeIsbn,
  normalizeLanguage,
  stableUuid,
  textToParagraphs,
} from './epub-utils';

describe('epub-utils', () => {
  describe('escapeXml', () => {
    it('escapes markup characters and drops XML-invalid control characters', () => {
      expect(escapeXml(`a & <b> "c" 'd'\u0000\u0007\u001F`)).toBe(
        'a &amp; &lt;b&gt; &quot;c&quot; &#39;d&#39;'
      );
    });

    it('keeps tabs and newlines', () => {
      expect(escapeXml('a\tb\nc\rd')).toBe('a\tb\nc\rd');
    });
  });

  describe('normalizeLanguage / isRtlLanguage', () => {
    it('accepts BCP 47 tags and normalises underscores', () => {
      expect(normalizeLanguage('en')).toBe('en');
      expect(normalizeLanguage('pt_BR')).toBe('pt-BR');
      expect(normalizeLanguage(' zh-Hant-TW ')).toBe('zh-Hant-TW');
    });

    it('falls back to English for malformed input', () => {
      expect(normalizeLanguage('')).toBe('en');
      expect(normalizeLanguage(undefined)).toBe('en');
      expect(normalizeLanguage('English')).toBe('en');
      expect(normalizeLanguage('en"><x')).toBe('en');
    });

    it('detects right-to-left scripts by primary subtag', () => {
      expect(isRtlLanguage('ar')).toBe(true);
      expect(isRtlLanguage('he-IL')).toBe(true);
      expect(isRtlLanguage('FA')).toBe(true);
      expect(isRtlLanguage('en-US')).toBe(false);
    });
  });

  it('formats dcterms:modified without milliseconds', () => {
    expect(epubTimestamp(new Date('2026-09-26T10:11:12.345Z'))).toBe(
      '2026-09-26T10:11:12Z'
    );
  });

  describe('normalizeIsbn', () => {
    it('accepts ISBN-10 and ISBN-13 with separators', () => {
      expect(normalizeIsbn('978-3-16-148410-0')).toBe('9783161484100');
      expect(normalizeIsbn('0-306-40615-x')).toBe('030640615X');
    });

    it('rejects anything else', () => {
      expect(normalizeIsbn('12345')).toBeNull();
      expect(normalizeIsbn('')).toBeNull();
      expect(normalizeIsbn(undefined)).toBeNull();
    });
  });

  it('derives the same RFC 4122 UUID from the same seed', async () => {
    const a = await stableUuid('seed-1');
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(await stableUuid('seed-1')).toBe(a);
    expect(await stableUuid('seed-2')).not.toBe(a);
  });

  describe('image types', () => {
    const blobOf = (bytes: number[] | string, type = '') =>
      new Blob([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], {
        type,
      });

    it('sniffs the real type from magic bytes', async () => {
      expect(await detectImageType(blobOf([0x89, 0x50, 0x4e, 0x47]))).toBe(
        'image/png'
      );
      expect(await detectImageType(blobOf([0xff, 0xd8, 0xff]))).toBe(
        'image/jpeg'
      );
      expect(await detectImageType(blobOf('GIF89a'))).toBe('image/gif');
      expect(await detectImageType(blobOf('RIFF\0\0\0\0WEBPVP8 '))).toBe(
        'image/webp'
      );
      expect(
        await detectImageType(blobOf('<?xml version="1.0"?><svg xmlns=""/>'))
      ).toBe('image/svg+xml');
    });

    it('falls back to the declared type', async () => {
      expect(await detectImageType(blobOf('????', 'image/jpg'))).toBe(
        'image/jpeg'
      );
      expect(await detectImageType(blobOf('????', 'image/avif'))).toBe(
        'image/avif'
      );
      expect(await detectImageType(blobOf('????', 'text/plain'))).toBeNull();
    });

    it('maps only EPUB core media types to extensions', () => {
      expect(coreImageExtension('image/jpeg')).toBe('jpg');
      expect(coreImageExtension('image/webp')).toBe('webp');
      expect(coreImageExtension('image/avif')).toBeNull();
    });

    it('decodes base64 data URLs', async () => {
      const blob = dataUrlToBlob(`data:image/PNG;base64,${btoa('abc')}`);
      expect(blob?.type).toBe('image/png');
      expect(await blob!.text()).toBe('abc');
      expect(dataUrlToBlob('data:text/html;base64,AAAA')).toBeNull();
      expect(dataUrlToBlob('data:image/png;base64,***')).toBeNull();
    });
  });

  it('turns plain text into escaped paragraphs', () => {
    expect(textToParagraphs('One & two\nline\n\n\n<Three>', 'x')).toBe(
      '<p class="x">One &amp; two<br />line</p>\n<p class="x">&lt;Three&gt;</p>'
    );
    expect(textToParagraphs('   ')).toBe('');
  });

  describe('buildNavTree', () => {
    it('nests entries by level and collapses skipped levels', () => {
      const tree = buildNavTree([
        { title: 'A', href: 'a', level: 0 },
        { title: 'A.1', href: 'a1', level: 2 },
        { title: 'A.1.1', href: 'a11', level: 3 },
        { title: 'B', href: 'b', level: 0 },
      ]);
      expect(tree.map(n => n.title)).toEqual(['A', 'B']);
      expect(tree[0].children[0].title).toBe('A.1');
      expect(tree[0].children[0].depth).toBe(1);
      expect(tree[0].children[0].children[0].depth).toBe(2);
      expect(navTreeDepth(tree)).toBe(3);
    });

    it('drops link-less groups with no children and resolves group targets', () => {
      const tree = buildNavTree([
        { title: 'Empty', level: 0 },
        { title: 'Part', level: 0 },
        { title: 'Ch', href: 'ch', level: 1 },
      ]);
      expect(tree.map(n => n.title)).toEqual(['Part']);
      expect(firstHref(tree[0])).toBe('ch');
    });
  });
});
