import { describe, it, expect } from 'bun:test';
import { textToProseMirrorXml } from '../src/mcp/tools/mutation.tools';
import { decodeXmlEntities, xmlContentToText, sanitizeFilename } from '../src/utils/xml-utils';
import { escapeHtml } from '../src/routes/document.routes';

describe('textToProseMirrorXml', () => {
  it('should return empty paragraph for whitespace-only input', () => {
    expect(textToProseMirrorXml('')).toBe('<paragraph></paragraph>');
    expect(textToProseMirrorXml('   ')).toBe('<paragraph></paragraph>');
  });

  it('should wrap plain text in paragraph tags', () => {
    expect(textToProseMirrorXml('Hello world')).toBe('<paragraph>Hello world</paragraph>');
  });

  it('should escape XML special characters', () => {
    const result = textToProseMirrorXml('a & b < c > d "e" \'f\'');
    expect(result).toBe(
      '<paragraph>a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;</paragraph>'
    );
  });

  it('should split on double newlines into separate paragraphs', () => {
    const result = textToProseMirrorXml('First paragraph\n\nSecond paragraph');
    expect(result).toBe(
      '<paragraph>First paragraph</paragraph><paragraph>Second paragraph</paragraph>'
    );
  });

  it('should convert single newlines to hard_break elements', () => {
    const result = textToProseMirrorXml('Line 1\nLine 2');
    expect(result).toBe('<paragraph>Line 1<hard_break/>Line 2</paragraph>');
  });

  it('should handle triple+ newlines as paragraph break', () => {
    const result = textToProseMirrorXml('A\n\n\nB');
    expect(result).toBe('<paragraph>A</paragraph><paragraph>B</paragraph>');
  });

  it('should handle mixed paragraphs and line breaks', () => {
    const result = textToProseMirrorXml('Line 1\nLine 2\n\nParagraph 2');
    expect(result).toBe(
      '<paragraph>Line 1<hard_break/>Line 2</paragraph><paragraph>Paragraph 2</paragraph>'
    );
  });
});

describe('decodeXmlEntities', () => {
  it('should decode named XML entities', () => {
    expect(decodeXmlEntities('&amp;')).toBe('&');
    expect(decodeXmlEntities('&lt;')).toBe('<');
    expect(decodeXmlEntities('&gt;')).toBe('>');
    expect(decodeXmlEntities('&quot;')).toBe('"');
    expect(decodeXmlEntities('&apos;')).toBe("'");
  });

  it('should decode decimal numeric references', () => {
    expect(decodeXmlEntities('&#65;')).toBe('A');
    expect(decodeXmlEntities('&#97;')).toBe('a');
    expect(decodeXmlEntities('&#169;')).toBe('\u00A9'); // ©
  });

  it('should decode hex numeric references', () => {
    expect(decodeXmlEntities('&#x41;')).toBe('A');
    expect(decodeXmlEntities('&#x61;')).toBe('a');
    expect(decodeXmlEntities('&#xA9;')).toBe('\u00A9'); // ©
  });

  it('should decode multiple entities in a string', () => {
    expect(decodeXmlEntities('a &amp; b &lt; c')).toBe('a & b < c');
  });

  it('should pass through text without entities unchanged', () => {
    expect(decodeXmlEntities('hello world')).toBe('hello world');
  });

  it('should handle all entity types in one string', () => {
    expect(decodeXmlEntities('&lt;div class=&quot;test&quot;&gt;&#65;&#x42;&lt;/div&gt;')).toBe(
      '<div class="test">AB</div>'
    );
  });
});

describe('xmlContentToText', () => {
  it('should strip all tags and return plain text', () => {
    expect(xmlContentToText('<paragraph>Hello world</paragraph>')).toBe('Hello world');
  });

  it('should convert block-level closing tags to newlines', () => {
    const result = xmlContentToText('<paragraph>First</paragraph><paragraph>Second</paragraph>');
    expect(result).toBe('First\nSecond');
  });

  it('should strip inline tags entirely', () => {
    expect(xmlContentToText('<paragraph>Hello <hard_break/>world</paragraph>')).toBe('Hello world');
  });

  it('should decode HTML entities', () => {
    expect(xmlContentToText('<paragraph>a &amp; b &lt; c &gt; d &quot;e&quot;</paragraph>')).toBe(
      'a & b < c > d "e"'
    );
  });

  it('should decode &#39; entity', () => {
    expect(xmlContentToText('<paragraph>it&#39;s</paragraph>')).toBe("it's");
  });

  it('should handle heading closing tags as newlines', () => {
    const xml = '<heading level="1">Title</heading><paragraph>Body</paragraph>';
    expect(xmlContentToText(xml)).toBe('Title\nBody');
  });

  it('should trim leading and trailing whitespace', () => {
    expect(xmlContentToText('<paragraph>  Hello  </paragraph>')).toBe('Hello');
  });

  it('should return empty string for empty XML', () => {
    expect(xmlContentToText('<paragraph></paragraph>')).toBe('');
  });
});

describe('sanitizeFilename', () => {
  it('should pass through a safe filename unchanged', () => {
    expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
  });

  it('should remove double quotes', () => {
    expect(sanitizeFilename('my "file".pdf')).toBe('my file.pdf');
  });

  it('should remove backslashes', () => {
    expect(sanitizeFilename('path\\file.pdf')).toBe('pathfile.pdf');
  });

  it('should remove carriage returns and newlines', () => {
    expect(sanitizeFilename('file\r\nname.pdf')).toBe('filename.pdf');
  });

  it('should replace non-ASCII characters with underscore', () => {
    expect(sanitizeFilename('café.pdf')).toBe('caf_.pdf');
  });

  it('should replace non-printable ASCII with underscore', () => {
    expect(sanitizeFilename('file\x01name.pdf')).toBe('file_name.pdf');
  });

  it('should handle multiple replaceable characters', () => {
    expect(sanitizeFilename('"bad\nfile\\name".pdf')).toBe('badfilename.pdf');
  });
});

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('should escape angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('should escape all special characters together', () => {
    expect(escapeHtml('<a href="x&y">')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;');
  });

  it('should pass through safe text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('should handle multiple occurrences with replaceAll', () => {
    expect(escapeHtml('a & b & c')).toBe('a &amp; b &amp; c');
    expect(escapeHtml('<<>>')).toBe('&lt;&lt;&gt;&gt;');
  });
});
