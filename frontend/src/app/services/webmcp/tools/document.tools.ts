import type { Injector } from '@angular/core';
import { markdownToXml, xmlToMarkdown } from '@inkweld/prosemirror/markdown';
import { decodeInkweldUri, encodeInkweldUri } from '@inkweld/prosemirror/uri';
import {
  SECTION_OPERATIONS,
  sectionEditRange,
  sectionXml,
  xmlContentToText,
} from '@inkweld/prosemirror/xml';
import { isConversation } from '@models/scene-metadata';
import {
  type ProjectSearchResult,
  ProjectSearchService,
} from '@services/core/project-search.service';

import { DocumentAccess } from './document-access';
import {
  countWords,
  parseSectionContent,
  readSections,
  requireSection,
  SECTION_ADDRESS_PROPERTIES,
  sectionAddress,
  sectionEditArgs,
  sectionEditNotes,
  sectionReference,
  summarizeSection,
} from './document-sections';
import { ELEMENT_TYPES, type ProjectToolContext } from './project-context';
import { schema, ToolError, type WebMcpToolDefinition } from './tool';

const READ_FORMATS = ['markdown', 'xml', 'text'] as const;
const WRITE_FORMATS = ['markdown', 'xml'] as const;
const WRITE_MODES = ['replace', 'append', 'prepend'] as const;

const XML_HELP = `Inkweld XML uses <paragraph>, <heading level="1">, <blockquote>, <bullet_list>/<ordered_list> with <list_item>, <horizontal_rule/>, marks such as <strong> and <em>, and <table><table_row><table_cell><paragraph>…</paragraph></table_cell></table_row></table>. Conversation documents hold one <speech speakerName="Mara" speakerId="<worldbuilding element id>"><parenthetical>quietly</parenthetical><dialogue>Then fix it.</dialogue></speech> per line, with descriptions as <paragraph>; Markdown cannot express speeches, so use xml for them.`;

function markdownToInkweldXml(markdown: string): string {
  return markdownToXml(markdown, {
    decodeElementRefHref: href => {
      const decoded = decodeInkweldUri(href);
      if (!decoded) return null;
      return {
        elementId: decoded.elementId,
        elementType: decoded.params['type'],
        relationshipNote: decoded.params['note'],
      };
    },
  });
}

/** Inkweld XML as Markdown, with element references as inkweld:// links. */
function xmlToProjectMarkdown(
  xml: string,
  project: { username: string; slug: string }
): string {
  return xmlToMarkdown(xml, {
    encodeElementRefHref: attrs =>
      encodeInkweldUri({
        elementId:
          typeof attrs['elementId'] === 'string' ? attrs['elementId'] : '',
        username: project.username,
        slug: project.slug,
        params: {
          type:
            typeof attrs['elementType'] === 'string'
              ? attrs['elementType']
              : undefined,
          note:
            typeof attrs['relationshipNote'] === 'string'
              ? attrs['relationshipNote']
              : undefined,
        },
      }),
  });
}

/** Replace a document's text with Markdown (used by create_element). */
export async function writeDocumentFromMarkdown(
  injector: Injector,
  ctx: ProjectToolContext,
  elementId: string,
  markdown: string
): Promise<void> {
  await new DocumentAccess(injector).writeXml(
    ctx.documentId(elementId),
    markdownToInkweldXml(markdown)
  );
}

