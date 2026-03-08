/**
 * Converts Standard Ebooks XHTML content to ProseMirror JSON nodes.
 *
 * This parser handles the SE-specific XHTML conventions:
 * - epub:type semantic annotations
 * - Nested <section> elements for parts/chapters
 * - <hgroup> headings with ordinals and titles
 * - Poetry/verse blocks
 * - Abbreviations (<abbr>)
 * - Endnote references
 *
 * ── Parity Gaps (SE features → Inkweld) ──
 *
 * 1. FOOTNOTES/ENDNOTES: SE uses <a epub:type="noteref"> linking to endnotes.xhtml.
 *    Inkweld has no footnote/endnote system. We convert these to superscript text
 *    with the note content appended. (LIMITATION)
 *
 * 2. POETRY/VERSE: SE uses <blockquote epub:type="z3998:poem"> with <span>-per-line.
 *    Inkweld has no dedicated verse/poetry node. We convert to blockquote with
 *    hard_break-separated lines. Stanza structure and indentation classes are lost. (WARNING)
 *
 * 3. IMAGES: SE cover art is SVG. Inkweld images expect raster src URLs.
 *    We skip SE-specific images (cover, titlepage, logo). (INFO)
 *
 * 4. ALIGNMENT/INDENT: SE uses CSS classes for text alignment (e.g. centered dedication).
 *    ProseMirror paragraph nodes support `align` attr but we don't extract CSS classes. (INFO)
 *
 * 5. LANGUAGE MARKUP: SE marks foreign-language phrases with xml:lang.
 *    Inkweld has no language annotation marks. Foreign text is preserved as plain italic. (INFO)
 *
 * 6. SEMANTIC ROLES: epub:type annotations (z3998:letter, z3998:sender, etc.) carry
 *    rich semantic meaning that has no equivalent in ProseMirror. (INFO)
 *
 * 7. TABLES: Some SE books contain HTML tables. Inkweld ProseMirror schema has no
 *    table node. We convert to plain text with separators. (LIMITATION)
 *
 * 8. DEFINITION LISTS: <dl>/<dt>/<dd> have no ProseMirror equivalent.
 *    Converted to bold term + indented paragraph. (LIMITATION)
 */

import { XMLParser } from 'fast-xml-parser';
import type { ProseMirrorMark, ProseMirrorNode, ParityGap, SESection, SESectionType } from './types.js';

/** Accumulated parity gaps found during parsing */
const gaps: ParityGap[] = [];

/** Get and clear accumulated parity gaps */
export function getAndClearGaps(): ParityGap[] {
  const result = [...gaps];
  gaps.length = 0;
  return result;
}

function addGap(severity: ParityGap['severity'], feature: string, description: string) {
  // Deduplicate by feature name
  if (!gaps.some((g) => g.feature === feature)) {
    gaps.push({ severity, feature, description });
  }
}

// XML parser configured for XHTML
const xhtmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  preserveOrder: true,
  trimValues: false,
  // We need preserveOrder to maintain document structure
});

/**
 * Parse a Standard Ebooks XHTML file into sections.
 * Each file may contain one or more nested sections (e.g. a book containing chapters).
 *
 * Uses fast-xml-parser in preserveOrder mode. In this mode, the parsed output
 * is an array of objects. Each object has a single tag-name key whose value is
 * an array of child nodes, and an optional `:@` key holding attributes.
 *
 * Example structure: [{ html: [...children...], ':@': { '@_xmlns': '...' } }]
 */
export function parseXhtmlFile(xhtml: string, sourceFile: string): SESection[] {
  const parsed = xhtmlParser.parse(xhtml) as unknown[];

  // Find <html> node
  const htmlNode = findNode(parsed, 'html');
  if (!htmlNode) return [];
  const htmlChildren = (htmlNode['html'] as unknown[]) || [];

  // Find <body> node inside <html>
  const bodyNode = findNode(htmlChildren, 'body');
  if (!bodyNode) return [];
  const bodyChildren = (bodyNode['body'] as unknown[]) || [];

  return parseSectionsPreserved(bodyChildren, sourceFile);
}

/**
 * Find a node by tag name in a preserveOrder array.
 * Returns the full node object (including :@ attrs).
 */
