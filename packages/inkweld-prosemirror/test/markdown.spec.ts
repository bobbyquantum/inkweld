/**
 * Tests for the `@inkweld/prosemirror/markdown` and
 * `@inkweld/prosemirror/uri` modules.
 *
 * Run via `bun run test` (or `bun run test:coverage`) from inside the
 * package directory, or `npm run test:package` from the repo root. Both
 * paths feed the generated `lcov.info` to Sonar.
 */
import { describe, expect, it } from 'vitest';

import { markdownToXml, xmlToMarkdown } from '../src/markdown';
import { decodeInkweldUri, encodeInkweldUri } from '../src/uri';

// ---------------------------------------------------------------------------
// inkweld:// URI codec
// ---------------------------------------------------------------------------

describe('inkweld:// URI codec', () => {
  it('encodes a bare element reference (no project scope)', () => {
    expect(encodeInkweldUri({ elementId: 'abc-123' })).toBe(
      'inkweld://element/abc-123'
    );
  });

  it('encodes a project-scoped reference with query params', () => {
    expect(
      encodeInkweldUri({
        elementId: 'el-1',
        username: 'alice',
        slug: 'my-novel',
        params: { type: 'character', note: 'protagonist' },
      })
    ).toBe(
      'inkweld://alice/my-novel/element/el-1?type=character&note=protagonist'
    );
  });

  it('drops null/undefined params but preserves empty strings as flag-style', () => {
    // Empty-string values must round-trip as `key=` so unknown
    // flag-style query parameters survive decode → encode.
    expect(
      encodeInkweldUri({
        elementId: 'x',
        params: { a: 'kept', b: undefined, c: null, d: '' },
      })
    ).toBe('inkweld://element/x?a=kept&d=');
  });

  it('percent-encodes path segments and param values', () => {
    expect(
      encodeInkweldUri({
        elementId: 'id with space',
        username: 'bob',
        slug: 'a/b',
        params: { note: 'has & and =' },
      })
    ).toBe(
      'inkweld://bob/a%2Fb/element/id%20with%20space?note=has%20%26%20and%20%3D'
    );
  });

  it('decodes the bare form', () => {
    expect(decodeInkweldUri('inkweld://element/abc')).toEqual({
      elementId: 'abc',
      params: {},
    });
  });

  it('decodes the project-scoped form with params', () => {
    expect(
      decodeInkweldUri(
        'inkweld://alice/my-novel/element/el-1?type=character&note=hi'
      )
    ).toEqual({
      elementId: 'el-1',
      username: 'alice',
      slug: 'my-novel',
      params: { type: 'character', note: 'hi' },
    });
  });

  it('round-trips arbitrary punctuation in the element id', () => {
    const id = 'weird id?with#chars/and&more';
    const uri = encodeInkweldUri({ elementId: id, username: 'u', slug: 's' });
    const decoded = decodeInkweldUri(uri);
    expect(decoded?.elementId).toBe(id);
    expect(decoded?.username).toBe('u');
    expect(decoded?.slug).toBe('s');
  });

  it('returns null for non-inkweld URIs', () => {
    expect(decodeInkweldUri('https://example.com/x')).toBeNull();
    expect(decodeInkweldUri('inkweld://malformed')).toBeNull();
    expect(decodeInkweldUri('inkweld://element/')).toBeNull();
  });

  it('tolerates a key-only param', () => {
    expect(decodeInkweldUri('inkweld://element/x?flag')?.params).toEqual({
      flag: '',
    });
  });
});

// ---------------------------------------------------------------------------
// xmlToMarkdown
// ---------------------------------------------------------------------------