/** Reading, writing and searching the prose of documents. */
export function documentTools(
  injector: Injector,
  ctx: ProjectToolContext
): WebMcpToolDefinition[] {
  const access = new DocumentAccess(injector);

  return [
    {
      name: 'get_document_content',
      title: 'Read document',
      description:
        'The text of a document (ITEM). Markdown is easiest to read; xml is lossless (comments, colours, conversation speeches) and is what you should edit and write back when the document uses those. Pass section or sectionIndex to read one section (a heading and everything under it, see get_document_outline) instead of the whole document; update_document_section with operation "replace" accepts the result back.',
      inputSchema: schema(
        {
          elementId: { type: 'string' },
          format: {
            type: 'string',
            enum: READ_FORMATS,
            description: 'Default markdown.',
          },
          ...SECTION_ADDRESS_PROPERTIES,
        },
        ['elementId']
      ),
      readOnly: true,
      untrustedContent: true,
      run: async args => {
        const element = ctx.document(args.string('elementId'));
        const format = args.optionalOneOf('format', READ_FORMATS) ?? 'markdown';
        const address = sectionAddress(args);
        const project = ctx.project();
        const read = await access.readFragment(
          ctx.documentId(element.id),
          fragment => {
            const document = readSections(fragment);
            if (!address) return { documentXml: document.xml };
            const section = requireSection(document.sections, address);
            return {
              documentXml: document.xml,
              xml: sectionXml(document.blocks, section),
              section: summarizeSection(document.blocks, section),
            };
          }
        );
        const xml = read.xml ?? read.documentXml;
        let content = xml;
        if (format === 'text') content = xmlContentToText(xml);
        if (format === 'markdown') content = xmlToProjectMarkdown(xml, project);
        return {
          elementId: element.id,
          name: element.name,
          format,
          conversation: isConversation(element.metadata),
          wordCount: countWords(read.documentXml),
          ...(read.section ? { section: read.section } : {}),
          content,
        };
      },
    },
    {
      name: 'get_document_outline',
      title: 'Document outline',
      description: `The sections of a document (ITEM): one per top-level heading, in document order, with its level, its path of enclosing headings and its size. A section runs from its heading to the next heading of the same or a higher level, so it includes its subsections. Section 0 is the content before the first heading.

Use it before get_document_content or update_document_section with a section, to read or edit one part of a long document without sending the whole text.`,
      inputSchema: schema({ elementId: { type: 'string' } }, ['elementId']),
      readOnly: true,
      untrustedContent: true,
      run: args => {
        const element = ctx.document(args.string('elementId'));
        return access.readFragment(ctx.documentId(element.id), fragment => {
          const { blocks, sections, xml } = readSections(fragment);
          return {
            elementId: element.id,
            name: element.name,
            blockCount: blocks.length,
            wordCount: countWords(xml),
            sections: sections.map(section =>
              summarizeSection(blocks, section)
            ),
          };
        });
      },
    },
    {
      name: 'update_document_content',
      writes: true,
      title: 'Write document',
      description: `Write the text of a document (ITEM). mode "replace" (default) replaces everything; "append" and "prepend" add to it. To change one part of a long document, use update_document_section instead (get_document_outline lists the sections). If the user has the document open they see the change at once. Markdown supports CommonMark and GFM tables; links to other elements are [label](inkweld://<username>/<slug>/element/<id>). ${XML_HELP}`,
      inputSchema: schema(
        {
          elementId: { type: 'string' },
          content: { type: 'string' },
          format: {
            type: 'string',
            enum: WRITE_FORMATS,
            description: 'Default markdown.',
          },
          mode: {
            type: 'string',
            enum: WRITE_MODES,
            description: 'Default replace.',
          },
        },
        ['elementId', 'content']
      ),
      run: async args => {
        ctx.requireWrite();
        const element = ctx.document(args.string('elementId'));
        const content = args.optionalString('content');
        if (content === undefined)
          throw new ToolError('"content" is required.');
        const format =
          args.optionalOneOf('format', WRITE_FORMATS) ?? 'markdown';
        const mode = args.optionalOneOf('mode', WRITE_MODES) ?? 'replace';
        const documentId = ctx.documentId(element.id);
        const addition =
          format === 'markdown' ? markdownToInkweldXml(content) : content;
        let xml = addition;
        let previousWords = 0;
        if (mode !== 'replace') {
          const current = await access.readXml(documentId);
          previousWords = countWords(current);
          xml = mode === 'append' ? current + addition : addition + current;
        }
        await access.writeXml(documentId, xml);
        const wordCount = countWords(xml);
        return {
          elementId: element.id,
          name: element.name,
          mode,
          wordCount,
          ...(mode === 'replace'
            ? {}
            : { wordsAdded: wordCount - previousWords }),
        };
      },
    },
    {
      name: 'update_document_section',
      writes: true,
      title: 'Edit document section',
      description: `Edit one section of a document (ITEM), leaving the rest of the text untouched. Prefer this to update_document_content for changes to part of a long document: only the changed blocks are rewritten, so comments and the user's edits elsewhere are kept. If the user has the document open they see the change at once.

A section starts at a top-level heading and runs to the next heading of the same or a higher level, so it includes its subsections. Section 0 is the content before the first heading (for a document without headings, all of it). Name the section with section (heading text or a path like "Part One > Chapter 2") or sectionIndex (from get_document_outline); get_document_content with the same arguments reads it.

Operations:
- "replace": replace the whole section, heading included. Start the content with the heading (changed or not) to keep the section; get_document_content's section output can be edited and sent back as is.
- "replace_body": keep the heading and replace everything under it, subsections included.
- "prepend": insert the content right after the heading.
- "append": insert the content at the end of the section, after its subsections. Use it to add a new section after this one, too.
- "insert_before": insert the content before the heading, for example a new section.
- "delete": remove the whole section, heading and subsections included (no content needed).

Content uses the same formats as update_document_content: "markdown" (default; "## Heading", paragraphs, lists, tables) or "xml". A heading of the same or a higher level inside the content starts a new section. ${XML_HELP}`,
      inputSchema: schema(
        {
          elementId: { type: 'string' },
          ...SECTION_ADDRESS_PROPERTIES,
          operation: {
            type: 'string',
            enum: SECTION_OPERATIONS,
            description: 'What to do with the section (see the description).',
          },
          content: {
            type: 'string',
            description:
              'The blocks to write, in the chosen format. Required except for "delete"; may be empty for "replace" and "replace_body".',
          },
          format: {
            type: 'string',
            enum: WRITE_FORMATS,
            description: 'Default markdown.',
          },
        },
        ['elementId', 'operation']
      ),
      run: async args => {
        ctx.requireWrite();
        const element = ctx.document(args.string('elementId'));
        const edit = sectionEditArgs(args, WRITE_FORMATS, 'markdown');
        const { operation } = edit;
        const nodes = parseSectionContent(
          edit.format === 'markdown'
            ? markdownToInkweldXml(edit.content)
            : edit.content
        );

        return access.editFragment(ctx.documentId(element.id), fragment => {
          const before = readSections(fragment);
          const section = requireSection(before.sections, edit.address);
          const { index, deleteCount } = sectionEditRange(section, operation);
          if (deleteCount > 0) fragment.delete(index, deleteCount);
          if (nodes.length > 0) fragment.insert(index, nodes);

          const after = readSections(fragment);
          const previousWordCount = countWords(before.xml);
          const wordCount = countWords(after.xml);
          const notes = sectionEditNotes(
            section,
            operation,
            nodes,
            before.sections.length,
            after.sections.length
          );
          return {
            elementId: element.id,
            name: element.name,
            operation,
            format: edit.format,
            section: sectionReference(section),
            blocksRemoved: deleteCount,
            blocksInserted: nodes.length,
            wordCount,
            previousWordCount,
            wordsDelta: wordCount - previousWordCount,
            sectionCount: after.sections.length,
            ...(notes.length > 0 ? { notes } : {}),
          };
        });
      },
    },
    {
      name: 'search_text',
      title: 'Search document text',
      description:
        'Full-text search through every document and worldbuilding entry in the project, like the project search dialog. Returns matching elements with snippets.',
      inputSchema: schema(
        {
          query: { type: 'string' },
          types: {
            type: 'array',
            items: { type: 'string', enum: ELEMENT_TYPES },
            description: 'Only these element types.',
          },
          tagIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Only elements with one of these tags.',
          },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        ['query']
      ),
      readOnly: true,
      untrustedContent: true,
      run: async (args, signal) => {
        ctx.project();
        const query = args.string('query');
        const limit = args.optionalInteger('limit', { min: 1, max: 100 }) ?? 25;
        const types = args.stringArray('types');
        const tagIds = args.stringArray('tagIds');
        let results: ProjectSearchResult[] = [];
        await injector.get(ProjectSearchService).search(
          query,
          progress => {
            results = progress.results;
          },
          signal,
          {
            elementTypes:
              types.length > 0
                ? (types as ProjectSearchResult['element']['type'][])
                : undefined,
            tagIds: tagIds.length > 0 ? tagIds : undefined,
          }
        );
        return {
          total: results.length,
          results: results.slice(0, limit).map(r => ({
            elementId: r.element.id,
            name: r.element.name,
            type: r.element.type,
            path: r.path,
            matchCount: r.matchCount,
            snippets: r.snippets.map(s => `${s.before}${s.match}${s.after}`),
          })),
        };
      },
    },
  ];
}