function findNode(nodes: unknown[], tagName: string): Record<string, unknown> | undefined {
  for (const node of nodes) {
    if (node && typeof node === 'object' && tagName in (node as Record<string, unknown>)) {
      return node as Record<string, unknown>;
    }
  }
  return undefined;
}

function parseSectionsPreserved(nodes: unknown[], sourceFile: string): SESection[] {
  const sections: SESection[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const obj = node as Record<string, unknown>;

    if ('section' in obj) {
      const attrs = (obj[':@'] as Record<string, unknown>) || {};
      const epubType = String(attrs['@_epub:type'] || '');
      const id = String(attrs['@_id'] || `section-${sections.length}`);
      const sectionType = classifyEpubType(epubType);
      const children = (obj['section'] as unknown[]) || [];

      // Check for nested sections
      const nestedSections = children.filter(
        (c) => typeof c === 'object' && c !== null && 'section' in (c as Record<string, unknown>),
      );

      if (nestedSections.length > 0) {
        // This is a container (part/book) with child sections
        const title = extractHeadingFromPreserved(children);
        const contentNodes = children.filter(
          (c) => !(typeof c === 'object' && c !== null && 'section' in (c as Record<string, unknown>)),
        );
        const content = convertPreservedNodes(
          contentNodes.filter(
            (c) =>
              !(
                typeof c === 'object' &&
                c !== null &&
                ('h2' in (c as Record<string, unknown>) ||
                  'h1' in (c as Record<string, unknown>) ||
                  'hgroup' in (c as Record<string, unknown>))
              ),
          ),
        );

        sections.push({
          id,
          sectionType,
          title: title || `Part ${sections.length + 1}`,
          content,
          children: parseSectionsPreserved(nestedSections, sourceFile),
          sourceFile,
        });
      } else {
        // Leaf section (chapter, dedication, etc.)
        const title = extractHeadingFromPreserved(children);
        const nonHeadingContent = children.filter(
          (c) =>
            !(
              typeof c === 'object' &&
              c !== null &&
              ('h1' in (c as Record<string, unknown>) ||
                'h2' in (c as Record<string, unknown>) ||
                'h3' in (c as Record<string, unknown>) ||
                'h4' in (c as Record<string, unknown>) ||
                'hgroup' in (c as Record<string, unknown>))
            ),
        );
        const content = convertPreservedNodes(nonHeadingContent);

        sections.push({
          id,
          sectionType,
          title: title || sectionType,
          content,
          children: [],
          sourceFile,
        });
      }
    }
  }

  return sections;
}

/**
 * Extract the heading text from a section's preserved-order children.
 * Handles <h1>–<h6>, <hgroup>, and plain text.
 */
function extractHeadingFromPreserved(children: unknown[]): string {
  for (const child of children) {
    if (!child || typeof child !== 'object') continue;
    const obj = child as Record<string, unknown>;

    // <hgroup> contains <h*> + <p epub:type="title">
    if ('hgroup' in obj) {
      const hgroupChildren = (obj['hgroup'] as unknown[]) || [];
      const parts: string[] = [];
      for (const hc of hgroupChildren) {
        if (!hc || typeof hc !== 'object') continue;
        const hcObj = hc as Record<string, unknown>;
        for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p']) {
          if (tag in hcObj) {
            parts.push(normalizeWhitespace(extractTextFromPreserved((hcObj[tag] as unknown[]) || [])));
          }
        }
      }
      return parts.filter(Boolean).join(': ');
    }

    // Plain heading
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      if (tag in obj) {
        return normalizeWhitespace(extractTextFromPreserved((obj[tag] as unknown[]) || []));
      }
    }
  }
  return '';
}

/**
 * Recursively extract plain text from preserved-order nodes.
 */
function extractTextFromPreserved(nodes: unknown[]): string {
  let text = '';
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const obj = node as Record<string, unknown>;

    if ('#text' in obj) {
      text += String(obj['#text']);
    }

    // Recurse into inline elements (span, abbr, b, i, em, strong, a, etc.)
    for (const [key, val] of Object.entries(obj)) {
      if (key === ':@' || key === '#text') continue;
      if (Array.isArray(val)) {
        text += extractTextFromPreserved(val);
      }
    }
  }
  return text;
}

