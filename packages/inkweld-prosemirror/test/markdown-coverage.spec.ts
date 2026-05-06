/**
 * Supplementary tests targeting branches that the main markdown.spec.ts
 * doesn't reach — pushes coverage of `markdown-to-xml.ts` and
 * `xml-to-markdown.ts` past the package thresholds.
 */
import { describe, expect, it } from 'vitest';

import { markdownToXml, xmlToMarkdown } from '../src/markdown';

// ---------------------------------------------------------------------------
// markdownToXml — branch / edge coverage
// ---------------------------------------------------------------------------

describe('markdownToXml — block edge cases', () => {
  it('normalises CRLF and CR line endings to LF', () => {
    expect(markdownToXml('a\r\nb\rc')).toContain('<paragraph>');
  });

  it('parses indented blockquotes (up to 3 spaces) and lazy blank-line continuation', () => {
    const md = '   > line one\n   > line two\n   >\n   > after blank';
    const xml = markdownToXml(md);
    expect(xml.startsWith('<blockquote>')).toBe(true);
    expect(xml).toContain('line one');
    expect(xml).toContain('after blank');
  });

  it('terminates a blockquote on a non-blank, non-quote line', () => {
    const md = '> quoted\nplain text';
    const xml = markdownToXml(md);
    expect(xml).toContain('<blockquote>');
    expect(xml).toContain('<paragraph>plain text</paragraph>');
  });

  it('supports bullet markers `+` and `*` in addition to `-`', () => {
    expect(markdownToXml('+ a\n* b')).toContain('<bullet_list>');
  });

  it('parses ordered lists with `)` marker and a custom start index', () => {
    const xml = markdownToXml('5) first\n6) second');
    expect(xml).toContain('<ordered_list order="5">');
  });

  it('preserves blank-line separated continuation indented under a list item', () => {
    const md = '- item\n\n  continuation';
    const xml = markdownToXml(md);
    expect(xml).toContain('<list_item>');
    expect(xml).toContain('continuation');
  });

  it('terminates a list at an unindented next line after a blank', () => {
    const md = '- item\n\nnext paragraph';
    const xml = markdownToXml(md);
    expect(xml).toContain('<list_item>');
    expect(xml).toContain('<paragraph>next paragraph</paragraph>');
  });

  it('handles tab-indented continuation in list items', () => {
    const md = '- item\n\n\tindented';
    const xml = markdownToXml(md);
    expect(xml).toContain('indented');
  });

  it('parses setext h2 with --- underline', () => {
    expect(markdownToXml('Title\n---')).toContain('<heading level="2">Title</heading>');
  });

  it('parses setext h1 with === underline', () => {
    expect(markdownToXml('Title\n===')).toContain('<heading level="1">Title</heading>');
  });

  it('does not treat trailing # in ATX headings as content', () => {
    expect(markdownToXml('# Title ##')).toContain('<heading level="1">Title</heading>');
  });
});

