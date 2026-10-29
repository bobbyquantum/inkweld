/**
 * Shared pieces of the section-level document tools: `get_document_outline`,
 * `update_document_section`, and the `section` / `sectionIndex` arguments of
 * `get_document_content`. What a section is lives in
 * `@inkweld/prosemirror/xml` (`sections.ts`).
 *
 * Documents are opened with `openEditableDocument`, so these work on both
 * runtimes: the live document on Bun, and on Workers a full copy of the
 * Durable Object's state whose changes `commit()` sends back as a Yjs update.
 * A section edit therefore touches only the blocks it replaces; edits made
 * elsewhere in the document in the meantime merge like any concurrent edit.
 */
import type * as Y from 'yjs';
import { markdownToXml, xmlToMarkdown } from '@inkweld/prosemirror/markdown';
import { decodeInkweldUri, encodeInkweldUri } from '@inkweld/prosemirror/uri';
import {
  outlineSections,
  readSectionBlocks,
  sectionXml,
  type DocumentSection,
  type SectionAddress,
  type SectionBlock,
} from '@inkweld/prosemirror/xml';
import { openEditableDocument, type EditableDocument } from '../../services/yjs-document-access';
import { xmlContentToText } from '../../utils/xml-utils';
import type { McpContext } from '../mcp.types';

/** The `section` / `sectionIndex` arguments, shared with get_document_content. */
export const sectionAddressProperties = {
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

/** A document opened for section reads or edits. */
export interface SectionedDocument {
  editable: EditableDocument;
  fragment: Y.XmlFragment;
  blocks: SectionBlock[];
  sections: DocumentSection[];
}

/** Open an element's prose document and work out its sections. */
export async function openSectionedDocument(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string
): Promise<SectionedDocument> {
  const editable = await openEditableDocument(`${username}:${slug}:${elementId}/`, {
    env: ctx.env,
    authToken: ctx.authToken,
  });
  const fragment = editable.doc.getXmlFragment('prosemirror');
  const blocks = readSectionBlocks(fragment);
  return { editable, fragment, blocks, sections: outlineSections(blocks) };
}

/**
 * Read the `section` (heading text or path) and `sectionIndex` arguments.
 * Returns `null` when neither was given.
 */
export function parseSectionAddress(
  args: Record<string, unknown>
): { address: SectionAddress | null } | { error: string } {
  const { section, sectionIndex } = args;
  if (section !== undefined && section !== null && typeof section !== 'string') {
    return { error: 'section must be a string (heading text, or a path like "Part > Chapter")' };
  }

  let index: number | undefined;
  if (typeof sectionIndex === 'number') {
    index = sectionIndex;
  } else if (typeof sectionIndex === 'string' && /^\d+$/.test(sectionIndex.trim())) {
    // Some MCP clients send every argument as a string.
    index = Number(sectionIndex.trim());
  } else if (sectionIndex !== undefined && sectionIndex !== null) {
    return {
      error: 'sectionIndex must be a whole number (0 is the content before the first heading)',
    };
  }

  const heading = typeof section === 'string' && section.trim() ? section : undefined;
  if (heading === undefined && index === undefined) return { address: null };
  return { address: { heading, index } };
}

/** A section as the outline and the edit results report it. */
export function summarizeSection(blocks: SectionBlock[], section: DocumentSection) {
  return {
    index: section.index,
    level: section.level,
    heading: section.index === 0 ? null : section.heading,
    path: section.path.join(' > '),
    blockCount: section.end - section.start,
    wordCount: countXmlWords(sectionXml(blocks, section)),
  };
}

/** Words in a ProseMirror XML string, counted like every other document tool. */
export function countXmlWords(xml: string): number {
  return xmlContentToText(xml)
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

/**
 * Convert Markdown input to Inkweld XML. Element references written as
 * `inkweld://` links become `<element_ref>` nodes again, keeping `elementType`
 * and `relationshipNote` from the URI's query string (the attribute names of
 * the shared element-ref schema spec).
 */
export function markdownInputToXml(markdown: string): string {
  return markdownToXml(markdown, {
    decodeElementRefHref: (href) => {
      const decoded = decodeInkweldUri(href);
      if (!decoded) return null;
      return {
        elementId: decoded.elementId,
        elementType: decoded.params.type,
        relationshipNote: decoded.params.note,
      };
    },
  });
}

/**
 * Convert Inkweld XML to Markdown for output. Element references become
 * project-scoped `inkweld://` links, so a round trip through Markdown keeps
 * the project context.
 */
export function xmlToMarkdownOutput(xml: string, username: string, slug: string): string {
  return xmlToMarkdown(xml, {
    encodeElementRefHref: (attrs) => {
      const refId = typeof attrs.elementId === 'string' ? attrs.elementId : '';
      return encodeInkweldUri({
        elementId: refId,
        username,
        slug,
        params: {
          type: typeof attrs.elementType === 'string' ? attrs.elementType : undefined,
          note: typeof attrs.relationshipNote === 'string' ? attrs.relationshipNote : undefined,
        },
      });
    },
  });
}