/** Collapse runs of whitespace into single spaces and trim. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Convert preserved-order XHTML nodes to ProseMirror nodes.
 */
function convertPreservedNodes(nodes: unknown[]): ProseMirrorNode[] {
  const result: ProseMirrorNode[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const obj = node as Record<string, unknown>;
    const attrs = (obj[':@'] as Record<string, unknown>) || {};

    // ── Block elements ──

    if ('p' in obj) {
      const pmNode = convertParagraph(obj['p'] as unknown[], attrs);
      if (pmNode) result.push(pmNode);
      continue;
    }

    if ('blockquote' in obj) {
      const epubType = String(attrs['@_epub:type'] || '');
      const children = (obj['blockquote'] as unknown[]) || [];

      if (epubType.includes('poem') || epubType.includes('verse')) {
        addGap(
          'warning',
          'Poetry/Verse',
          'SE poetry uses span-per-line formatting with indentation classes. ' +
            'Inkweld has no verse node — converted to blockquote with line breaks. Stanza structure is approximated.',
        );
        result.push(convertPoetryBlock(children));
      } else {
        result.push(convertBlockquote(children));
      }
      continue;
    }

    if ('hr' in obj) {
      result.push({ type: 'horizontal_rule' });
      continue;
    }

    for (const level of [1, 2, 3, 4, 5, 6]) {
      const tag = `h${level}`;
      if (tag in obj) {
        const content = convertInlineNodes((obj[tag] as unknown[]) || []);
        if (content.length > 0) {
          result.push({ type: 'heading', attrs: { level }, content });
        }
        break;
      }
    }

    if ('hgroup' in obj) {
      // Convert hgroup to a heading
      const heading = extractHeadingFromPreserved([obj]);
      if (heading) {
        result.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: heading }],
        });
      }
      continue;
    }

    if ('ul' in obj) {
      result.push(convertList('bullet_list', (obj['ul'] as unknown[]) || []));
      continue;
    }

    if ('ol' in obj) {
      result.push(convertList('ordered_list', (obj['ol'] as unknown[]) || []));
      continue;
    }

    if ('table' in obj) {
      addGap(
        'limitation',
        'Tables',
        'SE books may contain HTML tables. Inkweld ProseMirror schema has no table node. ' +
          'Tables are converted to plain-text paragraphs.',
      );
      result.push(...convertTable(obj['table'] as unknown[]));
      continue;
    }

    if ('dl' in obj) {
      addGap(
        'limitation',
        'Definition Lists',
        'SE uses <dl>/<dt>/<dd> for glossaries/definitions. No ProseMirror equivalent — ' +
          'converted to bold term + paragraph.',
      );
      result.push(...convertDefinitionList(obj['dl'] as unknown[]));
      continue;
    }

    if ('figure' in obj) {
      // Figures may contain images or poetry — recurse into children
      const figChildren = (obj['figure'] as unknown[]) || [];
      result.push(...convertPreservedNodes(figChildren));
      continue;
    }

    if ('header' in obj) {
      const headerChildren = (obj['header'] as unknown[]) || [];
      result.push(...convertPreservedNodes(headerChildren));
      continue;
    }

    if ('footer' in obj) {
      const footerChildren = (obj['footer'] as unknown[]) || [];
      result.push(...convertPreservedNodes(footerChildren));
      continue;
    }

    if ('div' in obj) {
      const divChildren = (obj['div'] as unknown[]) || [];
      result.push(...convertPreservedNodes(divChildren));
      continue;
    }

    // Skip processing instructions and XML declarations
    if ('?xml' in obj) continue;

    // If we encounter a section, recurse (shouldn't normally happen here but safety)
    if ('section' in obj) {
      const sectionChildren = (obj['section'] as unknown[]) || [];
      result.push(...convertPreservedNodes(sectionChildren));
      continue;
    }
  }

  return result;
}

/** Convert a <p> element to a ProseMirror paragraph. */
function convertParagraph(children: unknown[], attrs: Record<string, unknown>): ProseMirrorNode | null {
  const epubType = String(attrs['@_epub:type'] || '');

  // Skip SE boilerplate paragraphs we don't need
  if (epubType.includes('bridgehead')) {
    // Scene transition markers — convert to horizontal rule
    return { type: 'horizontal_rule' };
  }

  const content = convertInlineNodes(children);
  if (content.length === 0) return null;

  return { type: 'paragraph', content };
}