describe('xmlToMarkdown', () => {
  it('renders a single paragraph', () => {
    expect(xmlToMarkdown('<paragraph>Hello world</paragraph>')).toBe(
      'Hello world'
    );
  });

  it('renders headings with level clamping', () => {
    expect(xmlToMarkdown('<heading level="1">Title</heading>')).toBe('# Title');
    expect(xmlToMarkdown('<heading level="3">Sub</heading>')).toBe('### Sub');
    // out-of-range levels clamp to [1, 6]
    expect(
      xmlToMarkdown('<heading level="9">X</heading>').startsWith('######')
    ).toBe(true);
    expect(
      xmlToMarkdown('<heading level="0">X</heading>').startsWith('#')
    ).toBe(true);
  });

  it('renders strong/em/code/strike inline marks with correct nesting', () => {
    const xml =
      '<paragraph><strong>bold</strong> and <em>italic</em> and <code>x()</code> and <s>gone</s></paragraph>';
    expect(xmlToMarkdown(xml)).toBe(
      '**bold** and *italic* and `x()` and ~~gone~~'
    );
  });

  it('emits a long-enough backtick fence around inline code containing backticks', () => {
    const xml = '<paragraph><code>a `b` c</code></paragraph>';
    const md = xmlToMarkdown(xml);
    // Must use at least double-backtick fence so internal single backticks
    // don't terminate the span. Padding is only added when the inner text
    // itself starts or ends with a backtick (CommonMark §6.1).
    expect(md).toBe('``a `b` c``');
  });

  it('renders bullet and ordered lists', () => {
    const xml =
      '<bullet_list><list_item><paragraph>A</paragraph></list_item><list_item><paragraph>B</paragraph></list_item></bullet_list>';
    expect(xmlToMarkdown(xml)).toBe('- A\n- B');

    const ordered =
      '<ordered_list><list_item><paragraph>One</paragraph></list_item><list_item><paragraph>Two</paragraph></list_item></ordered_list>';
    expect(xmlToMarkdown(ordered)).toBe('1. One\n2. Two');
  });

  it('renders blockquotes with the > prefix', () => {
    expect(
      xmlToMarkdown('<blockquote><paragraph>Quoted</paragraph></blockquote>')
    ).toBe('> Quoted');
  });

  it('renders fenced code blocks', () => {
    // Read accepts both `lang` and `language`; the canonical attr name
    // used elsewhere in the app (see markdown-generator.service.ts) is
    // `lang`, so we test both for read-side defensiveness.
    expect(
      xmlToMarkdown('<code_block lang="ts">const x = 1;</code_block>')
    ).toBe('```ts\nconst x = 1;\n```');
    expect(
      xmlToMarkdown('<code_block language="ts">const x = 1;</code_block>')
    ).toBe('```ts\nconst x = 1;\n```');
  });

  it('renders thematic breaks and hard breaks', () => {
    expect(xmlToMarkdown('<horizontal_rule/>')).toBe('---');
    expect(
      xmlToMarkdown('<paragraph>line 1<hard_break/>line 2</paragraph>')
    ).toBe('line 1  \nline 2');
  });

  it('preserves lossy marks as <span data-mark="..."> wrappers', () => {
    const xml =
      '<paragraph><comment commentId="c1">commented</comment></paragraph>';
    const md = xmlToMarkdown(xml);
    expect(md).toContain('<span data-mark="comment"');
    expect(md).toContain('commentId="c1"');
    expect(md).toContain('>commented</span>');
  });

  it('uses the bare inkweld:// form for elementRef by default', () => {
    const xml =
      '<paragraph><elementRef elementId="el-1" displayText="Alice"/></paragraph>';
    expect(xmlToMarkdown(xml)).toBe('[Alice](inkweld://element/el-1)');
  });

  it('uses a project-scoped href when an encoder is provided', () => {
    const xml =
      '<paragraph><elementRef elementId="el-1" displayText="Alice" type="character"/></paragraph>';
    const md = xmlToMarkdown(xml, {
      encodeElementRefHref: attrs =>
        encodeInkweldUri({
          elementId: String(attrs['elementId']),
          username: 'bob',
          slug: 'novel',
          params: {
            type: typeof attrs['type'] === 'string' ? attrs['type'] : undefined,
          },
        }),
    });
    expect(md).toBe('[Alice](inkweld://bob/novel/element/el-1?type=character)');
  });
});

