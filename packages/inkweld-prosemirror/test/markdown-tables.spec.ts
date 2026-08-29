/**
 * GFM table support in the markdown ⇄ canonical-XML converters.
 *
 * Tables reach Inkweld from three directions — the MCP mutation tools,
 * document import, and the publish pipeline's markdown output — so both
 * directions and the round-trip between them are covered here.
 */
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import { markdownToXml, xmlToMarkdown } from '../src/markdown';
import { applyXmlToYjsFragment, serializeYjsFragmentToXml } from '../src/xml';

const SIMPLE = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n');

// ---------------------------------------------------------------------------
// markdownToXml
// ---------------------------------------------------------------------------

describe('markdownToXml — tables', () => {
  it('converts a header row to table_header and body rows to table_cell', () => {
    const xml = markdownToXml(SIMPLE);
    expect(xml).toBe(
      '<table>' +
        '<table_row><table_header><paragraph>A</paragraph></table_header>' +
        '<table_header><paragraph>B</paragraph></table_header></table_row>' +
        '<table_row><table_cell><paragraph>1</paragraph></table_cell>' +
        '<table_cell><paragraph>2</paragraph></table_cell></table_row>' +
        '</table>'
    );
  });

  it('maps delimiter-row colons to per-column alignment', () => {
    const xml = markdownToXml('| L | C | R | D |\n| :-- | :-: | --: | --- |\n| 1 | 2 | 3 | 4 |');
    expect(xml).toContain('<table_header align="left">');
    expect(xml).toContain('<table_header align="center">');
    expect(xml).toContain('<table_header align="right">');
    // An undecorated column carries no align attribute at all.
    expect(xml).toContain('<table_header><paragraph>D</paragraph></table_header>');
  });

  it('pads short rows and truncates long ones to the header width', () => {
    const xml = markdownToXml('| A | B | C |\n| --- | --- | --- |\n| 1 |\n| 1 | 2 | 3 | 4 |');
    const rows = xml.split('</table_row>').filter((r) => r.includes('<table_row>'));
    // Header + 2 body rows, each exactly 3 cells wide.
    expect(rows).toHaveLength(3);
    for (const row of rows.slice(1)) {
      expect(row.split('<table_cell').length - 1).toBe(3);
    }
  });

  it('gives an empty cell a paragraph so cellContent="paragraph+" is satisfied', () => {
    const xml = markdownToXml('| A | B |\n| --- | --- |\n| 1 |');
    expect(xml).toContain('<table_cell><paragraph></paragraph></table_cell>');
  });

  it('treats a backslash-escaped pipe as literal cell text, not a separator', () => {
    const xml = markdownToXml('| A | B |\n| --- | --- |\n| C \\| D | 2 |');
    expect(xml).toContain('<paragraph>C | D</paragraph>');
    expect(xml).not.toContain('<paragraph>C </paragraph>');
  });

  it('parses inline marks inside cells', () => {
    const xml = markdownToXml('| A |\n| --- |\n| **b** and `c` |');
    expect(xml).toContain('<strong>b</strong>');
    expect(xml).toContain('<code>c</code>');
  });

  it('starts a table immediately after a paragraph with no blank line', () => {
    const xml = markdownToXml(`Intro\n${SIMPLE}`);
    expect(xml).toBe(`<paragraph>Intro</paragraph>${markdownToXml(SIMPLE)}`);
  });

  it('still reads --- as a setext underline when no pipes are present', () => {
    expect(markdownToXml('Title\n---')).toBe('<heading level="2">Title</heading>');
  });

  it('still reads a standalone --- as a thematic break', () => {
    expect(markdownToXml('a\n\n---\n\nb')).toContain('<horizontal_rule/>');
  });

  it('rejects a delimiter row whose column count differs from the header', () => {
    const xml = markdownToXml('| A | B |\n| --- |\n| 1 | 2 |');
    expect(xml).not.toContain('<table>');
  });

  it('rejects a pipe-less line as a header row', () => {
    expect(markdownToXml('A\n---:\n')).not.toContain('<table>');
  });
});

// ---------------------------------------------------------------------------
// xmlToMarkdown
// ---------------------------------------------------------------------------

describe('xmlToMarkdown — tables', () => {
  it('emits a GFM table with a delimiter row', () => {
    expect(xmlToMarkdown(markdownToXml(SIMPLE))).toBe(SIMPLE);
  });

  it('re-escapes pipes that appear in cell text', () => {
    const md = xmlToMarkdown(
      '<table><table_row><table_header><paragraph>A | B</paragraph></table_header></table_row></table>'
    );
    expect(md).toContain(String.raw`A \| B`);
  });

  it('expands colspan into trailing empty cells to keep rows rectangular', () => {
    const md = xmlToMarkdown(
      '<table>' +
        '<table_row><table_header colspan="2"><paragraph>Wide</paragraph></table_header></table_row>' +
        '<table_row><table_cell><paragraph>1</paragraph></table_cell>' +
        '<table_cell><paragraph>2</paragraph></table_cell></table_row>' +
        '</table>'
    );
    const widths = md.split('\n').map((l) => l.split('|').length);
    expect(new Set(widths).size).toBe(1);
  });

  it('joins multiple paragraphs in one cell with <br/>', () => {
    const md = xmlToMarkdown(
      '<table><table_row><table_cell><paragraph>one</paragraph>' +
        '<paragraph>two</paragraph></table_cell></table_row></table>'
    );
    expect(md).toContain('one<br/>two');
  });

  it('accepts the tr/td/th tag aliases', () => {
    const md = xmlToMarkdown('<table><tr><th><paragraph>A</paragraph></th></tr>' + '<tr><td><paragraph>1</paragraph></td></tr></table>');
    expect(md).toBe('| A |\n| --- |\n| 1 |');
  });

  it('renders an empty table as an empty string rather than a stray delimiter', () => {
    expect(xmlToMarkdown('<table></table>')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

describe('table round trip', () => {
  it('is byte-stable across markdown → xml → markdown → xml', () => {
    const md = [
      '| Name | Role | Age |',
      '| :--- | :---: | ---: |',
      '| Alice | **Admin** | 30 |',
      String.raw`| C \| D | ` + '`code`' + ' | 1 |',
    ].join('\n');

    const once = xmlToMarkdown(markdownToXml(md));
    expect(once).toBe(md);
    expect(xmlToMarkdown(markdownToXml(once))).toBe(once);
  });

  it('survives the Yjs sync path without collapsing empty cells', () => {
    // An empty cell must round-trip as a real element. If it collapsed to a
    // self-closing <table_cell/> it would be dropped on re-parse, leaving
    // the row one column short and the table ragged.
    const xml = markdownToXml('| A | B |\n| --- | --- |\n| 1 |');

    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('prosemirror');
    applyXmlToYjsFragment(Y, doc, fragment, xml);

    const serialized = serializeYjsFragmentToXml(Y, fragment);
    expect(serialized).toBe(xml);
    // Both cells still present after the round trip; the second is empty.
    expect(xmlToMarkdown(serialized).split('\n')[2]).toBe('| 1 |  |');
  });
});