/** Convert a blockquote (non-poetry). */
function convertBlockquote(children: unknown[]): ProseMirrorNode {
  const innerNodes = convertPreservedNodes(children);
  // Blockquote must contain block-level content
  const blockContent =
    innerNodes.length > 0
      ? innerNodes
      : [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: '' }] }];

  return { type: 'blockquote', content: blockContent };
}

/** Convert a poetry/verse blockquote. */
function convertPoetryBlock(children: unknown[]): ProseMirrorNode {
  const stanzas: ProseMirrorNode[] = [];

  for (const child of children) {
    if (!child || typeof child !== 'object') continue;
    const obj = child as Record<string, unknown>;

    if ('p' in obj) {
      // Each <p> in a poem is a stanza; <span> or <br/> separates lines
      const lines = extractPoetryLines((obj['p'] as unknown[]) || []);
      const content: ProseMirrorNode[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (i > 0) content.push({ type: 'hard_break' });
        content.push({ type: 'text', text: lines[i], marks: [{ type: 'em' }] });
      }

      if (content.length > 0) {
        stanzas.push({ type: 'paragraph', content });
      }
    }
  }

  if (stanzas.length === 0) {
    stanzas.push({ type: 'paragraph', content: [{ type: 'text', text: '' }] });
  }

  return { type: 'blockquote', content: stanzas };
}

/** Extract individual lines from a poetry <p> element. */
function extractPoetryLines(nodes: unknown[]): string[] {
  const lines: string[] = [];
  let current = '';

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const obj = node as Record<string, unknown>;

    if ('br' in obj) {
      lines.push(current.trim());
      current = '';
      continue;
    }

    if ('span' in obj) {
      const text = extractTextFromPreserved((obj['span'] as unknown[]) || []);
      if (current && text) {
        lines.push(current.trim());
        current = text;
      } else {
        current += text;
      }
      continue;
    }

    if ('#text' in obj) {
      current += String(obj['#text']);
    }
  }

  if (current.trim()) lines.push(current.trim());
  return lines;
}

