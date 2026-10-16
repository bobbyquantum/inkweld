import type { Injector } from '@angular/core';
import { markdownToXml, xmlToMarkdown } from '@inkweld/prosemirror/markdown';
import { decodeInkweldUri, encodeInkweldUri } from '@inkweld/prosemirror/uri';
import { xmlContentToText } from '@inkweld/prosemirror/xml';
import { isConversation } from '@models/scene-metadata';
import {
  type ProjectSearchResult,
  ProjectSearchService,
} from '@services/core/project-search.service';

import { DocumentAccess } from './document-access';
import { ELEMENT_TYPES, type ProjectToolContext } from './project-context';
import { schema, ToolError, type WebMcpToolDefinition } from './tool';

const READ_FORMATS = ['markdown', 'xml', 'text'] as const;
const WRITE_FORMATS = ['markdown', 'xml'] as const;
const WRITE_MODES = ['replace', 'append', 'prepend'] as const;

const XML_HELP = `Inkweld XML uses <paragraph>, <heading level="1">, <blockquote>, <bullet_list>/<ordered_list> with <list_item>, <horizontal_rule/>, marks such as <strong> and <em>, and <table><table_row><table_cell><paragraph>…</paragraph></table_cell></table_row></table>. Conversation documents hold one <speech speakerName="Mara" speakerId="<worldbuilding element id>"><parenthetical>quietly</parenthetical><dialogue>Then fix it.</dialogue></speech> per line, with descriptions as <paragraph>; Markdown cannot express speeches, so use xml for them.`;

function countWords(xml: string): number {
  return xmlContentToText(xml)
    .split(/\s+/)
    .filter(w => w.length > 0).length;
}

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
        'The text of a document (ITEM). Markdown is easiest to read; xml is lossless (comments, colours, conversation speeches) and is what you should edit and write back when the document uses those.',
      inputSchema: schema(
        {
          elementId: { type: 'string' },
          format: {
            type: 'string',
            enum: READ_FORMATS,
            description: 'Default markdown.',
          },
        },
        ['elementId']
      ),
      readOnly: true,
      untrustedContent: true,
      run: async args => {
        const element = ctx.document(args.string('elementId'));
        const format = args.optionalOneOf('format', READ_FORMATS) ?? 'markdown';
        const project = ctx.project();
        const xml = await access.readXml(ctx.documentId(element.id));
        let content = xml;
        if (format === 'text') content = xmlContentToText(xml);
        if (format === 'markdown') {
          content = xmlToMarkdown(xml, {
            encodeElementRefHref: attrs =>
              encodeInkweldUri({
                elementId:
                  typeof attrs['elementId'] === 'string'
                    ? attrs['elementId']
                    : '',
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
        return {
          elementId: element.id,
          name: element.name,
          format,
          conversation: isConversation(element.metadata),
          wordCount: countWords(xml),
          content,
        };
      },
    },
    {
      name: 'update_document_content',
      writes: true,
      title: 'Write document',
      description: `Write the text of a document (ITEM). mode "replace" (default) replaces everything; "append" and "prepend" add to it. If the user has the document open they see the change at once. Markdown supports CommonMark and GFM tables; links to other elements are [label](inkweld://<username>/<slug>/element/<id>). ${XML_HELP}`,
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
