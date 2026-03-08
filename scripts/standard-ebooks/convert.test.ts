/**
 * Unit tests for the Standard Ebooks → Inkweld converter.
 *
 * These tests use small hand-crafted XHTML snippets to verify
 * the XHTML → ProseMirror conversion logic.
 */

import { describe, expect, test } from 'bun:test';
import { parseContentOpf, parseTocXhtml } from './metadata.js';
import { getAndClearGaps, parseXhtmlFile } from './parser.js';

// ── Metadata parsing tests ───────────────────────────────────

describe('parseContentOpf', () => {
  const sampleOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title id="title">The Napoleon of Notting Hill</dc:title>
    <dc:creator id="author">G. K. Chesterton</dc:creator>
    <dc:language>en-GB</dc:language>
    <dc:description>A satirical novel about a London borough.</dc:description>
    <dc:subject>Political satire</dc:subject>
    <dc:subject>London (England) -- Fiction</dc:subject>
    <dc:source>https://www.gutenberg.org/ebooks/20058</dc:source>
    <meta property="se:word-count">55000</meta>
    <meta property="se:reading-ease.flesch">72.5</meta>
    <meta property="se:subject">Fiction</meta>
  </metadata>
  <manifest>
    <item href="text/titlepage.xhtml" id="titlepage.xhtml" media-type="application/xhtml+xml"/>
    <item href="text/chapter-1.xhtml" id="chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item href="text/chapter-2.xhtml" id="chapter-2.xhtml" media-type="application/xhtml+xml"/>
    <item href="toc.xhtml" id="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="titlepage.xhtml"/>
    <itemref idref="chapter-1.xhtml"/>
    <itemref idref="chapter-2.xhtml"/>
  </spine>
</package>`;

  test('extracts book title', () => {
    const { metadata } = parseContentOpf(sampleOpf);
    expect(metadata.title).toBe('The Napoleon of Notting Hill');
  });

  test('extracts author', () => {
    const { metadata } = parseContentOpf(sampleOpf);
    expect(metadata.author).toBe('G. K. Chesterton');
  });

  test('extracts language', () => {
    const { metadata } = parseContentOpf(sampleOpf);
    expect(metadata.language).toBe('en-GB');
  });

  test('extracts description', () => {
    const { metadata } = parseContentOpf(sampleOpf);
    expect(metadata.description).toBe('A satirical novel about a London borough.');
  });

  test('extracts word count', () => {
    const { metadata } = parseContentOpf(sampleOpf);
    expect(metadata.wordCount).toBe(55000);
  });

  test('extracts reading ease', () => {
    const { metadata } = parseContentOpf(sampleOpf);
    expect(metadata.readingEase).toBe(72.5);
  });

  test('extracts subjects', () => {
    const { metadata } = parseContentOpf(sampleOpf);
    expect(metadata.subjects).toEqual(['Political satire', 'London (England) -- Fiction']);
  });

  test('extracts SE subjects', () => {
    const { metadata } = parseContentOpf(sampleOpf);
    expect(metadata.seSubjects).toEqual(['Fiction']);
  });

  test('extracts source URLs', () => {
    const { metadata } = parseContentOpf(sampleOpf);
    expect(metadata.sourceUrls).toEqual(['https://www.gutenberg.org/ebooks/20058']);
  });

  test('extracts spine in order', () => {
    const { spine } = parseContentOpf(sampleOpf);
    expect(spine).toHaveLength(3);
    expect(spine[0].href).toBe('text/titlepage.xhtml');
    expect(spine[1].href).toBe('text/chapter-1.xhtml');
    expect(spine[2].href).toBe('text/chapter-2.xhtml');
  });

  test('builds manifest map', () => {
    const { manifest } = parseContentOpf(sampleOpf);
    expect(manifest.get('chapter-1.xhtml')).toBe('text/chapter-1.xhtml');
    expect(manifest.get('toc.xhtml')).toBe('toc.xhtml');
  });
});

describe('parseTocXhtml', () => {
  const sampleToc = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc">
    <h2>Table of Contents</h2>
    <ol>
      <li><a href="text/book-1.xhtml">Book I</a>
        <ol>
          <li><a href="text/book-1.xhtml#chapter-1-1">I: The Art of Prophecy</a></li>
          <li><a href="text/book-1.xhtml#chapter-1-2">II: The Man in Green</a></li>
        </ol>
      </li>
      <li><a href="text/book-2.xhtml">Book II</a></li>
    </ol>
  </nav>
</body>
</html>`;

  test('parses top-level entries', () => {
    const entries = parseTocXhtml(sampleToc);
    expect(entries).toHaveLength(2);
    expect(entries[0].label).toBe('Book I');
    expect(entries[1].label).toBe('Book II');
  });

  test('parses nested entries', () => {
    const entries = parseTocXhtml(sampleToc);
    expect(entries[0].children).toHaveLength(2);
    expect(entries[0].children[0].label).toBe('I: The Art of Prophecy');
    expect(entries[0].children[0].href).toBe('text/book-1.xhtml#chapter-1-1');
  });

  test('leaf entries have no children', () => {
    const entries = parseTocXhtml(sampleToc);
    expect(entries[1].children).toHaveLength(0);
  });
});