/** Convert inline XHTML nodes to ProseMirror text nodes with marks. */
function convertInlineNodes(nodes: unknown[], parentMarks: ProseMirrorMark[] = []): ProseMirrorNode[] {
  const result: ProseMirrorNode[] = [];

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const obj = node as Record<string, unknown>;
    const attrs = (obj[':@'] as Record<string, unknown>) || {};

    // Plain text
    if ('#text' in obj) {
      const text = String(obj['#text']);
      if (text) {
        const pmNode: ProseMirrorNode = { type: 'text', text };
        if (parentMarks.length > 0) pmNode.marks = [...parentMarks];
        result.push(pmNode);
      }
      continue;
    }

    // <br/> → hard_break
    if ('br' in obj) {
      result.push({ type: 'hard_break' });
      continue;
    }

    // <em> or <i> → em mark
    if ('em' in obj || 'i' in obj) {
      const tag = 'em' in obj ? 'em' : 'i';
      const marks = addMark(parentMarks, { type: 'em' });
      result.push(...convertInlineNodes((obj[tag] as unknown[]) || [], marks));
      continue;
    }

    // <strong> or <b> → strong mark
    if ('strong' in obj || 'b' in obj) {
      const tag = 'strong' in obj ? 'strong' : 'b';
      const marks = addMark(parentMarks, { type: 'strong' });
      result.push(...convertInlineNodes((obj[tag] as unknown[]) || [], marks));
      continue;
    }

    // <sup> → sup mark (used for endnote refs)
    if ('sup' in obj) {
      const marks = addMark(parentMarks, { type: 'sup' });
      result.push(...convertInlineNodes((obj['sup'] as unknown[]) || [], marks));
      continue;
    }

    // <sub> → sub mark
    if ('sub' in obj) {
      const marks = addMark(parentMarks, { type: 'sub' });
      result.push(...convertInlineNodes((obj['sub'] as unknown[]) || [], marks));
      continue;
    }

    // <abbr> → pass through, extract text with parent marks
    if ('abbr' in obj) {
      result.push(...convertInlineNodes((obj['abbr'] as unknown[]) || [], parentMarks));
      continue;
    }

    // <span> → pass through (may carry epub:type but no PM equivalent)
    if ('span' in obj) {
      const epubType = String(attrs['@_epub:type'] || '');
      if (epubType.includes('noteref')) {
        addGap(
          'limitation',
          'Footnotes/Endnotes',
          'SE endnotes (epub:type="noteref") link to a separate endnotes.xhtml file. ' +
            'Inkweld has no footnote system — note references are converted to superscript text.',
        );
        // Convert noteref to superscript
        const text = extractTextFromPreserved((obj['span'] as unknown[]) || []);
        const marks = addMark(parentMarks, { type: 'sup' });
        if (text) result.push({ type: 'text', text, marks });
        continue;
      }
      result.push(...convertInlineNodes((obj['span'] as unknown[]) || [], parentMarks));
      continue;
    }

    // <a> → link mark or noteref
    if ('a' in obj) {
      const href = String(attrs['@_href'] || '');
      const epubType = String(attrs['@_epub:type'] || '');

      if (epubType.includes('noteref')) {
        addGap(
          'limitation',
          'Footnotes/Endnotes',
          'SE endnotes (epub:type="noteref") link to a separate endnotes.xhtml file. ' +
            'Inkweld has no footnote system — note references are converted to superscript text.',
        );
        const text = extractTextFromPreserved((obj['a'] as unknown[]) || []);
        const marks = addMark(parentMarks, { type: 'sup' });
        if (text) result.push({ type: 'text', text, marks });
        continue;
      }

      // Regular link — only preserve external links, skip internal SE navigation
      if (href.startsWith('http')) {
        const marks = addMark(parentMarks, { type: 'link', attrs: { href } });
        result.push(...convertInlineNodes((obj['a'] as unknown[]) || [], marks));
      } else {
        // Internal link — just extract text
        result.push(...convertInlineNodes((obj['a'] as unknown[]) || [], parentMarks));
      }
      continue;
    }

    // <code> → code mark
    if ('code' in obj) {
      const marks = addMark(parentMarks, { type: 'code' });
      result.push(...convertInlineNodes((obj['code'] as unknown[]) || [], marks));
      continue;
    }

    // <u> → underline mark
    if ('u' in obj) {
      const marks = addMark(parentMarks, { type: 'u' });
      result.push(...convertInlineNodes((obj['u'] as unknown[]) || [], marks));
      continue;
    }

    // <s> or <del> or <strike> → strikethrough mark
    if ('s' in obj || 'del' in obj || 'strike' in obj) {
      const tag = 's' in obj ? 's' : 'del' in obj ? 'del' : 'strike';
      const marks = addMark(parentMarks, { type: 's' });
      result.push(...convertInlineNodes((obj[tag] as unknown[]) || [], marks));
      continue;
    }

    // <img> → image node
    if ('img' in obj) {
      const src = String(attrs['@_src'] || '');
      const alt = String(attrs['@_alt'] || '');
      if (src) {
        addGap(
          'info',
          'Images',
          'SE images (typically SVG cover/titlepage art) are skipped. Inkweld images expect raster URLs.',
        );
      }
      // Skip SE internal images; they're not useful in the converted project
      if (src && !src.includes('cover') && !src.includes('titlepage') && !src.includes('logo')) {
        result.push({ type: 'image', attrs: { src, alt, title: '' } });
      }
      continue;
    }

    // Fallback: try to extract text from any unrecognized element
    for (const [key, val] of Object.entries(obj)) {
      if (key === ':@') continue;
      if (Array.isArray(val)) {
        result.push(...convertInlineNodes(val, parentMarks));
      }
    }
  }

  return result;
}

/** Add a mark to a marks array, avoiding duplicates. */
function addMark(existing: ProseMirrorMark[], newMark: ProseMirrorMark): ProseMirrorMark[] {
  if (existing.some((m) => m.type === newMark.type)) return existing;
  return [...existing, newMark];
}