// ---------------------------------------------------------------------------
// markdownToXml
// ---------------------------------------------------------------------------

describe('markdownToXml', () => {
  it('wraps plain text in a paragraph', () => {
    expect(markdownToXml('Hello world')).toBe(
      '<paragraph>Hello world</paragraph>'
    );
  });

  it('parses ATX headings at all levels', () => {
    expect(markdownToXml('# Title')).toBe('<heading level="1">Title</heading>');
    expect(markdownToXml('### Sub')).toBe('<heading level="3">Sub</heading>');
    expect(markdownToXml('###### Six')).toBe(
      '<heading level="6">Six</heading>'
    );
  });

  it('parses setext headings', () => {
    expect(markdownToXml('Title\n=====')).toBe(
      '<heading level="1">Title</heading>'
    );
    expect(markdownToXml('Title\n-----')).toBe(
      '<heading level="2">Title</heading>'
    );
  });

  it('parses inline marks', () => {
    expect(markdownToXml('**bold**')).toBe(
      '<paragraph><strong>bold</strong></paragraph>'
    );
    expect(markdownToXml('*italic*')).toBe(
      '<paragraph><em>italic</em></paragraph>'
    );
    expect(markdownToXml('~~gone~~')).toBe(
      '<paragraph><s>gone</s></paragraph>'
    );
    expect(markdownToXml('`code`')).toBe(
      '<paragraph><code>code</code></paragraph>'
    );
  });

  it('parses fenced code blocks with language', () => {
    // Canonical attr name is `lang` (matches markdown-generator.service).
    expect(markdownToXml('```ts\nconst x = 1;\n```')).toBe(
      '<code_block lang="ts">const x = 1;</code_block>'
    );
  });

  it('parses bullet and ordered lists', () => {
    const bullet = markdownToXml('- A\n- B');
    expect(bullet).toContain('<bullet_list>');
    expect(bullet).toContain('<list_item><paragraph>A</paragraph></list_item>');
    expect(bullet).toContain('<list_item><paragraph>B</paragraph></list_item>');

    const ordered = markdownToXml('1. One\n2. Two');
    expect(ordered).toContain('<ordered_list>');
    expect(ordered).toContain(
      '<list_item><paragraph>One</paragraph></list_item>'
    );
  });

  it('parses blockquotes', () => {
    expect(markdownToXml('> Quoted')).toBe(
      '<blockquote><paragraph>Quoted</paragraph></blockquote>'
    );
  });

  it('parses thematic breaks', () => {
    expect(markdownToXml('---')).toBe('<horizontal_rule/>');
    expect(markdownToXml('***')).toBe('<horizontal_rule/>');
  });

  it('honours trailing two-space hard breaks', () => {
    // two trailing spaces before the newline = hard break inside a single paragraph
    expect(markdownToXml('line 1  \nline 2')).toBe(
      '<paragraph>line 1<hard_break/>line 2</paragraph>'
    );
  });

  it('passes <span data-mark="..."> through to lossy marks', () => {
    // Lossy marks are emitted in the canonical XML form used by the
    // serializer: `<span data-mark="..." extraAttrs="...">...</span>`.
    // This is intentional — comment, text_color, etc. are not in the
    // mark→tag table, so they ride along as generic spans.
    const md = '<span data-mark="comment" commentId="c1">commented</span>';
    const xml = markdownToXml(md);
    expect(xml).toContain('<span data-mark="comment"');
    expect(xml).toContain('commentId="c1"');
    expect(xml).toContain('>commented</span>');
  });

  it('decodes inkweld:// links into elementRef nodes', () => {
    const md = '[Alice](inkweld://bob/novel/element/el-1?type=character)';
    const xml = markdownToXml(md, {
      decodeElementRefHref: href => {
        const decoded = decodeInkweldUri(href);
        if (!decoded) return null;
        return {
          elementId: decoded.elementId,
          type: decoded.params['type'],
        };
      },
    });
    expect(xml).toContain('<elementRef');
    expect(xml).toContain('elementId="el-1"');
    expect(xml).toContain('displayText="Alice"');
    expect(xml).toContain('type="character"');
  });

  it('keeps non-inkweld links as plain link marks', () => {
    // Per MARK_TO_TAG the link mark is serialized as `<a>`, not `<link>`.
    const xml = markdownToXml('[click](https://example.com)');
    expect(xml).toContain('<a ');
    expect(xml).toContain('href="https://example.com"');
    expect(xml).toContain('>click</a>');
  });

  it('escapes XML special chars in text content', () => {
    expect(markdownToXml('a & b < c > d')).toBe(
      '<paragraph>a &amp; b &lt; c &gt; d</paragraph>'
    );
  });
});

