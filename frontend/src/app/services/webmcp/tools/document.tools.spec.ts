import { Injector } from '@angular/core';
import { ElementType } from '@inkweld/index';
import { YDocAccessService } from '@services/cloud-sync/ydoc-access.service';
import { ProjectSearchService } from '@services/core/project-search.service';
import { SetupService } from '@services/core/setup.service';
import { ElementTreeService } from '@services/project/element-tree.service';
import { LiveDocumentRegistryService } from '@services/project/live-document-registry.service';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  applyXmlToFragment,
  xmlFragmentToXmlString,
} from '@utils/yjs-xml-serializer';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import {
  callTool,
  createProjectStateFake,
  element,
  type ProjectStateFake,
} from '../../../../testing/webmcp-testing';
import { documentTools, writeDocumentFromMarkdown } from './document.tools';
import { ProjectToolContext } from './project-context';
import type { WebMcpToolDefinition } from './tool';

describe('document tools', () => {
  let state: ProjectStateFake;
  let doc: Y.Doc;
  let tools: WebMcpToolDefinition[];
  let injector: Injector;
  let search: ReturnType<typeof vi.fn>;

  const xml = (): string =>
    xmlFragmentToXmlString(doc.getXmlFragment('prosemirror'));

  beforeEach(() => {
    state = createProjectStateFake([
      element('ch1', 'Chapter One', ElementType.Item),
      element('talk', 'Argument', ElementType.Item, 0, {
        metadata: { format: 'conversation' },
      }),
      element('elena', 'Elena', ElementType.Worldbuilding),
    ]);
    doc = new Y.Doc();
    applyXmlToFragment(
      doc,
      doc.getXmlFragment('prosemirror'),
      '<heading level="1">Start</heading><paragraph>It was <strong>dark</strong>, see <elementRef elementId="elena" elementType="WORLDBUILDING" displayText="Elena"/>.</paragraph>'
    );
    const docs = new Map([
      ['alice:novel:ch1', doc],
      ['alice:novel:talk', new Y.Doc()],
    ]);
    search = vi.fn(
      (
        _query: string,
        onProgress: (p: unknown) => void,
        _signal: AbortSignal,
        _filters: unknown
      ) => {
        onProgress({
          scanned: 1,
          total: 1,
          done: true,
          results: [
            {
              element: state.elements()[0],
              documentId: 'alice:novel:ch1',
              matchCount: 2,
              snippets: [{ before: 'It was ', match: 'dark', after: ', see' }],
              path: '',
            },
          ],
        });
        return Promise.resolve();
      }
    );

    injector = Injector.create({
      providers: [
        { provide: ProjectStateService, useValue: state },
        { provide: ElementTreeService, useClass: ElementTreeService },
        {
          provide: LiveDocumentRegistryService,
          useValue: {
            getConnectedYDoc: (id: string) => docs.get(id) ?? null,
            localEdit$: new Subject<string>(),
          },
        },
        { provide: SetupService, useValue: { getMode: () => 'local' } },
        { provide: YDocAccessService, useValue: {} },
        { provide: ProjectSearchService, useValue: { search } },
      ],
    });
    tools = documentTools(injector, new ProjectToolContext(injector));
  });

  describe('get_document_content', () => {
    it('reads Markdown by default, with element links', async () => {
      const { data } = await callTool(tools, 'get_document_content', {
        elementId: 'ch1',
      });
      expect(data.format).toBe('markdown');
      expect(data.content).toContain('# Start');
      expect(data.content).toContain('**dark**');
      expect(data.content).toContain('inkweld://alice/novel/element/elena');
      expect(data.wordCount).toBe(6);
      expect(data.conversation).toBe(false);
    });

    it('reads lossless XML and plain text', async () => {
      const asXml = await callTool(tools, 'get_document_content', {
        elementId: 'ch1',
        format: 'xml',
      });
      expect(asXml.data.content).toBe(xml());

      const asText = await callTool(tools, 'get_document_content', {
        elementId: 'ch1',
        format: 'text',
      });
      expect(asText.data.content).toContain('It was dark');
      expect(asText.data.content).not.toContain('<');
    });

    it('flags conversations', async () => {
      const { data } = await callTool(tools, 'get_document_content', {
        elementId: 'talk',
      });
      expect(data.conversation).toBe(true);
    });

    it('only reads documents', async () => {
      const { error } = await callTool(tools, 'get_document_content', {
        elementId: 'elena',
      });
      expect(error).toContain('not a document');
    });
  });

  describe('update_document_content', () => {
    it('replaces the text from Markdown', async () => {
      const { data } = await callTool(tools, 'update_document_content', {
        elementId: 'ch1',
        content: '## Rewritten\n\nA *new* start.',
      });
      expect(xml()).toBe(
        '<heading level="2">Rewritten</heading><paragraph>A <em>new</em> start.</paragraph>'
      );
      expect(data).toMatchObject({ mode: 'replace', wordCount: 4 });
      expect(data.wordsAdded).toBeUndefined();
    });

    it('turns inkweld links back into element references', async () => {
      await callTool(tools, 'update_document_content', {
        elementId: 'ch1',
        content:
          'Ask [Elena](inkweld://alice/novel/element/elena?type=WORLDBUILDING).',
      });
      expect(xml()).toContain('<elementRef');
      expect(xml()).toContain('elementId="elena"');
    });

    it('appends and prepends XML', async () => {
      await callTool(tools, 'update_document_content', {
        elementId: 'ch1',
        content: '<paragraph>The end.</paragraph>',
        format: 'xml',
        mode: 'append',
      });
      expect(xml().endsWith('<paragraph>The end.</paragraph>')).toBe(true);

      const { data } = await callTool(tools, 'update_document_content', {
        elementId: 'ch1',
        content: 'Prologue.',
        mode: 'prepend',
      });
      expect(xml().startsWith('<paragraph>Prologue.</paragraph>')).toBe(true);
      expect(data.wordsAdded).toBe(1);
    });

    it('accepts empty content and refuses read-only projects', async () => {
      await callTool(tools, 'update_document_content', {
        elementId: 'ch1',
        content: '',
      });
      expect(xml()).toBe('');

      state.canWrite.set(false);
      const { error } = await callTool(tools, 'update_document_content', {
        elementId: 'ch1',
        content: 'x',
      });
      expect(error).toContain('read access');
    });

    it('requires content', async () => {
      const { error } = await callTool(tools, 'update_document_content', {
        elementId: 'ch1',
      });
      expect(error).toContain('"content" is required');
    });
  });

  it('writes Markdown for create_element', async () => {
    await writeDocumentFromMarkdown(
      injector,
      new ProjectToolContext(injector),
      'ch1',
      'Fresh text.'
    );
    expect(xml()).toBe('<paragraph>Fresh text.</paragraph>');
  });

  it('searches document text with filters', async () => {
    const { data } = await callTool(tools, 'search_text', {
      query: 'dark',
      types: ['ITEM'],
      tagIds: ['t1'],
    });
    expect(search).toHaveBeenCalledWith(
      'dark',
      expect.any(Function),
      expect.any(AbortSignal),
      { elementTypes: ['ITEM'], tagIds: ['t1'] }
    );
    expect(data.results).toEqual([
      {
        elementId: 'ch1',
        name: 'Chapter One',
        type: 'ITEM',
        path: '',
        matchCount: 2,
        snippets: ['It was dark, see'],
      },
    ]);
  });
});
