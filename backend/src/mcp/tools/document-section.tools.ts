/**
 * MCP Tools: Document sections
 *
 * Read and edit one heading-delimited section of a document instead of the
 * whole text: `get_document_outline` lists the sections, and
 * `update_document_section` replaces, adds to or deletes one of them. Reading
 * a single section is `get_document_content` with `section` / `sectionIndex`.
 *
 * Only the blocks being changed are rewritten, so the rest of the document
 * keeps its Yjs history, comments and anything collaborators are typing.
 * Runtime-aware through `openEditableDocument` (see `document-sections.ts`).
 */
import * as Y from 'yjs';
import {
  SECTION_OPERATIONS,
  describeSection,
  findSection,
  outlineSections,
  parseXmlToYjsNodes,
  readSectionBlocks,
  sectionEditRange,
  type DocumentSection,
  type SectionAddress,
  type SectionOperation,
} from '@inkweld/prosemirror/xml';
import { registerTool } from '../mcp.handler';
import type { McpContext, McpToolResult } from '../mcp.types';
import { MCP_PERMISSIONS } from '../mcp-permissions';
import type { DatabaseInstance } from '../../types/context';
import { activityService } from '../../services/activity.service';
import { logger } from '../../services/logger.service';
import { rethrowDocumentReadError } from '../../services/yjs-worker.service';
import { getElements as runtimeGetElements } from './yjs-runtime';
import { parseProjectParam } from './search.tools';
import {
  countXmlWords,
  markdownInputToXml,
  openSectionedDocument,
  parseSectionAddress,
  sectionAddressProperties,
  summarizeSection,
} from './document-sections';

const mcpSectionLog = logger.child('MCP-Sections');

const projectProperty = {
  type: 'string',
  description:
    'Project identifier in "username/slug" format. Use list_projects to discover projects.',
} as const;

/** Build an `isError` tool result with an `Error:`-prefixed message. */
function errorResult(message: string): McpToolResult {
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}

/** Wrap a JSON-serializable payload as a text tool result. */
function textResult(payload: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

// ============================================
// get_document_outline tool
// ============================================

registerTool({
  tool: {
    name: 'get_document_outline',
    title: 'Get Document Outline',
    description: `List the sections of a document: one per top-level heading, in document order, with its level, its path of enclosing headings and its size. A section runs from its heading to the next heading of the same or a higher level, so it includes its subsections. Section 0 is the content before the first heading.

Use it before get_document_content or update_document_section with a section, to read or edit one part of a long document without sending the whole text.`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        elementId: { type: 'string', description: 'The ID of the document element' },
      },
      required: ['project', 'elementId'],
    },
    annotations: { readOnlyHint: true },
  },
  requiredPermissions: [MCP_PERMISSIONS.READ_ELEMENTS],
  async execute(
    ctx: McpContext,
    _db: unknown,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.READ_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug } = result.project;

    const elementId = (typeof args.elementId === 'string' ? args.elementId : '').trim();
    if (!elementId) return errorResult('elementId is required');

    const elements = await runtimeGetElements(ctx, username, slug);
    const element = elements.find((e) => e.id === elementId);
    if (!element) return errorResult(`element "${elementId}" not found`);

    try {
      const { blocks, sections, fragment } = await openSectionedDocument(
        ctx,
        username,
        slug,
        elementId
      );
      return textResult({
        elementId,
        elementName: element.name,
        blockCount: blocks.length,
        wordCount: countXmlWords(fragment.toString()),
        sections: sections.map((section) => summarizeSection(blocks, section)),
      });
    } catch (err) {
      rethrowDocumentReadError(err);
      mcpSectionLog.error('Error reading document outline', err);
      return errorResult('could not read the document');
    }
  },
});

// ============================================
// update_document_section tool
// ============================================

const OPERATION_VERBS: Record<SectionOperation, string> = {
  replace: 'Replaced section',
  replace_body: 'Replaced the body of section',
  prepend: 'Added content at the start of section',
  append: 'Added content at the end of section',
  insert_before: 'Inserted content before section',
  delete: 'Deleted section',
};

