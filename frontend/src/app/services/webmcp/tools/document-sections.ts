/**
 * Shared pieces of the section-level document tools: `get_document_outline`,
 * `update_document_section`, and the `section` / `sectionIndex` arguments of
 * `get_document_content`. What a section is lives in
 * `@inkweld/prosemirror/xml` (`sections.ts`); the arguments, errors and
 * results follow the server MCP tools
 * (`backend/src/mcp/tools/document-section.tools.ts`).
 */
import {
  type DocumentSection,
  findSection,
  outlineSections,
  parseXmlToYjsNodes,
  readSectionBlocks,
  SECTION_OPERATIONS,
  type SectionAddress,
  type SectionBlock,
  type SectionOperation,
  sectionXml,
  serializeYjsNodeToXml,
  xmlContentToText,
} from '@inkweld/prosemirror/xml';
import * as Y from 'yjs';

import { type ToolArgs, ToolError } from './tool';

/** The `section` / `sectionIndex` arguments, shared with get_document_content. */
export const SECTION_ADDRESS_PROPERTIES = {
  section: {
    type: 'string',
    description:
      'Heading text of the section, e.g. "Chapter 2". Case and leading Markdown #s are ignored. When several headings share the text, use a path of headings such as "Part One > Chapter 2", or sectionIndex.',
  },
  sectionIndex: {
    type: 'integer',
    minimum: 0,
    description:
      'Section number from get_document_outline: 0 is the content before the first heading, headings count from 1 in document order. When given with section, both must name the same section.',
  },
} as const;

/** Words in an Inkweld XML string. */
export function countWords(xml: string): number {
  return xmlContentToText(xml)
    .split(/\s+/)
    .filter(w => w.length > 0).length;
}

/** A document's top-level blocks and the sections they form. */
export interface DocumentSections {
  blocks: SectionBlock[];
  sections: DocumentSection[];
  /** The whole document as Inkweld XML. */
  xml: string;
}

/**
 * Work out the sections of a prose fragment. Blocks carry the same
 * canonical XML that `get_document_content` returns, so a section read can
 * be edited and written back.
 */
export function readSections(fragment: Y.XmlFragment): DocumentSections {
  const blocks = readSectionBlocks(fragment, child =>
    serializeYjsNodeToXml(Y, child)
  );
  return {
    blocks,
    sections: outlineSections(blocks),
    xml: blocks.map(block => block.xml).join(''),
  };
}

/**
 * Read the `section` (heading text or path) and `sectionIndex` arguments.
 * Returns `null` when neither was given.
 */
export function sectionAddress(args: ToolArgs): SectionAddress | null {
  const section = args.raw('section');
  const sectionIndex = args.raw('sectionIndex');
  if (
    section !== undefined &&
    section !== null &&
    typeof section !== 'string'
  ) {
    throw new ToolError(
      'section must be a string (heading text, or a path like "Part > Chapter")'
    );
  }

  let index: number | undefined;
  if (typeof sectionIndex === 'number') {
    index = sectionIndex;
  } else if (
    typeof sectionIndex === 'string' &&
    /^\d+$/.test(sectionIndex.trim())
  ) {
    // Agents sometimes send every argument as a string.
    index = Number(sectionIndex.trim());
  } else if (sectionIndex !== undefined && sectionIndex !== null) {
    throw new ToolError(
      'sectionIndex must be a whole number (0 is the content before the first heading)'
    );
  }

  const heading =
    typeof section === 'string' && section.trim() ? section : undefined;
  if (heading === undefined && index === undefined) return null;
  return { heading, index };
}

/** The section `address` names, or a ToolError saying why there is none. */
export function requireSection(
  sections: DocumentSection[],
  address: SectionAddress
): DocumentSection {
  const lookup = findSection(sections, address);
  if ('error' in lookup) throw new ToolError(lookup.error);
  return lookup.section;
}

/** A section as reported by the outline and by section reads. */
export function summarizeSection(
  blocks: SectionBlock[],
  section: DocumentSection
) {
  return {
    ...sectionReference(section),
    blockCount: section.end - section.start,
    wordCount: countWords(sectionXml(blocks, section)),
  };
}

/** Which section an edit changed. */
export function sectionReference(section: DocumentSection) {
  return {
    index: section.index,
    level: section.level,
    heading: section.index === 0 ? null : section.heading,
    path: section.path.join(' > '),
  };
}

/** The update_document_section arguments that don't need the document. */
export interface SectionEdit<F extends string> {
  operation: SectionOperation;
  format: F;
  content: string;
  address: SectionAddress;
}

/** Validate the update_document_section arguments that don't need the document. */
export function sectionEditArgs<F extends string>(
  args: ToolArgs,
  formats: readonly F[],
  defaultFormat: F
): SectionEdit<F> {
  const operation = args.raw('operation');
  if (!(SECTION_OPERATIONS as readonly unknown[]).includes(operation)) {
    throw new ToolError(
      `operation must be one of ${SECTION_OPERATIONS.join(', ')} (got ${JSON.stringify(operation ?? null)})`
    );
  }
  const op = operation as SectionOperation;
  const format = args.optionalOneOf('format', formats) ?? defaultFormat;

  const content = args.raw('content') ?? '';
  if (typeof content !== 'string') {
    throw new ToolError('content must be a string');
  }
  const contentOptional =
    op === 'delete' || op === 'replace' || op === 'replace_body';
  if (!contentOptional && !content.trim()) {
    throw new ToolError(`content is required for "${op}"`);
  }

  const address = sectionAddress(args);
  if (!address) {
    throw new ToolError(
      'name the section with section (heading text, or a path like "Part One > Chapter 2") or sectionIndex (see get_document_outline)'
    );
  }

  // A delete writes nothing, whatever content came with it.
  return {
    operation: op,
    format,
    content: op === 'delete' ? '' : content,
    address,
  };
}

/**
 * Parse the new blocks. The document's top level holds only block nodes, so
 * bare text there (e.g. XML without a <paragraph>) is refused rather than
 * written as something the editor cannot show.
 */
export function parseSectionContent(xml: string): Y.XmlElement[] {
  let nodes: unknown[];
  try {
    nodes = parseXmlToYjsNodes(Y, xml);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ToolError(`could not parse content: ${message}`);
  }
  const blocks = nodes.filter(
    (node): node is Y.XmlElement => node instanceof Y.XmlElement
  );
  if (blocks.length !== nodes.length) {
    throw new ToolError(
      'content must be block nodes such as <paragraph>…</paragraph> or <heading level="2">…</heading>; wrap bare text in a <paragraph>'
    );
  }
  return blocks;
}

/** Hints about what an edit did to the document's structure. */
export function sectionEditNotes(
  section: DocumentSection,
  operation: SectionOperation,
  nodes: Y.XmlElement[],
  sectionCountBefore: number,
  sectionCountAfter: number
): string[] {
  const notes: string[] = [];
  if (
    operation === 'replace' &&
    section.index > 0 &&
    nodes.length > 0 &&
    nodes[0].nodeName !== 'heading'
  ) {
    notes.push(
      'The new content does not start with a heading, so it is now part of the section before it.'
    );
  }
  if (sectionCountAfter !== sectionCountBefore) {
    notes.push(
      `The document now has ${sectionCountAfter - 1} headings (was ${sectionCountBefore - 1}), so later section indexes have changed; read the outline again before using one.`
    );
  }
  return notes;
}
