/**
 * Tests for the heading-based section helpers in `src/xml/sections.ts`.
 */
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  describeSection,
  findSection,
  outlineSections,
  parseXmlToYjsNodes,
  readSectionBlocks,
  sectionEditRange,
  sectionXml,
  type DocumentSection,
  type SectionBlock,
} from '../src/xml';

const h = (level: number, text: string): SectionBlock => ({
  name: 'heading',
  level,
  xml: `<heading level="${level}">${text}</heading>`,
});
const p = (text: string): SectionBlock => ({ name: 'paragraph', xml: `<paragraph>${text}</paragraph>` });

/**
 * 0 intro              (preamble)
 * 1 # Part One
 * 2 ## Chapter 1
 * 3 text
 * 4 ## Chapter 2
 * 5 text
 * 6 # Part Two
 * 7 ## Chapter 1
 * 8 text
 */
const book: SectionBlock[] = [
  p('intro'),
  h(1, 'Part One'),
  h(2, 'Chapter 1'),
  p('one'),
  h(2, 'Chapter 2'),
  p('two'),
  h(1, 'Part Two'),
  h(2, 'Chapter 1'),
  p('three'),
];

function summary(sections: DocumentSection[]) {
  return sections.map(({ index, level, heading, start, end }) => ({
    index,
    level,
    heading,
    start,
    end,
  }));
}

describe('outlineSections', () => {
  it('numbers headings from 1 and runs each section to the next heading of the same or higher level', () => {
    const sections = outlineSections(book);
    expect(summary(sections)).toEqual([
      { index: 0, level: 0, heading: '', start: 0, end: 1 },
      { index: 1, level: 1, heading: 'Part One', start: 1, end: 6 },
      { index: 2, level: 2, heading: 'Chapter 1', start: 2, end: 4 },
      { index: 3, level: 2, heading: 'Chapter 2', start: 4, end: 6 },
      { index: 4, level: 1, heading: 'Part Two', start: 6, end: 9 },
      { index: 5, level: 2, heading: 'Chapter 1', start: 7, end: 9 },
    ]);
    expect(sections[5].path).toEqual(['Part Two', 'Chapter 1']);
    expect(sections[0].path).toEqual([]);
  });

  it('gives a document without headings a single preamble section', () => {
    expect(summary(outlineSections([p('a'), p('b')]))).toEqual([
      { index: 0, level: 0, heading: '', start: 0, end: 2 },
    ]);
    expect(summary(outlineSections([]))).toEqual([
      { index: 0, level: 0, heading: '', start: 0, end: 0 },
    ]);
  });

  it('has an empty preamble when the document starts with a heading', () => {
    const sections = outlineSections([h(1, 'Start'), p('x')]);
    expect(sections[0]).toMatchObject({ start: 0, end: 0 });
    expect(sections[1]).toMatchObject({ start: 0, end: 2 });
  });

  it('nests a deeper heading that follows a skipped level, and closes it at a shallower one', () => {
    const sections = outlineSections([h(1, 'A'), h(3, 'Deep'), p('x'), h(2, 'B'), p('y')]);
    expect(sections.map((s) => s.path.join(' > '))).toEqual(['', 'A', 'A > Deep', 'A > B']);
    expect(sections[2]).toMatchObject({ start: 1, end: 3 });
    expect(sections[1]).toMatchObject({ start: 0, end: 5 });
  });

  it('treats a missing or invalid level as level 1 and collapses heading whitespace', () => {
    const sections = outlineSections([
      { name: 'heading', xml: '<heading>  Odd\n  <bold>one</bold> &amp; more </heading>' },
      { name: 'heading', level: 9, xml: '<heading level="9">Nine</heading>' },
    ]);
    expect(sections[1]).toMatchObject({ level: 1, heading: 'Odd one & more' });
    expect(sections[2]).toMatchObject({ level: 1, path: ['Nine'] });
  });
});