registerTool({
  tool: {
    name: 'update_document_section',
    title: 'Update Document Section',
    description: `Edit one section of a document element, leaving the rest of the text untouched. Prefer this to update_document_content for changes to part of a long document: only the changed blocks are rewritten, so comments and concurrent edits elsewhere are kept.

A section starts at a top-level heading and runs to the next heading of the same or a higher level, so it includes its subsections. Section 0 is the content before the first heading (for a document without headings, all of it). Name the section with section (heading text or a path like "Part One > Chapter 2") or sectionIndex (from get_document_outline); get_document_content with the same arguments reads it.

Operations:
- "replace": replace the whole section, heading included. Start the content with the heading (changed or not) to keep the section; get_document_content's section output can be edited and sent back as is.
- "replace_body": keep the heading and replace everything under it, subsections included.
- "prepend": insert the content right after the heading.
- "append": insert the content at the end of the section, after its subsections. Use it to add a new section after this one, too.
- "insert_before": insert the content before the heading, for example a new section.
- "delete": remove the whole section, heading and subsections included (no content needed).

Content uses the same formats as update_document_content: "prosemirror_xml" (default; block tags such as <heading level="2">, <paragraph>) or "markdown" ("## Heading", paragraphs, lists, tables). A heading of the same or a higher level inside the content starts a new section.`,
    inputSchema: {
      type: 'object',
      properties: {
        project: projectProperty,
        elementId: { type: 'string', description: 'ID of the document element to edit' },
        ...sectionAddressProperties,
        operation: {
          type: 'string',
          enum: [...SECTION_OPERATIONS],
          description: 'What to do with the section (see the tool description).',
        },
        content: {
          type: 'string',
          description:
            'The blocks to write, in the chosen format. Required except for "delete"; may be empty for "replace" and "replace_body".',
        },
        format: {
          type: 'string',
          enum: ['prosemirror_xml', 'markdown'],
          description:
            'Input format: "prosemirror_xml" (default) for canonical Inkweld XML, "markdown" for Markdown.',
        },
      },
      required: ['project', 'elementId', 'operation'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  },
  requiredPermissions: [MCP_PERMISSIONS.WRITE_ELEMENTS],
  async execute(
    ctx: McpContext,
    db: DatabaseInstance,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = parseProjectParam(ctx, args.project, MCP_PERMISSIONS.WRITE_ELEMENTS);
    if ('error' in result) return result.error;
    const { username, slug, projectId } = result.project;

    const request = parseSectionEditArgs(args);
    if ('error' in request) return errorResult(request.error);
    const { elementId, operation, format } = request;

    const elements = await runtimeGetElements(ctx, username, slug);
    const element = elements.find((e) => e.id === elementId);
    if (!element) return errorResult(`element "${elementId}" not found`);
    if (element.type !== 'ITEM') {
      return errorResult(
        `element "${elementId}" is type "${element.type}", not a document (ITEM). Only document elements have prose content.`
      );
    }

    const parsed = parseSectionContent(request.content, format);
    if ('error' in parsed) return errorResult(parsed.error);
    const nodes = parsed.nodes;

    try {
      const { editable, fragment, sections } = await openSectionedDocument(
        ctx,
        username,
        slug,
        elementId
      );
      const lookup = findSection(sections, request.address);
      if ('error' in lookup) return errorResult(lookup.error);
      const section = lookup.section;

      const previousWordCount = countXmlWords(fragment.toString());
      const { index, deleteCount } = sectionEditRange(section, operation);
      editable.doc.transact(() => {
        if (deleteCount > 0) fragment.delete(index, deleteCount);
        if (nodes.length > 0) fragment.insert(index, nodes);
      });
      await editable.commit();

      const wordCount = countXmlWords(fragment.toString());
      const wordsDelta = wordCount - previousWordCount;
      const sectionCount = outlineSections(readSectionBlocks(fragment)).length;

      await activityService.recordOrCoalesceEdit(db, {
        projectId,
        userId: ctx.userId,
        entityId: elementId,
        entityName: element.name,
        wordsDelta,
        endWordCount: wordCount,
        durationMs: 0,
        metadata: { source: 'mcp', format, operation, section: section.heading || null },
      });

      const notes = editNotes(section, operation, nodes, sections.length, sectionCount);
      const sign = wordsDelta >= 0 ? '+' : '';
      return {
        content: [
          {
            type: 'text',
            text: [
              `${OPERATION_VERBS[operation]} ${describeSection(section)} in "${element.name}" (${deleteCount} blocks removed, ${nodes.length} added; ${wordCount} words, ${sign}${wordsDelta} vs. previous).`,
              ...notes,
            ].join(' '),
          },
        ],
        structuredContent: {
          success: true,
          elementId,
          elementName: element.name,
          operation,
          format,
          section: {
            index: section.index,
            level: section.level,
            heading: section.index === 0 ? null : section.heading,
            path: section.path.join(' > '),
          },
          blocksRemoved: deleteCount,
          blocksInserted: nodes.length,
          wordCount,
          previousWordCount,
          wordsDelta,
          sectionCount,
          ...(notes.length > 0 ? { notes } : {}),
        },
      };
    } catch (err) {
      rethrowDocumentReadError(err);
      mcpSectionLog.error('Error updating document section', err);
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(`could not update the document section: ${message}`);
    }
  },
});

interface SectionEditArgs {
  elementId: string;
  operation: SectionOperation;
  format: 'prosemirror_xml' | 'markdown';
  content: string;
  address: SectionAddress;
}

/** Validate the update_document_section arguments that don't need the document. */
export function parseSectionEditArgs(
  args: Record<string, unknown>
): SectionEditArgs | { error: string } {
  const elementId = (typeof args.elementId === 'string' ? args.elementId : '').trim();
  if (!elementId) return { error: 'elementId is required' };

  const operation = args.operation;
  if (!(SECTION_OPERATIONS as readonly unknown[]).includes(operation)) {
    return {
      error: `operation must be one of ${SECTION_OPERATIONS.join(', ')} (got ${JSON.stringify(operation ?? null)})`,
    };
  }

  const format = args.format ?? 'prosemirror_xml';
  if (format !== 'prosemirror_xml' && format !== 'markdown') {
    return { error: `invalid format "${String(format)}". Use "prosemirror_xml" or "markdown".` };
  }

  const op = operation as SectionOperation;
  const content = args.content ?? '';
  if (typeof content !== 'string') return { error: 'content must be a string' };
  const contentOptional = op === 'delete' || op === 'replace' || op === 'replace_body';
  if (!contentOptional && !content.trim()) {
    return { error: `content is required for "${op}"` };
  }

  const address = parseSectionAddress(args);
  if ('error' in address) return { error: address.error };
  if (!address.address) {
    return {
      error:
        'name the section with section (heading text, or a path like "Part One > Chapter 2") or sectionIndex (see get_document_outline)',
    };
  }

  return {
    elementId,
    operation: op,
    format,
    // A delete writes nothing, whatever content came with it.
    content: op === 'delete' ? '' : content,
    address: address.address,
  };
}

/**
 * Parse the new blocks. The document's top level holds only block nodes, so
 * bare text there (e.g. XML without a <paragraph>) is refused rather than
 * written as something the editor cannot show.
 */
function parseSectionContent(
  content: string,
  format: 'prosemirror_xml' | 'markdown'
): { nodes: Y.XmlElement[] } | { error: string } {
  try {
    const xml = format === 'markdown' ? markdownInputToXml(content) : content;
    const nodes = parseXmlToYjsNodes(Y, xml);
    const blocks = nodes.filter((node): node is Y.XmlElement => node instanceof Y.XmlElement);
    if (blocks.length !== nodes.length) {
      return {
        error:
          'content must be block nodes such as <paragraph>…</paragraph> or <heading level="2">…</heading>; wrap bare text in a <paragraph>',
      };
    }
    return { nodes: blocks };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: `could not parse content: ${message}` };
  }
}

/** Hints about what an edit did to the document's structure. */
function editNotes(
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
