import { Injector } from '@angular/core';
import { ElementType } from '@inkweld/index';
import { YDocAccessService } from '@services/cloud-sync/ydoc-access.service';
import { ProjectSearchService } from '@services/core/project-search.service';
import { SetupService } from '@services/core/setup.service';
import { DocumentService } from '@services/project/document.service';
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
import { documentTools } from './document.tools';
import { ProjectToolContext } from './project-context';
import type { WebMcpToolDefinition } from './tool';

/**
 * 0 intro                (preamble)
 * 1 # Part One
 * 2 ## Chapter 1         one, with a comment
 * 3 ## Chapter 2         two
 * 4 # Part Two
 * 5 ## Chapter 1         three
 */
const BOOK = [
  '<paragraph>Intro.</paragraph>',
  '<heading level="1">Part One</heading>',
  '<heading level="2">Chapter 1</heading>',
  '<paragraph>One <span data-mark="comment" commentId="c1">noted</span>.</paragraph>',
  '<heading level="2">Chapter 2</heading>',
  '<paragraph>Fish &amp; chips &lt;2&gt;.</paragraph>',
  '<heading level="1">Part Two</heading>',
  '<heading level="2">Chapter 1</heading>',
  '<paragraph>Three.</paragraph>',
];

function docWith(xml: string): Y.Doc {
  const doc = new Y.Doc();
  applyXmlToFragment(doc, doc.getXmlFragment('prosemirror'), xml);
  return doc;
}

const xmlOf = (doc: Y.Doc): string =>
  xmlFragmentToXmlString(doc.getXmlFragment('prosemirror'));

interface Setup {
  live?: Y.Doc;
  headless?: Y.Doc;
  mode?: 'local' | 'server';
}

function setup(options: Setup) {
  const state: ProjectStateFake = createProjectStateFake([
    element('ch1', 'Chapter One', ElementType.Item),
    element('elena', 'Elena', ElementType.Worldbuilding),
  ]);
  const localEdits: string[] = [];
  const localEdit$ = new Subject<string>();
  localEdit$.subscribe(id => localEdits.push(id));
  const syncDocumentToServer = vi.fn().mockResolvedValue('digest');
  const flush = vi.fn().mockResolvedValue(undefined);
  const release = vi.fn().mockResolvedValue(undefined);
  const acquireDocument = vi.fn(() =>
    Promise.resolve({ doc: options.headless, live: false, flush, release })
  );

  const injector = Injector.create({
    providers: [
      { provide: ProjectStateService, useValue: state },
      { provide: ElementTreeService, useClass: ElementTreeService },
      {
        provide: LiveDocumentRegistryService,
        useValue: {
          getConnectedYDoc: (id: string) =>
            id === 'alice:novel:ch1' ? (options.live ?? null) : null,
          localEdit$,
        },
      },
      {
        provide: SetupService,
        useValue: { getMode: () => options.mode ?? 'local' },
      },
      { provide: DocumentService, useValue: { syncDocumentToServer } },
      {
        provide: YDocAccessService,
        useValue: {
          documentExists: () => Promise.resolve(!!options.headless),
          acquireDocument,
        },
      },
      { provide: ProjectSearchService, useValue: {} },
    ],
  });
  const tools: WebMcpToolDefinition[] = documentTools(
    injector,
    new ProjectToolContext(injector)
  );
  return {
    state,
    tools,
    localEdits,
    syncDocumentToServer,
    flush,
    release,
    acquireDocument,
  };
}