describe('markdownToXml — inline edge cases', () => {
  it('honours backslash-escapable characters', () => {
    const xml = markdownToXml(String.raw`\*not emphasis\*`);
    expect(xml).toContain('*not emphasis*');
    expect(xml).not.toContain('<em>');
  });

  it('parses backslash + newline as a hard break', () => {
    const xml = markdownToXml('one\\\ntwo');
    expect(xml).toContain('<hard_break/>');
  });

  it('parses inline images with optional title', () => {
    const xml = markdownToXml('![alt](src.png "the title")');
    expect(xml).toContain('<image');
    expect(xml).toContain('src="src.png"');
    expect(xml).toContain('alt="alt"');
    expect(xml).toContain('title="the title"');
  });

  it('parses inline images without title', () => {
    const xml = markdownToXml('![alt](src.png)');
    expect(xml).toContain('src="src.png"');
    expect(xml).not.toContain('title=');
  });

  it('parses links with titles', () => {
    const xml = markdownToXml('[click](https://x.com "Ex")');
    expect(xml).toContain('href="https://x.com"');
    expect(xml).toContain('title="Ex"');
  });

  it('parses single-quoted link titles', () => {
    const xml = markdownToXml(`[click](https://x.com 'Ex')`);
    expect(xml).toContain('title="Ex"');
  });

  it('parses inline code containing backticks via longer fence', () => {
    const xml = markdownToXml('a ``co`de`` end');
    expect(xml).toContain('co`de');
    expect(xml).toContain('<code>');
  });

  it('strips a single leading + trailing space from inline code per CommonMark', () => {
    const xml = markdownToXml('a ` code ` end');
    // The inner space-strip leaves "code" — assert text appears unwrapped.
    expect(xml).toMatch(/<code>code<\/code>/);
  });

  it('parses ~~strikethrough~~', () => {
    expect(markdownToXml('~~gone~~')).toContain('<s>');
  });

  it('passes through inline <br/>', () => {
    expect(markdownToXml('a<br/>b')).toContain('<hard_break/>');
  });

  it('passes through inline HTML tags as marks', () => {
    const xml = markdownToXml('a<u>under</u>b');
    expect(xml).toContain('<u>under</u>');
  });

  it('decodes project-scoped inkweld:// URIs into elementRef nodes', () => {
    const xml = markdownToXml('[Foo](inkweld://alice/my-novel/element/e1?type=item)');
    expect(xml).toContain('<elementRef');
    expect(xml).toContain('elementId="e1"');
    // The third path segment ("element") is present in the URL → decoder
    // treats segment[3] as the element id.
  });

  it('decodes inkweld:// URIs with query parameters', () => {
    const xml = markdownToXml(
      '[Foo](inkweld://element/e1?elementType=item&relationshipNote=hi)'
    );
    expect(xml).toContain('elementType="item"');
    expect(xml).toContain('relationshipNote="hi"');
  });

  it('falls back to a plain link when the inkweld:// URI is unparseable', () => {
    const xml = markdownToXml('[Foo](inkweld://nope/)');
    // No element id → plain link mark, not an elementRef.
    expect(xml).not.toContain('<elementRef');
  });

  it('escapes markdown text containing < and & without producing invalid XML', () => {
    const xml = markdownToXml('a < b & c');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&amp;');
  });
});

// ---------------------------------------------------------------------------
// xmlToMarkdown — branch / edge coverage
// ---------------------------------------------------------------------------