/** Convert a <ul> or <ol> to a list node. */
function convertList(type: 'bullet_list' | 'ordered_list', children: unknown[]): ProseMirrorNode {
  const items: ProseMirrorNode[] = [];

  for (const child of children) {
    if (!child || typeof child !== 'object') continue;
    const obj = child as Record<string, unknown>;

    if ('li' in obj) {
      const liChildren = (obj['li'] as unknown[]) || [];
      // List items must contain block content
      const blockNodes = convertPreservedNodes(liChildren);
      const inlineNodes = convertInlineNodes(liChildren);

      let content: ProseMirrorNode[];
      if (blockNodes.length > 0) {
        content = blockNodes;
      } else if (inlineNodes.length > 0) {
        content = [{ type: 'paragraph', content: inlineNodes }];
      } else {
        content = [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }];
      }

      items.push({ type: 'list_item', content });
    }
  }

  if (items.length === 0) {
    items.push({
      type: 'list_item',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
    });
  }

  return { type, content: items };
}

/** Convert an HTML table to plain-text paragraphs. */
function convertTable(children: unknown[]): ProseMirrorNode[] {
  const rows: string[] = [];

  for (const child of children) {
    if (!child || typeof child !== 'object') continue;
    const obj = child as Record<string, unknown>;

    for (const section of ['thead', 'tbody', 'tfoot', 'tr']) {
      if (section in obj) {
        const sectionChildren = (obj[section] as unknown[]) || [];
        if (section === 'tr') {
          rows.push(extractTableRow(sectionChildren));
        } else {
          for (const row of sectionChildren) {
            if (row && typeof row === 'object' && 'tr' in (row as Record<string, unknown>)) {
              rows.push(extractTableRow(((row as Record<string, unknown>)['tr'] as unknown[]) || []));
            }
          }
        }
      }
    }
  }

  return rows.map((row) => ({
    type: 'paragraph' as const,
    content: [{ type: 'text' as const, text: row }],
  }));
}

function extractTableRow(cells: unknown[]): string {
  const cellTexts: string[] = [];
  for (const cell of cells) {
    if (!cell || typeof cell !== 'object') continue;
    const obj = cell as Record<string, unknown>;
    for (const tag of ['td', 'th']) {
      if (tag in obj) {
        cellTexts.push(extractTextFromPreserved((obj[tag] as unknown[]) || []).trim());
      }
    }
  }
  return cellTexts.join(' | ');
}

/** Convert a definition list to paragraphs. */
function convertDefinitionList(children: unknown[]): ProseMirrorNode[] {
  const result: ProseMirrorNode[] = [];

  for (const child of children) {
    if (!child || typeof child !== 'object') continue;
    const obj = child as Record<string, unknown>;

    if ('dt' in obj) {
      const text = extractTextFromPreserved((obj['dt'] as unknown[]) || []);
      if (text.trim()) {
        result.push({
          type: 'paragraph',
          content: [{ type: 'text', text: text.trim(), marks: [{ type: 'strong' }] }],
        });
      }
    }

    if ('dd' in obj) {
      const text = extractTextFromPreserved((obj['dd'] as unknown[]) || []);
      if (text.trim()) {
        result.push({
          type: 'paragraph',
          content: [{ type: 'text', text: text.trim() }],
        });
      }
    }
  }

  return result;
}

/**
 * Classify an epub:type string into our section type enum.
 */
function classifyEpubType(epubType: string): SESectionType {
  const t = epubType.toLowerCase();
  if (t.includes('part') || t.includes('division') || t.includes('volume')) return 'part';
  if (t.includes('chapter')) return 'chapter';
  if (t.includes('prologue')) return 'prologue';
  if (t.includes('epilogue')) return 'epilogue';
  if (t.includes('dedication')) return 'dedication';
  if (t.includes('preface')) return 'preface';
  if (t.includes('introduction')) return 'introduction';
  if (t.includes('foreword')) return 'foreword';
  if (t.includes('afterword')) return 'afterword';
  if (t.includes('appendix')) return 'appendix';
  if (t.includes('colophon')) return 'colophon';
  if (t.includes('imprint')) return 'imprint';
  if (t.includes('titlepage')) return 'titlepage';
  if (t.includes('halftitlepage')) return 'halftitlepage';
  if (t.includes('endnotes')) return 'endnotes';
  if (t.includes('loi')) return 'loi';
  if (t.includes('uncopyright')) return 'uncopyright';
  return 'unknown';
}
