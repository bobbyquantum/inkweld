import { describe, it, expect } from 'bun:test';
import { extractTextFromXmlString } from '../src/mcp/tools/search.tools';

describe('extractTextFromXmlString', () => {
  it('extracts text from a simple paragraph', () => {
    expect(extractTextFromXmlString('<doc><paragraph>Hello world</paragraph></doc>')).toBe(
      'Hello world'
    );
  });

  it('inserts newlines between block-level elements', () => {
    const xml = '<doc><paragraph>One</paragraph><paragraph>Two</paragraph></doc>';
    expect(extractTextFromXmlString(xml)).toBe('One\nTwo');
  });

  it('handles headings, blockquotes, and list items as block boundaries', () => {
    const xml =
      '<doc><heading>Title</heading><blockquote>Quote</blockquote><listItem>Item</listItem></doc>';
    expect(extractTextFromXmlString(xml)).toBe('Title\nQuote\nItem');
  });

  it('strips inline tags without inserting newlines', () => {
    const xml = '<paragraph>Hello <strong>world</strong> and <em>more</em></paragraph>';
    expect(extractTextFromXmlString(xml)).toBe('Hello world and more');
  });

  it('decodes common HTML entities', () => {
    const xml = '<paragraph>&amp;&lt;&gt;&quot;&#39;</paragraph>';
    expect(extractTextFromXmlString(xml)).toBe('&<>"\'');
  });

  it('does not double-unescape nested entities like &amp;lt;', () => {
    // &amp;lt; should become &lt; (not <) because &amp; is decoded last.
    expect(extractTextFromXmlString('<paragraph>&amp;lt;</paragraph>')).toBe('&lt;');
    expect(extractTextFromXmlString('<paragraph>&amp;gt;</paragraph>')).toBe('&gt;');
    expect(extractTextFromXmlString('<paragraph>&amp;quot;</paragraph>')).toBe('&quot;');
    expect(extractTextFromXmlString('<paragraph>&amp;#39;</paragraph>')).toBe('&#39;');
  });

  it('collapses 3+ newlines into 2', () => {
    const xml =
      '<doc><paragraph>A</paragraph><paragraph>B</paragraph><paragraph>C</paragraph></doc>';
    // Each closing paragraph tag adds a newline; the joiner between blocks
    // is just the tag boundary, so we expect "A\nB\nC" with no trailing newline.
    expect(extractTextFromXmlString(xml)).toBe('A\nB\nC');
  });

  // A naive /<[^>]+>/ or /<[^<>]+>/ regex would stop at the ">" inside the
  // quoted title and leave ` b">` in the output. The quote-aware scanner
  // must consume the whole tag.
  it.each<[string, string, string]>([
    [
      'preserves a ">" character inside a quoted attribute (regression)',
      '<link title="a > b">click here</link>',
      'click here',
    ],
    [
      'preserves a "<" character inside a quoted attribute',
      '<link title="a < b">click here</link>',
      'click here',
    ],
    [
      'handles single-quoted attributes containing ">"',
      "<link title='a > b'>click here</link>",
      'click here',
    ],
    [
      'handles multiple attributes with quoted ">" on a self-closing tag',
      '<img alt="arrow -> right" src="x.png"/>Caption',
      'Caption',
    ],
    [
      'handles nested quotes of the other flavor inside an attribute',
      '<link title="say \'hi > bye\'">click</link>',
      'click',
    ],
  ])('%s', (_description, xml, expected) => {
    expect(extractTextFromXmlString(xml)).toBe(expected);
  });

  it('handles an unterminated tag gracefully', () => {
    expect(extractTextFromXmlString('<paragraph>Hello</paragraph><oops')).toBe('Hello');
  });

  it('returns empty string for empty input', () => {
    expect(extractTextFromXmlString('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(extractTextFromXmlString('just plain text')).toBe('just plain text');
  });
});