describe('document section tools', () => {
  describe('on an open document', () => {
    let doc: Y.Doc;
    let env: ReturnType<typeof setup>;

    beforeEach(() => {
      doc = docWith(BOOK.join(''));
      env = setup({ live: doc });
    });

    describe('get_document_outline', () => {
      it('lists the sections with their paths and sizes', async () => {
        const { data } = await callTool(env.tools, 'get_document_outline', {
          elementId: 'ch1',
        });
        expect(data).toMatchObject({
          elementId: 'ch1',
          name: 'Chapter One',
          blockCount: 9,
          wordCount: 18,
        });
        expect(data.sections).toEqual([
          {
            index: 0,
            level: 0,
            heading: null,
            path: '',
            blockCount: 1,
            wordCount: 1,
          },
          {
            index: 1,
            level: 1,
            heading: 'Part One',
            path: 'Part One',
            blockCount: 5,
            wordCount: 12,
          },
          {
            index: 2,
            level: 2,
            heading: 'Chapter 1',
            path: 'Part One > Chapter 1',
            blockCount: 2,
            wordCount: 4,
          },
          {
            index: 3,
            level: 2,
            heading: 'Chapter 2',
            path: 'Part One > Chapter 2',
            blockCount: 2,
            wordCount: 6,
          },
          {
            index: 4,
            level: 1,
            heading: 'Part Two',
            path: 'Part Two',
            blockCount: 3,
            wordCount: 5,
          },
          {
            index: 5,
            level: 2,
            heading: 'Chapter 1',
            path: 'Part Two > Chapter 1',
            blockCount: 2,
            wordCount: 3,
          },
        ]);
      });

      it('only outlines documents', async () => {
        const { error } = await callTool(env.tools, 'get_document_outline', {
          elementId: 'elena',
        });
        expect(error).toContain('not a document');
      });
    });

    describe('get_document_content with a section', () => {
      it('reads a section by path as lossless XML', async () => {
        const { data } = await callTool(env.tools, 'get_document_content', {
          elementId: 'ch1',
          section: 'part one > chapter 2',
          format: 'xml',
        });
        expect(data.content).toBe(BOOK[4] + BOOK[5]);
        expect(data.section).toEqual({
          index: 3,
          level: 2,
          heading: 'Chapter 2',
          path: 'Part One > Chapter 2',
          blockCount: 2,
          wordCount: 6,
        });
        // The document's own word count, as without a section.
        expect(data.wordCount).toBe(18);
      });

      it('reads a section by index as Markdown or text', async () => {
        const asMarkdown = await callTool(env.tools, 'get_document_content', {
          elementId: 'ch1',
          sectionIndex: 5,
        });
        expect(asMarkdown.data.content).toBe('## Chapter 1\n\nThree.');

        // Agents sometimes send numbers as strings.
        const asText = await callTool(env.tools, 'get_document_content', {
          elementId: 'ch1',
          sectionIndex: '0',
          format: 'text',
        });
        expect(asText.data.content).toBe('Intro.');
        expect(asText.data.section.heading).toBeNull();
      });

      it('reads the whole document without a section', async () => {
        const { data } = await callTool(env.tools, 'get_document_content', {
          elementId: 'ch1',
          format: 'xml',
          section: '  ',
        });
        expect(data.content).toBe(BOOK.join(''));
        expect(data.section).toBeUndefined();
      });

      it('explains a section it cannot find', async () => {
        const call = (args: Record<string, unknown>) =>
          callTool(env.tools, 'get_document_content', {
            elementId: 'ch1',
            ...args,
          });

        expect((await call({ section: 'Chapter 1' })).error).toBe(
          '2 headings match "Chapter 1": [2] Part One > Chapter 1; [5] Part Two > Chapter 1. Pass sectionIndex, or a longer path.'
        );
        expect((await call({ section: 'Epilogue' })).error).toContain(
          'no heading matches "Epilogue". Headings: [1] Part One'
        );
        expect(
          (await call({ section: 'Part Two', sectionIndex: 1 })).error
        ).toContain('section 1 is "Part One", not "Part Two"');
        expect((await call({ sectionIndex: 9 })).error).toContain(
          'sectionIndex 9 is out of range: this document has sections 0 to 5'
        );
        expect((await call({ sectionIndex: true })).error).toBe(
          'sectionIndex must be a whole number (0 is the content before the first heading)'
        );
        expect((await call({ section: 3 })).error).toContain(
          'section must be a string'
        );
      });
    });

    describe('update_document_section', () => {
      const edit = (args: Record<string, unknown>) =>
        callTool(env.tools, 'update_document_section', {
          elementId: 'ch1',
          ...args,
        });

      it('replaces only the blocks of one section, in one update', async () => {
        const fragment = doc.getXmlFragment('prosemirror');
        const commented = fragment.get(3);
        const updates = vi.fn();
        doc.on('update', updates);

        const { data } = await edit({
          section: 'Part One > Chapter 2',
          operation: 'replace_body',
          content: 'Pies *instead*.',
        });

        expect(xmlOf(doc)).toBe(
          [
            ...BOOK.slice(0, 5),
            '<paragraph>Pies <em>instead</em>.</paragraph>',
            ...BOOK.slice(6),
          ].join('')
        );
        // Untouched blocks keep their Yjs items (and comments with them).
        expect(fragment.get(3)).toBe(commented);
        expect(updates).toHaveBeenCalledTimes(1);
        expect(data).toEqual({
          elementId: 'ch1',
          name: 'Chapter One',
          operation: 'replace_body',
          format: 'markdown',
          section: {
            index: 3,
            level: 2,
            heading: 'Chapter 2',
            path: 'Part One > Chapter 2',
          },
          blocksRemoved: 1,
          blocksInserted: 1,
          wordCount: 16,
          previousWordCount: 18,
          wordsDelta: -2,
          sectionCount: 6,
        });
      });

      it('takes a section read as XML back unchanged', async () => {
        const read = await callTool(env.tools, 'get_document_content', {
          elementId: 'ch1',
          sectionIndex: 3,
          format: 'xml',
        });
        const { data } = await edit({
          sectionIndex: 3,
          operation: 'replace',
          content: read.data.content,
          format: 'xml',
        });
        expect(xmlOf(doc)).toBe(BOOK.join(''));
        expect(data.wordsDelta).toBe(0);
        expect(data.notes).toBeUndefined();
      });

      it('appends a new section after the subsections', async () => {
        const { data } = await edit({
          section: 'Part One',
          operation: 'append',
          content: '## Chapter 3\n\nFour.',
        });
        expect(xmlOf(doc)).toBe(
          [
            ...BOOK.slice(0, 6),
            '<heading level="2">Chapter 3</heading><paragraph>Four.</paragraph>',
            ...BOOK.slice(6),
          ].join('')
        );
        expect(data.sectionCount).toBe(7);
        expect(data.notes).toEqual([
          'The document now has 6 headings (was 5), so later section indexes have changed; read the outline again before using one.',
        ]);
      });

      it('prepends after the heading and inserts before it', async () => {
        await edit({
          section: 'Part Two',
          operation: 'prepend',
          content: '<paragraph>Later.</paragraph>',
          format: 'xml',
        });
        await edit({
          section: 'Part Two',
          operation: 'insert_before',
          content: '<horizontal_rule/>',
          format: 'xml',
        });
        expect(xmlOf(doc)).toBe(
          [
            ...BOOK.slice(0, 6),
            '<horizontal_rule/>',
            BOOK[6],
            '<paragraph>Later.</paragraph>',
            ...BOOK.slice(7),
          ].join('')
        );
      });

      it('treats the preamble as a section without a heading', async () => {
        await edit({
          sectionIndex: 0,
          operation: 'prepend',
          content: 'First.',
        });
        expect(xmlOf(doc).startsWith('<paragraph>First.</paragraph>')).toBe(
          true
        );

        const { data } = await edit({
          sectionIndex: 0,
          operation: 'replace_body',
          content: '',
        });
        expect(data.blocksRemoved).toBe(2);
        expect(xmlOf(doc)).toBe(BOOK.slice(1).join(''));
      });

      it('deletes a section with its subsections, ignoring content', async () => {
        const { data } = await edit({
          section: 'Part One',
          operation: 'delete',
          content: 'ignored',
        });
        expect(xmlOf(doc)).toBe([BOOK[0], ...BOOK.slice(6)].join(''));
        expect(data).toMatchObject({
          blocksRemoved: 5,
          blocksInserted: 0,
          sectionCount: 3,
        });
      });

      it('notes a replacement that drops the heading', async () => {
        const { data } = await edit({
          section: 'Part Two',
          operation: 'replace',
          content: 'No heading any more.',
        });
        expect(data.notes).toEqual([
          'The new content does not start with a heading, so it is now part of the section before it.',
          'The document now has 3 headings (was 5), so later section indexes have changed; read the outline again before using one.',
        ]);
      });

      it('checks its arguments before touching the document', async () => {
        const updates = vi.fn();
        doc.on('update', updates);

        expect((await edit({ section: 'Part One' })).error).toBe(
          'operation must be one of replace, replace_body, prepend, append, insert_before, delete (got null)'
        );
        expect(
          (await edit({ section: 'Part One', operation: 'append' })).error
        ).toBe('content is required for "append"');
        expect(
          (
            await edit({
              section: 'Part One',
              operation: 'replace',
              content: 7,
            })
          ).error
        ).toBe('content must be a string');
        expect(
          (await edit({ operation: 'append', content: 'x' })).error
        ).toContain('name the section with section');
        expect(
          (
            await edit({
              section: 'Part One',
              operation: 'append',
              content: 'bare text',
              format: 'xml',
            })
          ).error
        ).toContain('wrap bare text in a <paragraph>');
        expect(
          (
            await edit({
              section: 'Part One',
              operation: 'append',
              content: '<paragraph>mismatched</heading>',
              format: 'xml',
            })
          ).error
        ).toContain('could not parse content');
        expect(
          (
            await edit({
              section: 'Part One',
              operation: 'append',
              content: 'x',
              format: 'html',
            })
          ).error
        ).toContain('"format" must be one of: markdown, xml');
        expect(
          (await edit({ section: 'Epilogue', operation: 'delete' })).error
        ).toContain('no heading matches "Epilogue"');

        expect(updates).not.toHaveBeenCalled();
        expect(xmlOf(doc)).toBe(BOOK.join(''));
      });

      it('needs write access and a document', async () => {
        expect(
          (
            await callTool(env.tools, 'update_document_section', {
              elementId: 'elena',
              sectionIndex: 0,
              operation: 'delete',
            })
          ).error
        ).toContain('not a document');

        env.state.canWrite.set(false);
        const { error } = await edit({ sectionIndex: 0, operation: 'delete' });
        expect(error).toContain('read access');
      });
    });
  });

  describe('on a document without an editor', () => {
    it('pulls a server copy before outlining it', async () => {
      const env = setup({ headless: docWith(BOOK.join('')), mode: 'server' });

      const { data } = await callTool(env.tools, 'get_document_outline', {
        elementId: 'ch1',
      });

      expect(data.sections).toHaveLength(6);
      expect(env.syncDocumentToServer).toHaveBeenCalledTimes(1);
      expect(env.release).toHaveBeenCalled();
    });

    it('outlines a document that was never stored as empty', async () => {
      const env = setup({});
      const { data } = await callTool(env.tools, 'get_document_outline', {
        elementId: 'ch1',
      });
      expect(data).toMatchObject({ blockCount: 0, wordCount: 0 });
      expect(data.sections).toEqual([
        {
          index: 0,
          level: 0,
          heading: null,
          path: '',
          blockCount: 0,
          wordCount: 0,
        },
      ]);
      expect(env.acquireDocument).not.toHaveBeenCalled();
    });

    it('edits the stored copy, then saves, reports and pushes it', async () => {
      const headless = docWith(BOOK.join(''));
      const env = setup({ headless, mode: 'server' });

      const { data } = await callTool(env.tools, 'update_document_section', {
        elementId: 'ch1',
        section: 'Part Two',
        operation: 'delete',
      });

      expect(data.blocksRemoved).toBe(3);
      expect(xmlOf(headless)).toBe(BOOK.slice(0, 6).join(''));
      expect(env.flush).toHaveBeenCalled();
      expect(env.release).toHaveBeenCalled();
      expect(env.localEdits).toEqual(['alice:novel:ch1']);
      expect(env.syncDocumentToServer).toHaveBeenCalledTimes(2);
    });

    it('saves nothing when the section is not found', async () => {
      const headless = docWith(BOOK.join(''));
      const env = setup({ headless, mode: 'server' });

      const { error } = await callTool(env.tools, 'update_document_section', {
        elementId: 'ch1',
        section: 'Epilogue',
        operation: 'delete',
      });

      expect(error).toContain('no heading matches');
      expect(env.flush).not.toHaveBeenCalled();
      expect(env.release).toHaveBeenCalled();
      expect(env.localEdits).toEqual([]);
      expect(env.syncDocumentToServer).toHaveBeenCalledTimes(1);
    });
  });
});