// ---------------------------------------------------------------------------
// Round-trip: XML -> markdown -> XML must preserve semantic structure
// ---------------------------------------------------------------------------

describe('markdown round-trip', () => {
  function roundTrip(xml: string): string {
    return markdownToXml(xmlToMarkdown(xml));
  }

  it('round-trips a simple paragraph', () => {
    const xml = '<paragraph>Hello world</paragraph>';
    expect(roundTrip(xml)).toBe(xml);
  });

  it('round-trips headings', () => {
    expect(roundTrip('<heading level="2">Sub</heading>')).toBe(
      '<heading level="2">Sub</heading>'
    );
  });

  it('round-trips bold/italic/code', () => {
    const xml =
      '<paragraph><strong>bold</strong> and <em>italic</em> and <code>code()</code></paragraph>';
    expect(roundTrip(xml)).toBe(xml);
  });

  it('round-trips a bullet list', () => {
    const xml =
      '<bullet_list><list_item><paragraph>A</paragraph></list_item><list_item><paragraph>B</paragraph></list_item></bullet_list>';
    expect(roundTrip(xml)).toBe(xml);
  });

  it('round-trips blockquotes', () => {
    const xml = '<blockquote><paragraph>Quoted text</paragraph></blockquote>';
    expect(roundTrip(xml)).toBe(xml);
  });

  it('round-trips fenced code blocks', () => {
    const xml = '<code_block lang="ts">const x = 1;</code_block>';
    expect(roundTrip(xml)).toBe(xml);
  });

  it('round-trips comment marks via the span pass-through', () => {
    // The XML serializer's canonical form for lossy marks is
    // `<span data-mark="...">`. Authoring `<comment>` directly is
    // tolerated on the read side but normalised to the span form on
    // the way back through markdown.
    const xml =
      '<paragraph><comment commentId="c1">marked</comment></paragraph>';
    const out = roundTrip(xml);
    expect(out).toContain('<span data-mark="comment"');
    expect(out).toContain('commentId="c1"');
    expect(out).toContain('>marked</span>');
  });

  it('round-trips elementRef nodes via inkweld:// URIs', () => {
    const xml =
      '<paragraph><elementRef elementId="el-1" displayText="Alice" type="character"/></paragraph>';
    const md = xmlToMarkdown(xml, {
      encodeElementRefHref: attrs =>
        encodeInkweldUri({
          elementId: String(attrs['elementId']),
          username: 'bob',
          slug: 'novel',
          params: {
            type: typeof attrs['type'] === 'string' ? attrs['type'] : undefined,
          },
        }),
    });
    const back = markdownToXml(md, {
      decodeElementRefHref: href => {
        const decoded = decodeInkweldUri(href);
        if (!decoded) return null;
        return {
          elementId: decoded.elementId,
          type: decoded.params['type'],
        };
      },
    });
    expect(back).toContain('<elementRef');
    expect(back).toContain('elementId="el-1"');
    expect(back).toContain('displayText="Alice"');
    expect(back).toContain('type="character"');
  });
});
