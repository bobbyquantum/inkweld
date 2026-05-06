/**
 * Tests for the `@inkweld/prosemirror/xml` module — entities, parser,
 * serializer, plain-text extractor, and AST parser.
 *
 * Uses the real `yjs` build (the same one the rest of the package
 * depends on) so the parser/serializer round-trip exercises actual
 * Y.XmlElement/Y.XmlText behaviour rather than a mock.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  decodeXmlEntities,
  escapeXmlAttr,
  escapeXmlText,
  skipTopLevelWhitespace,
  parseXmlToYjsNodes,
  parseAttrValue,
  applyXmlToYjsFragment,
  serializeYjsFragmentToXml,
  xmlContentToText,
  parseXmlToAst,
  type AstElement,
} from '../src/xml';

// ---------------------------------------------------------------------------
// entities.ts
// ---------------------------------------------------------------------------

describe('decodeXmlEntities', () => {
  it('decodes the standard named entities', () => {
    expect(decodeXmlEntities('&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos;')).toBe(
      `<a> & "b" 'c'`
    );
  });

  it('decodes &amp; LAST so escaped entities round-trip', () => {
    // Source had literal `&lt;` → was serialised as `&amp;lt;`.
    // Decoder must produce `&lt;`, not `<`.
    expect(decodeXmlEntities('&amp;lt;')).toBe('&lt;');
  });

  it('decodes decimal numeric character references', () => {
    expect(decodeXmlEntities('A&#9731;B')).toBe('A\u2603B'); // snowman
  });

  it('decodes hex numeric character references (both cases)', () => {
    expect(decodeXmlEntities('&#x2603;')).toBe('\u2603');
    expect(decodeXmlEntities('&#X2603;')).toBe('&#X2603;'); // capital X not matched
    expect(decodeXmlEntities('&#xABCD;')).toBe(String.fromCodePoint(0xabcd));
    expect(decodeXmlEntities('&#xabcd;')).toBe(String.fromCodePoint(0xabcd));
  });

  it('leaves invalid XML code points untouched', () => {
    // 0x0000 is not a permitted XML char.
    expect(decodeXmlEntities('&#0;')).toBe('&#0;');
    expect(decodeXmlEntities('&#x0;')).toBe('&#x0;');
    // 0xFFFE is invalid.
    expect(decodeXmlEntities('&#xFFFE;')).toBe('&#xFFFE;');
  });

  it('decodes astral plane code points', () => {
    expect(decodeXmlEntities('&#x1F600;')).toBe('\u{1F600}');
  });

  it('returns the original string when no entities are present', () => {
    expect(decodeXmlEntities('plain text')).toBe('plain text');
  });
});

describe('escapeXmlText', () => {
  it('escapes all five XML metacharacters', () => {
    expect(escapeXmlText(`<a> & "b" 'c'`)).toBe(
      '&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos;'
    );
  });

  it('escapes &amp; first to avoid double-encoding', () => {
    expect(escapeXmlText('&lt;')).toBe('&amp;lt;');
  });
});

describe('escapeXmlAttr', () => {
  it('escapes &, ", and < but leaves > and apos alone', () => {
    expect(escapeXmlAttr(`a & b "c" <d> 'e'`)).toBe(
      `a &amp; b &quot;c&quot; &lt;d> 'e'`
    );
  });

  it('escapes &amp; first to avoid double-encoding', () => {
    expect(escapeXmlAttr('&"')).toBe('&amp;&quot;');
  });
});

describe('skipTopLevelWhitespace', () => {
  it('returns pos unchanged when the cursor is on a non-whitespace char', () => {
    expect(skipTopLevelWhitespace('<p>', 0)).toBe(0);
    expect(skipTopLevelWhitespace('abc', 0)).toBe(0);
  });

  it('skips whitespace runs whose trimmed value is empty', () => {
    // Pure-whitespace runs (with or without newlines) are insignificant
    // between top-level elements and get skipped.
    expect(skipTopLevelWhitespace('   <p>', 0)).toBe(3);
    expect(skipTopLevelWhitespace('  \n  <p>', 0)).toBe(5);
  });

  it('skips trailing whitespace at end-of-string', () => {
    expect(skipTopLevelWhitespace(' \n ', 0)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// parser.ts (parseXmlToYjsNodes / parseAttrValue)
// ---------------------------------------------------------------------------

describe('parseAttrValue', () => {
  it('returns plain strings unchanged', () => {
    expect(parseAttrValue('hello')).toBe('hello');
    expect(parseAttrValue('123')).toBe('123');
    expect(parseAttrValue('true')).toBe('true');
    expect(parseAttrValue('')).toBe('');
  });

  it('parses JSON objects', () => {
    expect(parseAttrValue('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON arrays', () => {
    expect(parseAttrValue('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('falls back to the raw string when JSON is malformed', () => {
    expect(parseAttrValue('{not json}')).toBe('{not json}');
    expect(parseAttrValue('[oops')).toBe('[oops');
  });
});

describe('parseXmlToYjsNodes', () => {
  // Helper: parse and attach to a fresh fragment so children are readable.
  // Detached Y.XmlElement/Y.XmlText throw "Invalid access" on most reads.
  function parseAttached(xml: string): Y.XmlFragment {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    const nodes = parseXmlToYjsNodes(Y, xml);
    if (nodes.length > 0) fragment.insert(0, nodes);
    return fragment;
  }

  it('returns an empty array for empty / whitespace input', () => {
    expect(parseXmlToYjsNodes(Y, '')).toEqual([]);
    expect(parseXmlToYjsNodes(Y, '   \n\t  ')).toEqual([]);
  });

  it('parses a single paragraph with text', () => {
    const fragment = parseAttached('<paragraph>hello</paragraph>');
    expect(fragment.length).toBe(1);
    const p = fragment.get(0) as Y.XmlElement;
    expect(p.nodeName).toBe('paragraph');
    expect(p.length).toBe(1);
    const text = p.get(0) as Y.XmlText;
    expect(text.toString()).toBe('hello');
  });

  it('preserves original tag casing for unknown / camelCase nodes', () => {
    const fragment = parseAttached('<elementRef elementId="e1"/>');
    const ref = fragment.get(0) as Y.XmlElement;
    expect(ref.nodeName).toBe('elementRef');
    expect(ref.getAttribute('elementId')).toBe('e1');
  });

  it('applies node tag aliases (ol → ordered_list, ul → bullet_list)', () => {
    const ol = parseAttached('<ol></ol>').get(0) as Y.XmlElement;
    expect(ol.nodeName).toBe('ordered_list');
    const ul = parseAttached('<ul></ul>').get(0) as Y.XmlElement;
    expect(ul.nodeName).toBe('bullet_list');
    const nl = parseAttached('<numbered_list></numbered_list>').get(0) as Y.XmlElement;
    expect(nl.nodeName).toBe('ordered_list');
  });

  it('collapses mark tags into Y.XmlText formatting attributes', () => {
    const fragment = parseAttached(
      '<paragraph>plain <strong>bold</strong> end</paragraph>'
    );
    const p = fragment.get(0) as Y.XmlElement;
    expect(p.length).toBe(1);
    const text = p.get(0) as Y.XmlText;
    const delta = text.toDelta() as Array<{ insert: string; attributes?: Record<string, unknown> }>;
    expect(delta).toHaveLength(3);
    expect(delta[0]).toEqual({ insert: 'plain ' });
    expect(delta[1].insert).toBe('bold');
    expect(delta[1].attributes).toEqual({ strong: {} });
    expect(delta[2]).toEqual({ insert: ' end' });
  });

  it('parses link marks with href and optional title', () => {
    const fragment = parseAttached(
      '<paragraph><a href="https://example.com" title="Ex">click</a></paragraph>'
    );
    const p = fragment.get(0) as Y.XmlElement;
    const text = p.get(0) as Y.XmlText;
    const delta = text.toDelta() as Array<{ insert: string; attributes?: Record<string, unknown> }>;
    expect(delta[0].attributes).toEqual({
      link: { href: 'https://example.com', title: 'Ex' },
    });
  });

  it('parses generic mark span (data-mark)', () => {
    const fragment = parseAttached(
      '<paragraph><span data-mark="comment" commentId="c1">x</span></paragraph>'
    );
    const p = fragment.get(0) as Y.XmlElement;
    const text = p.get(0) as Y.XmlText;
    const delta = text.toDelta() as Array<{ insert: string; attributes?: Record<string, unknown> }>;
    expect(delta[0].attributes).toEqual({ comment: { commentId: 'c1' } });
  });

  it('handles self-closing structural elements with attributes', () => {
    const fragment = parseAttached(
      '<paragraph><elementRef elementId="42" displayText="Foo"/></paragraph>'
    );
    const p = fragment.get(0) as Y.XmlElement;
    expect(p.length).toBe(1);
    const ref = p.get(0) as Y.XmlElement;
    expect(ref.nodeName).toBe('elementRef');
    expect(ref.getAttribute('elementId')).toBe('42');
    expect(ref.getAttribute('displayText')).toBe('Foo');
  });

  it('decodes entity-encoded attribute values', () => {
    const fragment = parseAttached(
      '<paragraph title="a &amp; b &lt;c&gt;">x</paragraph>'
    );
    const p = fragment.get(0) as Y.XmlElement;
    expect(p.getAttribute('title')).toBe('a & b <c>');
  });

  it('decodes JSON-encoded attribute values', () => {
    const fragment = parseAttached(
      `<paragraph data='{"x":1}'>x</paragraph>`
    );
    const p = fragment.get(0) as Y.XmlElement;
    expect(p.getAttribute('data')).toEqual({ x: 1 });
  });

  it('strips XML comments', () => {
    const fragment = parseAttached('<!-- ignore me --><paragraph>x</paragraph>');
    expect(fragment.length).toBe(1);
    expect((fragment.get(0) as Y.XmlElement).nodeName).toBe('paragraph');
  });

  it('skips inter-block whitespace', () => {
    const fragment = parseAttached(
      '<paragraph>a</paragraph>\n  <paragraph>b</paragraph>'
    );
    expect(fragment.length).toBe(2);
  });

  it('propagates marks from a parent mark wrapper into nested structural children', () => {
    const fragment = parseAttached(
      '<strong><paragraph>bold para</paragraph></strong>'
    );
    const p = fragment.get(0) as Y.XmlElement;
    expect(p.nodeName).toBe('paragraph');
    expect(p.length).toBe(1);
    const text = p.get(0) as Y.XmlText;
    const delta = text.toDelta() as Array<{ insert: string; attributes?: Record<string, unknown> }>;
    expect(delta[0].attributes).toEqual({ strong: {} });
  });

  it('handles consecutive runs with different marks (clears stale formatting)', () => {
    const fragment = parseAttached(
      '<paragraph><strong>a</strong><em>b</em></paragraph>'
    );
    const p = fragment.get(0) as Y.XmlElement;
    const text = p.get(0) as Y.XmlText;
    const delta = text.toDelta() as Array<{ insert: string; attributes?: Record<string, unknown> }>;
    expect(delta).toHaveLength(2);
    expect(delta[0].attributes).toEqual({ strong: {} });
    expect(delta[1].attributes).toEqual({ em: {} });
  });

  it('handles a self-closing mark tag (degenerate empty mark)', () => {
    const fragment = parseAttached('<paragraph><strong/></paragraph>');
    const p = fragment.get(0) as Y.XmlElement;
    expect(p.length).toBe(0);
  });

  it('handles a self-closing generic mark span', () => {
    const fragment = parseAttached(
      '<paragraph><span data-mark="comment" commentId="c1"/></paragraph>'
    );
    const p = fragment.get(0) as Y.XmlElement;
    expect(p.length).toBe(0);
  });

  it('matches closing tags case-insensitively', () => {
    const fragment = parseAttached('<Paragraph>x</paragraph>');
    const p = fragment.get(0) as Y.XmlElement;
    expect(p.nodeName).toBe('Paragraph');
  });

  it('treats a stray "<" not followed by a valid tag as text', () => {
    const fragment = parseAttached('<paragraph>3 < 5</paragraph>');
    expect(fragment.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// serializer.ts
// ---------------------------------------------------------------------------

describe('serializeYjsFragmentToXml + applyXmlToYjsFragment', () => {
  it('round-trips a simple paragraph through Yjs', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    applyXmlToYjsFragment(Y, doc, fragment, '<paragraph>hello</paragraph>');
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe('<paragraph>hello</paragraph>');
  });

  it('round-trips text with multiple marks', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    applyXmlToYjsFragment(
      Y,
      doc,
      fragment,
      '<paragraph><strong><em>x</em></strong></paragraph>'
    );
    const out = serializeYjsFragmentToXml(Y, fragment);
    // Mark wrapper order may differ (the serializer sorts alphabetically)
    // but both marks must wrap the inner text.
    expect(out).toContain('<strong>');
    expect(out).toContain('<em>');
    expect(out).toContain('x');
    expect(out.startsWith('<paragraph>')).toBe(true);
    expect(out.endsWith('</paragraph>')).toBe(true);
  });

  it('round-trips a link mark', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    const xml = '<paragraph><a href="https://x.com" title="X">click</a></paragraph>';
    applyXmlToYjsFragment(Y, doc, fragment, xml);
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe(xml);
  });

  it('round-trips a link mark with no attrs (degenerate empty href)', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    // Fabricate a Y.XmlText with a link mark missing href to drive the
    // "no attrs" branch in wrapInMarkTag.
    const text = new Y.XmlText();
    text.insert(0, 'click', { link: {} });
    const p = new Y.XmlElement('paragraph');
    p.insert(0, [text]);
    fragment.insert(0, [p]);
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe(
      '<paragraph><a>click</a></paragraph>'
    );
  });

  it('round-trips a generic lossy mark as <span data-mark=...>', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    const xml = '<paragraph><span data-mark="comment" commentId="c1">x</span></paragraph>';
    applyXmlToYjsFragment(Y, doc, fragment, xml);
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe(xml);
  });

  it('serialises self-closing form for empty non-block elements', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    applyXmlToYjsFragment(
      Y,
      doc,
      fragment,
      '<paragraph><elementRef elementId="e1"/></paragraph>'
    );
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe(
      '<paragraph><elementRef elementId="e1"/></paragraph>'
    );
  });

  it('emits explicit close tags for empty block nodes', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    applyXmlToYjsFragment(Y, doc, fragment, '<paragraph></paragraph>');
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe('<paragraph></paragraph>');
  });

  it('escapes XML special characters in text and attributes', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    applyXmlToYjsFragment(
      Y,
      doc,
      fragment,
      '<paragraph title="a &amp; b">3 &lt; 5</paragraph>'
    );
    const xml = serializeYjsFragmentToXml(Y, fragment);
    expect(xml).toContain('title="a &amp; b"');
    expect(xml).toContain('3 &lt; 5');
  });

  it('serialises JSON-valued attributes back to JSON strings', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    const p = new Y.XmlElement('paragraph');
    p.setAttribute('data', { foo: 1 } as unknown as string);
    fragment.insert(0, [p]);
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe(
      '<paragraph data="{&quot;foo&quot;:1}"></paragraph>'
    );
  });

  it('serialises a stand-alone Y.XmlText at the fragment level', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    const text = new Y.XmlText();
    text.insert(0, 'naked');
    fragment.insert(0, [text]);
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe('naked');
  });

  it('clears the fragment before applying new XML', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    applyXmlToYjsFragment(Y, doc, fragment, '<paragraph>first</paragraph>');
    applyXmlToYjsFragment(Y, doc, fragment, '<paragraph>second</paragraph>');
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe('<paragraph>second</paragraph>');
  });

  it('handles empty XML by emptying the fragment', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    applyXmlToYjsFragment(Y, doc, fragment, '<paragraph>x</paragraph>');
    applyXmlToYjsFragment(Y, doc, fragment, '');
    expect(fragment.length).toBe(0);
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe('');
  });

  it('round-trips nested structural elements (lists)', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('test');
    const xml =
      '<bullet_list><listItem><paragraph>a</paragraph></listItem><listItem><paragraph>b</paragraph></listItem></bullet_list>';
    applyXmlToYjsFragment(Y, doc, fragment, xml);
    expect(serializeYjsFragmentToXml(Y, fragment)).toBe(xml);
  });
});

// ---------------------------------------------------------------------------
// text.ts
// ---------------------------------------------------------------------------

describe('xmlContentToText', () => {
  it('strips tags and collapses block boundaries to newlines', () => {
    expect(
      xmlContentToText(
        '<paragraph>hello</paragraph><paragraph>world</paragraph>'
      )
    ).toBe('hello\nworld');
  });

  it('handles snake_case block tag aliases', () => {
    expect(xmlContentToText('<list_item>x</list_item>')).toBe('x');
    expect(xmlContentToText('<code_block>k</code_block>')).toBe('k');
  });

  it('handles camelCase block tag aliases', () => {
    expect(xmlContentToText('<listItem>x</listItem><codeBlock>k</codeBlock>')).toBe(
      'x\nk'
    );
  });

  it('decodes the standard entities (and decodes &amp; last)', () => {
    expect(xmlContentToText('<paragraph>3 &lt; 5 &amp; 2 &gt; 1</paragraph>')).toBe(
      '3 < 5 & 2 > 1'
    );
    expect(xmlContentToText('<paragraph>&amp;lt;</paragraph>')).toBe('&lt;');
  });

  it('decodes &#39; and &apos;', () => {
    expect(xmlContentToText('<paragraph>it&#39;s &apos;ok&apos;</paragraph>')).toBe(
      `it's 'ok'`
    );
  });

  it('strips inline mark tags', () => {
    expect(
      xmlContentToText('<paragraph>a <strong>b</strong> <em>c</em></paragraph>')
    ).toBe('a b c');
  });

  it('trims surrounding whitespace from the final string', () => {
    expect(xmlContentToText('  <paragraph>x</paragraph>  ')).toBe('x');
  });

  it('returns an empty string for empty input', () => {
    expect(xmlContentToText('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// ast.ts (parseXmlToAst)
// ---------------------------------------------------------------------------

describe('parseXmlToAst', () => {
  it('returns [] for empty input', () => {
    expect(parseXmlToAst('')).toEqual([]);
    expect(parseXmlToAst('   ')).toEqual([]);
  });

  it('parses a paragraph with text into the AST', () => {
    const ast = parseXmlToAst('<paragraph>hi</paragraph>');
    expect(ast).toHaveLength(1);
    const p = ast[0] as AstElement;
    expect(p.type).toBe('element');
    expect(p.name).toBe('paragraph');
    expect(p.children).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('attaches accumulated marks to text leaves', () => {
    const ast = parseXmlToAst('<paragraph><strong>bold</strong></paragraph>');
    const p = ast[0] as AstElement;
    const text = p.children[0];
    expect(text).toEqual({
      type: 'text',
      text: 'bold',
      marks: { strong: {} },
    });
  });

  it('parses link mark attrs', () => {
    const ast = parseXmlToAst(
      '<paragraph><a href="https://x.com" title="t">x</a></paragraph>'
    );
    const p = ast[0] as AstElement;
    expect(p.children[0]).toEqual({
      type: 'text',
      text: 'x',
      marks: { link: { href: 'https://x.com', title: 't' } },
    });
  });

  it('parses generic mark spans', () => {
    const ast = parseXmlToAst(
      '<paragraph><span data-mark="comment" commentId="c1">x</span></paragraph>'
    );
    const p = ast[0] as AstElement;
    expect(p.children[0]).toEqual({
      type: 'text',
      text: 'x',
      marks: { comment: { commentId: 'c1' } },
    });
  });

  it('parses self-closing structural elements with attributes', () => {
    const ast = parseXmlToAst('<elementRef elementId="e1"/>');
    expect(ast).toEqual([
      { type: 'element', name: 'elementRef', attrs: { elementId: 'e1' }, children: [] },
    ]);
  });

  it('parses JSON attribute values', () => {
    const ast = parseXmlToAst(`<paragraph data='[1,2]'>x</paragraph>`);
    const p = ast[0] as AstElement;
    expect(p.attrs).toEqual({ data: [1, 2] });
  });

  it('strips XML comments', () => {
    expect(parseXmlToAst('<!-- skip --><paragraph>x</paragraph>')).toHaveLength(1);
  });

  it('drops inter-block whitespace runs', () => {
    const ast = parseXmlToAst('<paragraph>a</paragraph>\n  <paragraph>b</paragraph>');
    expect(ast).toHaveLength(2);
  });

  it('applies node tag aliases', () => {
    const ast = parseXmlToAst('<ol></ol>');
    expect((ast[0] as AstElement).name).toBe('ordered_list');
  });
});
