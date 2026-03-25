import { describe, it, expect } from 'bun:test';
import { decodeXmlEntities } from '../src/utils/xml-utils';

describe('decodeXmlEntities', () => {
  it('should decode named entities', () => {
    expect(decodeXmlEntities('&amp;&lt;&gt;&quot;&apos;')).toBe('&<>"\'');
  });

  it('should decode valid decimal numeric entities', () => {
    expect(decodeXmlEntities('&#65;&#66;')).toBe('AB');
  });

  it('should decode valid hex numeric entities', () => {
    expect(decodeXmlEntities('&#x41;&#x42;')).toBe('AB');
  });

  it('should decode tab, newline, and carriage return entities', () => {
    expect(decodeXmlEntities('&#9;&#10;&#13;')).toBe('\t\n\r');
    expect(decodeXmlEntities('&#x9;&#xA;&#xD;')).toBe('\t\n\r');
  });

  it('should preserve &#0; (null is not valid XML)', () => {
    expect(decodeXmlEntities('&#0;')).toBe('&#0;');
    expect(decodeXmlEntities('&#x0;')).toBe('&#x0;');
  });

  it('should preserve control characters outside 0x9/0xA/0xD (e.g. &#1; through &#8;)', () => {
    expect(decodeXmlEntities('&#1;')).toBe('&#1;');
    expect(decodeXmlEntities('&#8;')).toBe('&#8;');
    expect(decodeXmlEntities('&#x1;')).toBe('&#x1;');
  });

  it('should preserve surrogate code points (&#xD800;)', () => {
    expect(decodeXmlEntities('&#xD800;')).toBe('&#xD800;');
    expect(decodeXmlEntities('&#xDFFF;')).toBe('&#xDFFF;');
    expect(decodeXmlEntities('&#55296;')).toBe('&#55296;'); // 0xD800 in decimal
  });

  it('should preserve non-character &#xFFFE; and &#xFFFF;', () => {
    expect(decodeXmlEntities('&#xFFFE;')).toBe('&#xFFFE;');
    expect(decodeXmlEntities('&#xFFFF;')).toBe('&#xFFFF;');
    expect(decodeXmlEntities('&#65534;')).toBe('&#65534;'); // 0xFFFE in decimal
  });

  it('should decode valid high code points (supplementary planes)', () => {
    // U+10000 LINEAR B SYLLABLE B008 A
    expect(decodeXmlEntities('&#x10000;')).toBe('\u{10000}');
    expect(decodeXmlEntities('&#65536;')).toBe('\u{10000}');
  });

  it('should preserve code points above 0x10FFFF', () => {
    expect(decodeXmlEntities('&#x110000;')).toBe('&#x110000;');
    expect(decodeXmlEntities('&#1114112;')).toBe('&#1114112;'); // 0x110000 in decimal
  });

  it('should handle mixed valid and invalid entities in the same string', () => {
    expect(decodeXmlEntities('Hello &#65; &#0; &#xD800; World')).toBe(
      'Hello A &#0; &#xD800; World'
    );
  });
});