// ── XHTML → ProseMirror parser tests ─────────────────────────

describe('parseXhtmlFile', () => {
  test('parses a simple chapter with paragraphs', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Chapter 1</title></head>
<body epub:type="bodymatter z3998:fiction">
  <section id="chapter-1" epub:type="chapter">
    <h2 epub:type="ordinal z3998:roman">I</h2>
    <p>The human race, to which so many of my readers belong, has been playing at children's games from the beginning.</p>
    <p>And the third thing is this: that one of these three games is ending.</p>
  </section>
</body>
</html>`;

    const sections = parseXhtmlFile(xhtml, 'chapter-1.xhtml');
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe('chapter-1');
    expect(sections[0].sectionType).toBe('chapter');

    // Should have 2 paragraphs (heading is extracted as title, not content)
    expect(sections[0].content.length).toBeGreaterThanOrEqual(2);
    const paragraphs = sections[0].content.filter((n) => n.type === 'paragraph');
    expect(paragraphs.length).toBe(2);
  });

  test('parses inline formatting (em, strong)', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Test</title></head>
<body>
  <section id="test" epub:type="chapter">
    <h2>Test</h2>
    <p>This has <em>emphasized</em> and <strong>bold</strong> text.</p>
  </section>
</body>
</html>`;

    const sections = parseXhtmlFile(xhtml, 'test.xhtml');
    const paragraph = sections[0].content.find((n) => n.type === 'paragraph');
    expect(paragraph).toBeDefined();
    expect(paragraph!.content).toBeDefined();

    // Find em-marked text
    const emNode = paragraph!.content!.find((n) => n.marks?.some((m) => m.type === 'em'));
    expect(emNode).toBeDefined();
    expect(emNode!.text).toBe('emphasized');

    // Find strong-marked text
    const strongNode = paragraph!.content!.find((n) => n.marks?.some((m) => m.type === 'strong'));
    expect(strongNode).toBeDefined();
    expect(strongNode!.text).toBe('bold');
  });

  test('parses blockquotes', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Test</title></head>
<body>
  <section id="test" epub:type="chapter">
    <h2>Test</h2>
    <blockquote>
      <p>A quoted paragraph.</p>
    </blockquote>
  </section>
</body>
</html>`;

    const sections = parseXhtmlFile(xhtml, 'test.xhtml');
    const blockquote = sections[0].content.find((n) => n.type === 'blockquote');
    expect(blockquote).toBeDefined();
    expect(blockquote!.content![0].type).toBe('paragraph');
  });

  test('parses horizontal rules', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Test</title></head>
<body>
  <section id="test" epub:type="chapter">
    <h2>Test</h2>
    <p>Before the break.</p>
    <hr/>
    <p>After the break.</p>
  </section>
</body>
</html>`;

    const sections = parseXhtmlFile(xhtml, 'test.xhtml');
    const hr = sections[0].content.find((n) => n.type === 'horizontal_rule');
    expect(hr).toBeDefined();
  });

  test('parses nested sections (part with chapters)', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Book I</title></head>
<body epub:type="bodymatter">
  <section id="book-1" epub:type="part">
    <h2>Book I</h2>
    <section id="chapter-1-1" epub:type="chapter">
      <h3>I: The Art of Prophecy</h3>
      <p>The human race has been playing at children's games.</p>
    </section>
    <section id="chapter-1-2" epub:type="chapter">
      <h3>II: The Man in Green</h3>
      <p>The walking man was tall and handsome.</p>
    </section>
  </section>
</body>
</html>`;

    const sections = parseXhtmlFile(xhtml, 'book-1.xhtml');
    expect(sections).toHaveLength(1);
    expect(sections[0].sectionType).toBe('part');
    expect(sections[0].children).toHaveLength(2);
    expect(sections[0].children[0].sectionType).toBe('chapter');
    expect(sections[0].children[1].id).toBe('chapter-1-2');
  });

  test('parses lists', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Test</title></head>
<body>
  <section id="test" epub:type="chapter">
    <h2>Test</h2>
    <ul>
      <li>First item</li>
      <li>Second item</li>
    </ul>
  </section>
</body>
</html>`;

    const sections = parseXhtmlFile(xhtml, 'test.xhtml');
    const list = sections[0].content.find((n) => n.type === 'bullet_list');
    expect(list).toBeDefined();
    expect(list!.content).toHaveLength(2);
    expect(list!.content![0].type).toBe('list_item');
  });

  test('parses poetry blocks as blockquotes', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Test</title></head>
<body>
  <section id="test" epub:type="chapter">
    <h2>Test</h2>
    <blockquote epub:type="z3998:poem">
      <p>
        <span>Roses are red,</span>
        <br/>
        <span>Violets are blue.</span>
      </p>
    </blockquote>
  </section>
</body>
</html>`;

    const sections = parseXhtmlFile(xhtml, 'test.xhtml');
    const blockquote = sections[0].content.find((n) => n.type === 'blockquote');
    expect(blockquote).toBeDefined();

    // Should record a parity gap for poetry
    const gaps = getAndClearGaps();
    expect(gaps.some((g) => g.feature === 'Poetry/Verse')).toBe(true);
  });

  test('parses dedication sections', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Dedication</title></head>
<body epub:type="frontmatter">
  <section id="dedication" epub:type="dedication">
    <p>To my dear friend.</p>
  </section>
</body>
</html>`;

    const sections = parseXhtmlFile(xhtml, 'dedication.xhtml');
    expect(sections).toHaveLength(1);
    expect(sections[0].sectionType).toBe('dedication');
  });

  test('handles abbreviations by extracting text', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Test</title></head>
<body>
  <section id="test" epub:type="chapter">
    <h2>Test</h2>
    <p><abbr epub:type="z3998:name-title">Mr.</abbr> Smith went to town.</p>
  </section>
</body>
</html>`;

    const sections = parseXhtmlFile(xhtml, 'test.xhtml');
    const paragraph = sections[0].content.find((n) => n.type === 'paragraph');
    const allText = paragraph!.content!.map((n) => n.text).join('');
    expect(allText).toContain('Mr.');
    expect(allText).toContain('Smith');
  });

  test('handles endnote references as superscript', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Test</title></head>
<body>
  <section id="test" epub:type="chapter">
    <h2>Test</h2>
    <p>Some text<a href="endnotes.xhtml#note-1" epub:type="noteref">1</a> with a note.</p>
  </section>
</body>
</html>`;

    const sections = parseXhtmlFile(xhtml, 'test.xhtml');
    const paragraph = sections[0].content.find((n) => n.type === 'paragraph');

    // Should have a superscript node for the noteref
    const supNode = paragraph!.content!.find((n) => n.marks?.some((m) => m.type === 'sup'));
    expect(supNode).toBeDefined();
    expect(supNode!.text).toBe('1');

    // Should record a parity gap
    const gaps = getAndClearGaps();
    expect(gaps.some((g) => g.feature === 'Footnotes/Endnotes')).toBe(true);
  });
});

// ── hgroup parsing tests ─────────────────────────────────────

describe('hgroup extraction', () => {
  test('extracts title from hgroup with ordinal + title', () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Chapter</title></head>
<body>
  <section id="chapter-1" epub:type="chapter">
    <hgroup>
      <h3 epub:type="ordinal z3998:roman">I</h3>
      <p epub:type="title">Introductory Remarks on the Art of Prophecy</p>
    </hgroup>
    <p>Content here.</p>
  </section>
</body>
</html>`;

    const sections = parseXhtmlFile(xhtml, 'test.xhtml');
    expect(sections[0].title).toContain('I');
    expect(sections[0].title).toContain('Introductory Remarks on the Art of Prophecy');
  });
});