describe('xmlToMarkdown — element / mark coverage', () => {
  it('renders inline images with a title', () => {
    const md = xmlToMarkdown(
      '<paragraph><image src="a.png" alt="alt" title="t"/></paragraph>'
    );
    expect(md).toBe('![alt](a.png "t")');
  });

  it('renders inline images without title', () => {
    const md = xmlToMarkdown('<paragraph><image src="a.png" alt="alt"/></paragraph>');
    expect(md).toBe('![alt](a.png)');
  });

  it('omits image entirely when src is empty', () => {
    const md = xmlToMarkdown('<paragraph><image src="" alt="x"/></paragraph>');
    expect(md).toBe('');
  });

  it('renders <br/> as a hard break', () => {
    const md = xmlToMarkdown('<paragraph>a<hard_break/>b</paragraph>');
    expect(md).toContain('  \n');
  });

  it('renders block-level images at the document root', () => {
    expect(xmlToMarkdown('<image src="a.png" alt=""/>')).toBe('![](a.png)');
  });

  it('renders the camelCase node names (bulletList, orderedList, codeBlock, hardBreak, horizontalRule)', () => {
    expect(xmlToMarkdown('<bulletList><list_item><paragraph>a</paragraph></list_item></bulletList>'))
      .toContain('- a');
    expect(xmlToMarkdown('<orderedList><list_item><paragraph>a</paragraph></list_item></orderedList>'))
      .toContain('1. a');
    expect(xmlToMarkdown('<codeBlock>x</codeBlock>')).toContain('```');
    expect(xmlToMarkdown('<horizontalRule/>')).toBe('---');
    expect(xmlToMarkdown('<hr/>')).toBe('---');
  });

  it('renders elementRef using the default bare URI encoder', () => {
    const md = xmlToMarkdown(
      '<paragraph><elementRef elementId="abc" displayText="Foo"/></paragraph>'
    );
    expect(md).toBe('[Foo](inkweld://element/abc)');
  });

  it('uses originalName / elementId fallback when displayText is missing', () => {
    const md = xmlToMarkdown(
      '<paragraph><elementRef elementId="abc" originalName="Bar"/></paragraph>'
    );
    expect(md).toBe('[Bar](inkweld://element/abc)');
  });

  it('renders a secureLink inline element', () => {
    const md = xmlToMarkdown(
      '<paragraph><secureLink href="https://x.com" displayText="Link"/></paragraph>'
    );
    expect(md).toBe('[Link](https://x.com)');
  });

  it('preserves underline / sup / sub marks as inline HTML', () => {
    const md = xmlToMarkdown('<paragraph><u>x</u> <sup>y</sup> <sub>z</sub></paragraph>');
    expect(md).toContain('<u>x</u>');
    expect(md).toContain('<sup>y</sup>');
    expect(md).toContain('<sub>z</sub>');
  });

  it('renders links with a title', () => {
    const md = xmlToMarkdown(
      '<paragraph><a href="https://x.com" title="t">click</a></paragraph>'
    );
    expect(md).toBe('[click](https://x.com "t")');
  });

  it('renders inline code with backtick-aware fencing', () => {
    const md = xmlToMarkdown('<paragraph><code>a `b` c</code></paragraph>');
    // Outer fence must be longer than any inner backtick run.
    expect(md).toMatch(/``[^`]/);
  });

  it('treats free-floating block-level text as its own paragraph', () => {
    expect(xmlToMarkdown('hello')).toBe('hello');
  });

  it('renders an unknown block by falling back to inline rendering', () => {
    const md = xmlToMarkdown('<unknownBlock>inner</unknownBlock>');
    expect(md).toContain('inner');
  });

  it('returns empty string for an unknown block with no children', () => {
    expect(xmlToMarkdown('<unknownBlock/>')).toBe('');
  });

  it('clamps heading levels to the 1–6 range', () => {
    expect(xmlToMarkdown('<heading level="9">x</heading>')).toBe('###### x');
    expect(xmlToMarkdown('<heading level="0">x</heading>')).toBe('# x');
  });

  it('escapes leading list / heading / blockquote markers in plain text', () => {
    expect(xmlToMarkdown('<paragraph># not a heading</paragraph>')).toBe(
      String.raw`\# not a heading`
    );
    expect(xmlToMarkdown('<paragraph>1. not a list</paragraph>')).toBe(
      String.raw`1\. not a list`
    );
    expect(xmlToMarkdown('<paragraph>* not a list</paragraph>')).toBe(
      String.raw`\* not a list`
    );
  });

  it('escapes brackets in body text', () => {
    expect(xmlToMarkdown('<paragraph>see [docs]</paragraph>')).toBe(
      String.raw`see \[docs\]`
    );
  });

  it('preserves lossy mark attribute values that are objects', () => {
    const md = xmlToMarkdown(
      '<paragraph><span data-mark="custom" payload="{&quot;a&quot;:1}">x</span></paragraph>'
    );
    expect(md).toContain('data-mark="custom"');
    expect(md).toContain('payload=');
  });
});

describe('xmlToMarkdown + markdownToXml — round-trip extras', () => {
  it('round-trips a horizontal rule', () => {
    const md = '---';
    expect(xmlToMarkdown(markdownToXml(md))).toBe(md);
  });

  it('round-trips an image with title', () => {
    const md = '![alt](src.png "t")';
    expect(xmlToMarkdown(markdownToXml(md))).toBe(md);
  });

  it('round-trips a hard break inside a paragraph', () => {
    const md = 'a  \nb';
    const xml = markdownToXml(md);
    expect(xml).toContain('<hard_break/>');
    expect(xmlToMarkdown(xml).replace(/\s+$/, '')).toMatch(/a {2}\nb/);
  });

  // -------------------------------------------------------------------------
  // CodeRabbit follow-up regressions (PR #1068, 2026-05-06 review)
  // -------------------------------------------------------------------------

  it('does NOT trim a trailing hard break off the document', () => {
    const xml = '<paragraph>a<hard_break/></paragraph>';
    // Two-space hard-break marker must survive the post-render cleanup.
    expect(xmlToMarkdown(xml)).toMatch(/a {2}\n$/);
  });

  it('escapes an embedded ``` inside a code block by widening the fence', () => {
    const xml =
      '<code_block lang="md">before\n```\nfake close\n```\nafter</code_block>';
    const md = xmlToMarkdown(xml);
    // Outer fence must be longer than 3 backticks so the inner ``` does
    // not close the block early.
    expect(md.startsWith('````md\n')).toBe(true);
    expect(md.endsWith('\n````')).toBe(true);
    // Round-trip preserves the inner backticks verbatim.
    expect(markdownToXml(md)).toContain('```\nfake close\n```');
  });

  it('preserves ordered_list start attribute', () => {
    const xml =
      '<ordered_list order="5"><list_item><paragraph>a</paragraph></list_item><list_item><paragraph>b</paragraph></list_item></ordered_list>';
    const md = xmlToMarkdown(xml);
    expect(md).toMatch(/^5\. a\n6\. b$/);
  });

  it('indents continuation lines inside the FIRST list-item block (hard break)', () => {
    const xml =
      '<bullet_list><list_item><paragraph>line1<hard_break/>line2</paragraph></list_item></bullet_list>';
    const md = xmlToMarkdown(xml);
    // The second line ("line2") must be indented under the bullet so a
    // markdown parser keeps it inside the list item.
    expect(md).toMatch(/^- line1 {2}\n {2}line2$/);
  });

  it('falls back gracefully when an inkweld:// URL has malformed percent-encoding', () => {
    // `%E0%A4` is an incomplete UTF-8 sequence — decodeURIComponent throws.
    // The conversion must NOT abort; the link becomes a normal link with
    // no elementRef attrs.
    const md = 'see [chip](inkweld://element/%E0%A4)';
    expect(() => markdownToXml(md)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// URI codec — strict scoped form + flag-style query preservation
// ---------------------------------------------------------------------------

describe('inkweld:// URI codec — strict validation', () => {
  it('rejects scoped URIs with an extra trailing segment', async () => {
    const { decodeInkweldUri } = await import('../src/uri');
    expect(decodeInkweldUri('inkweld://u/p/element/id/extra')).toBeNull();
  });

  it('rejects scoped URIs with a blank username or slug', async () => {
    const { decodeInkweldUri } = await import('../src/uri');
    expect(decodeInkweldUri('inkweld:///p/element/id')).toBeNull();
    expect(decodeInkweldUri('inkweld://u//element/id')).toBeNull();
  });

  it('round-trips an empty-string flag-style query parameter', async () => {
    const { decodeInkweldUri, encodeInkweldUri } = await import('../src/uri');
    const decoded = decodeInkweldUri('inkweld://element/x?flag=&kept=v');
    expect(decoded?.params).toEqual({ flag: '', kept: 'v' });
    expect(
      encodeInkweldUri({ elementId: 'x', params: decoded!.params })
    ).toBe('inkweld://element/x?flag=&kept=v');
  });
});

// ---------------------------------------------------------------------------
// XML parser — mismatched closing tag is now a hard error
// ---------------------------------------------------------------------------

describe('XML AST parser — mismatched-tag safety', () => {
  it('throws when a closing tag does not match the open element', async () => {
    const { parseXmlToAst } = await import('../src/xml/ast');
    // <strong> closed by </paragraph> — must NOT silently flatten.
    expect(() =>
      parseXmlToAst('<paragraph><strong>x</paragraph>')
    ).toThrow(/Mismatched closing tag/);
  });
});
