/**
 * Heading-based sections of a document, for reading and editing one part of
 * it without rewriting the rest.
 *
 * A section starts at a top-level `<heading>` and runs up to the next
 * top-level heading of the same or a higher rank (a lower or equal `level`),
 * so it includes its subsections. Blocks before the first heading form the
 * preamble, section 0; headings are numbered from 1 in document order.
 * Headings nested inside other blocks (lists, blockquotes, tables) do not
 * start sections.
 *
 * Works on plain block descriptors, so it needs no Yjs or ProseMirror
 * instance; `readSectionBlocks` builds them from a Y.XmlFragment.
 */
import { xmlContentToText } from './text';

/** One top-level block of a document, as the section helpers need it. */
export interface SectionBlock {
  /** Node name (`heading`, `paragraph`, …); `#text` for a bare top-level text run. */
  name: string;
  /** Heading level (1–6) when `name` is `heading`. */
  level?: number;
  /** The block's XML. */
  xml: string;
}

export interface DocumentSection {
  /** 0 for the preamble; headings count from 1 in document order. */
  index: number;
  /** Heading level, 0 for the preamble. */
  level: number;
  /** Heading text with whitespace collapsed; '' for the preamble. */
  heading: string;
  /** Headings from the outermost enclosing section down to this one. */
  path: string[];
  /** First block: the heading itself (0 for the preamble). */
  start: number;
  /** One past the section's last block, subsections included. */
  end: number;
}

/** Where a section can be edited; see `sectionEditRange`. */
export const SECTION_OPERATIONS = [
  'replace',
  'replace_body',
  'prepend',
  'append',
  'insert_before',
  'delete',
] as const;

export type SectionOperation = (typeof SECTION_OPERATIONS)[number];

/** How many headings a "no match" error lists. */
const MAX_LISTED_HEADINGS = 30;

/** How a section is named by a caller: heading text or path, and/or index. */
export interface SectionAddress {
  heading?: string;
  index?: number;
}

export type SectionLookup = { section: DocumentSection } | { error: string };

interface FragmentChildLike {
  nodeName?: unknown;
  getAttribute?: (name: string) => unknown;
  toString(): string;
}

/**
 * Describe the top-level children of a Y.XmlFragment (or anything with the
 * same shape). Y.XmlElement children carry `nodeName`; Y.XmlText does not.
 * Each block's XML comes from `serialize`, by default Yjs's own `toString()`;
 * pass `(child) => serializeYjsNodeToXml(Y, child)` for the canonical,
 * escaped XML that `parseXmlToYjsNodes` reads back.
 */
export function readSectionBlocks(
  fragment: { toArray(): unknown[] },
  serialize: (child: unknown) => string = (child) => (child as FragmentChildLike).toString()
): SectionBlock[] {
  return fragment.toArray().map((child) => {
    const node = child as FragmentChildLike;
    const xml = serialize(child);
    if (typeof node.nodeName !== 'string') return { name: '#text', xml };
    if (node.nodeName !== 'heading') return { name: node.nodeName, xml };
    return { name: 'heading', level: headingLevel(node.getAttribute?.('level')), xml };
  });
}

/** The preamble followed by one section per top-level heading, in document order. */
export function outlineSections(blocks: SectionBlock[]): DocumentSection[] {
  const firstHeading = blocks.findIndex((block) => block.name === 'heading');
  const sections: DocumentSection[] = [
    {
      index: 0,
      level: 0,
      heading: '',
      path: [],
      start: 0,
      end: firstHeading === -1 ? blocks.length : firstHeading,
    },
  ];

  // Open sections, outermost first. A heading closes every open section of
  // the same or a deeper level; whatever is still open runs to the end.
  const open: DocumentSection[] = [];
  blocks.forEach((block, position) => {
    if (block.name !== 'heading') return;
    const level = headingLevel(block.level);
    let innermost = open.at(-1);
    while (innermost && innermost.level >= level) {
      innermost.end = position;
      open.pop();
      innermost = open.at(-1);
    }
    const heading = headingText(block.xml);
    const section: DocumentSection = {
      index: sections.length,
      level,
      heading,
      path: [...(open.at(-1)?.path ?? []), heading],
      start: position,
      end: blocks.length,
    };
    open.push(section);
    sections.push(section);
  });

  return sections;
}