describe('findSection', () => {
  const sections = outlineSections(book);

  it('finds a unique heading ignoring case, spacing and leading #s', () => {
    expect(findSection(sections, { heading: 'chapter 2' })).toEqual({ section: sections[3] });
    expect(findSection(sections, { heading: '  ##  Chapter   2 ' })).toEqual({
      section: sections[3],
    });
  });

  it('reports every match for an ambiguous heading', () => {
    const lookup = findSection(sections, { heading: 'Chapter 1' });
    expect(lookup).toEqual({
      error:
        '2 headings match "Chapter 1": [2] Part One > Chapter 1; [5] Part Two > Chapter 1. Pass sectionIndex, or a longer path.',
    });
  });

  it('narrows by a path of headings', () => {
    expect(findSection(sections, { heading: 'Part Two > Chapter 1' })).toEqual({
      section: sections[5],
    });
    expect(findSection(sections, { heading: 'part one>chapter 1' })).toEqual({
      section: sections[2],
    });
    expect('error' in findSection(sections, { heading: 'Part Three > Chapter 1' })).toBe(true);
    expect('error' in findSection(sections, { heading: 'X > Part One > Chapter 1' })).toBe(true);
    expect('error' in findSection(sections, { heading: ' > Chapter 1' })).toBe(true);
  });

  it('prefers a heading whose own text contains ">"', () => {
    const odd = outlineSections([h(1, 'A &gt; B'), h(1, 'B')]);
    expect(findSection(odd, { heading: 'A > B' })).toEqual({ section: odd[1] });
  });

  it('lists the headings when nothing matches', () => {
    const lookup = findSection(sections, { heading: 'Epilogue' });
    expect('error' in lookup && lookup.error).toContain('no heading matches "Epilogue"');
    expect('error' in lookup && lookup.error).toContain('[4] Part Two');
  });

  it('caps the list of headings in a no-match error', () => {
    const many = outlineSections(Array.from({ length: 35 }, (_, i) => h(1, `H${i}`)));
    const lookup = findSection(many, { heading: 'missing' });
    expect('error' in lookup && lookup.error).toContain('[30] H29; …');
    expect('error' in lookup && lookup.error).not.toContain('H30');
  });

  it('points a document without headings at section 0', () => {
    const lookup = findSection(outlineSections([p('x')]), { heading: 'Anything' });
    expect('error' in lookup && lookup.error).toContain('Use sectionIndex 0');
  });

  it('finds a section by index, including the preamble', () => {
    expect(findSection(sections, { index: 0 })).toEqual({ section: sections[0] });
    expect(findSection(sections, { index: 4 })).toEqual({ section: sections[4] });
  });

  it('rejects an index out of range or not whole', () => {
    for (const index of [6, -1, 1.5]) {
      const lookup = findSection(sections, { index });
      expect('error' in lookup && lookup.error).toContain('out of range');
    }
  });

  it('checks that a heading given with an index names the same section', () => {
    expect(findSection(sections, { index: 3, heading: 'Chapter 2' })).toEqual({
      section: sections[3],
    });
    const lookup = findSection(sections, { index: 2, heading: 'Chapter 2' });
    expect('error' in lookup && lookup.error).toBe(
      'section 2 is "Chapter 1", not "Chapter 2". The document may have changed; read its outline again.'
    );
    expect('error' in findSection(sections, { index: 0, heading: 'Part One' })).toBe(true);
  });

  it('needs a heading or an index', () => {
    expect('error' in findSection(sections, {})).toBe(true);
    expect('error' in findSection(sections, { heading: '   ' })).toBe(true);
  });
});

describe('sectionEditRange', () => {
  const sections = outlineSections(book);
  const partOne = sections[1];
  const preamble = sections[0];

  it('covers the heading, the body or neither, depending on the operation', () => {
    expect(sectionEditRange(partOne, 'replace')).toEqual({ index: 1, deleteCount: 5 });
    expect(sectionEditRange(partOne, 'delete')).toEqual({ index: 1, deleteCount: 5 });
    expect(sectionEditRange(partOne, 'replace_body')).toEqual({ index: 2, deleteCount: 4 });
    expect(sectionEditRange(partOne, 'prepend')).toEqual({ index: 2, deleteCount: 0 });
    expect(sectionEditRange(partOne, 'append')).toEqual({ index: 6, deleteCount: 0 });
    expect(sectionEditRange(partOne, 'insert_before')).toEqual({ index: 1, deleteCount: 0 });
  });

  it('treats the preamble as a section without a heading', () => {
    expect(sectionEditRange(preamble, 'replace_body')).toEqual({ index: 0, deleteCount: 1 });
    expect(sectionEditRange(preamble, 'prepend')).toEqual({ index: 0, deleteCount: 0 });
    expect(sectionEditRange(preamble, 'append')).toEqual({ index: 1, deleteCount: 0 });
  });
});

describe('sectionXml and describeSection', () => {
  const sections = outlineSections(book);

  it('joins the XML of the section blocks', () => {
    expect(sectionXml(book, sections[3])).toBe(
      '<heading level="2">Chapter 2</heading><paragraph>two</paragraph>'
    );
    expect(sectionXml(book, sections[0])).toBe('<paragraph>intro</paragraph>');
  });

  it('names the preamble and quotes headings', () => {
    expect(describeSection(sections[0])).toBe('the content before the first heading');
    expect(describeSection(sections[3])).toBe('"Chapter 2"');
  });
});

describe('readSectionBlocks', () => {
  it('describes the top-level children of a Y.XmlFragment', () => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('prosemirror');
    fragment.insert(
      0,
      parseXmlToYjsNodes(
        Y,
        '<paragraph>intro</paragraph><heading level="2">Title</heading><blockquote><heading level="1">Quoted</heading></blockquote>'
      )
    );
    // A level stored as a number, as y-prosemirror writes it.
    const numeric = new Y.XmlElement('heading');
    numeric.setAttribute('level', 3 as unknown as string);
    numeric.insert(0, [new Y.XmlText('Numeric')]);
    fragment.push([numeric, new Y.XmlText('stray')]);

    const blocks = readSectionBlocks(fragment);
    expect(blocks.map(({ name, level }) => ({ name, level }))).toEqual([
      { name: 'paragraph', level: undefined },
      { name: 'heading', level: 2 },
      { name: 'blockquote', level: undefined },
      { name: 'heading', level: 3 },
      { name: '#text', level: undefined },
    ]);
    expect(blocks[1].xml).toBe('<heading level="2">Title</heading>');

    // The heading inside the blockquote does not start a section.
    const sections = outlineSections(blocks);
    expect(sections.map((s) => s.heading)).toEqual(['', 'Title', 'Numeric']);
    expect(sections[1]).toMatchObject({ start: 1, end: 5 });
  });
});