/**
 * Find the section a caller named. A heading matches its own text or, written
 * as `Part One > Chapter 2`, the end of its path; case, surrounding space and
 * leading Markdown `#`s are ignored. When both a heading and an index are
 * given they must agree, which catches an index read before the document
 * changed.
 */
export function findSection(
  sections: DocumentSection[],
  address: SectionAddress
): SectionLookup {
  const query = address.heading?.trim() ? address.heading : undefined;

  if (address.index !== undefined) {
    const section = sections[address.index];
    if (!Number.isInteger(address.index) || !section) {
      return {
        error: `sectionIndex ${address.index} is out of range: this document has sections 0 to ${
          sections.length - 1
        } (0 is the content before the first heading).`,
      };
    }
    if (query !== undefined && !headingMatches(section, query)) {
      return {
        error: `section ${section.index} is ${describeSection(section)}, not "${query}". The document may have changed; read its outline again.`,
      };
    }
    return { section };
  }

  if (query === undefined) {
    return {
      error:
        'Name the section with section (heading text, or a path like "Part One > Chapter 2") or sectionIndex.',
    };
  }

  const matches = sections.filter((section) => section.index > 0 && headingMatches(section, query));
  if (matches.length === 1) return { section: matches[0] };
  if (matches.length > 1) {
    return {
      error: `${matches.length} headings match "${query}": ${listSections(matches)}. Pass sectionIndex, or a longer path.`,
    };
  }
  const headings = sections.slice(1);
  if (headings.length === 0) {
    return {
      error: `no heading matches "${query}": this document has no headings. Use sectionIndex 0 for its whole content.`,
    };
  }
  const more = headings.length > MAX_LISTED_HEADINGS ? '; …' : '';
  return {
    error: `no heading matches "${query}". Headings: ${listSections(headings.slice(0, MAX_LISTED_HEADINGS))}${more}`,
  };
}

/** `[3] Part One > Chapter 2; [7] …` */
function listSections(sections: DocumentSection[]): string {
  return sections.map((section) => '[' + section.index + '] ' + section.path.join(' > ')).join('; ');
}

/**
 * The top-level range an operation replaces: delete `deleteCount` blocks at
 * `index`, then insert the new blocks there.
 *
 * - `replace`: the whole section, heading included.
 * - `replace_body`: everything after the heading, subsections included.
 * - `prepend`: insert right after the heading.
 * - `append`: insert at the end of the section, after its subsections (also
 *   where a new section that follows this one goes).
 * - `insert_before`: insert before the heading.
 * - `delete`: remove the whole section.
 *
 * The preamble has no heading, so there `replace_body` is `replace` and
 * `prepend` is `insert_before`.
 */
export function sectionEditRange(
  section: DocumentSection,
  operation: SectionOperation
): { index: number; deleteCount: number } {
  const bodyStart = section.index === 0 ? section.start : section.start + 1;
  switch (operation) {
    case 'replace':
    case 'delete':
      return { index: section.start, deleteCount: section.end - section.start };
    case 'replace_body':
      return { index: bodyStart, deleteCount: section.end - bodyStart };
    case 'prepend':
      return { index: bodyStart, deleteCount: 0 };
    case 'append':
      return { index: section.end, deleteCount: 0 };
    case 'insert_before':
      return { index: section.start, deleteCount: 0 };
  }
}

/** The XML of a section's blocks, heading and subsections included. */
export function sectionXml(blocks: SectionBlock[], section: DocumentSection): string {
  return blocks
    .slice(section.start, section.end)
    .map((block) => block.xml)
    .join('');
}

/** `"Heading"` for a heading section, or a name for the preamble. */
export function describeSection(section: DocumentSection): string {
  return section.index === 0 ? 'the content before the first heading' : `"${section.heading}"`;
}

function headingLevel(value: unknown): number {
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1;
}

function headingText(xml: string): string {
  return collapseWhitespace(xmlContentToText(xml));
}

function collapseWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

function normalizeHeading(text: string): string {
  return collapseWhitespace(text.replace(/^\s*#+\s*/, '')).toLowerCase();
}

function headingMatches(section: DocumentSection, query: string): boolean {
  if (section.index === 0) return false;
  if (normalizeHeading(section.heading) === normalizeHeading(query)) return true;

  const segments = query.split('>').map(normalizeHeading);
  if (segments.length < 2 || segments.length > section.path.length) return false;
  if (segments.some((segment) => !segment)) return false;
  const tail = section.path.slice(-segments.length).map(normalizeHeading);
  return segments.every((segment, i) => segment === tail[i]);
}
