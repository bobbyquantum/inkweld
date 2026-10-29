/**
 * Tests for the section-level document tools: `get_document_outline`,
 * `update_document_section`, and `get_document_content` with `section` /
 * `sectionIndex`. The Bun runtime is exercised with a spied `yjsService`;
 * the Workers runtime with a faked Durable Object namespace.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import * as Y from 'yjs';
import { parseXmlToYjsNodes } from '@inkweld/prosemirror/xml';
import { yjsService } from '../src/services/yjs.service';
import { activityService } from '../src/services/activity.service';
import '../src/mcp';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS } from '../src/mcp/mcp.types';
import { MCP_PERMISSIONS } from '../src/mcp/mcp-permissions';
import { parseSectionEditArgs } from '../src/mcp/tools/document-section.tools';
import { parseSectionAddress } from '../src/mcp/tools/document-sections';
import type { DurableObjectNamespace } from '../src/types/cloudflare';

const READ = [MCP_PERMISSIONS.READ_ELEMENTS];
const WRITE = [MCP_PERMISSIONS.READ_ELEMENTS, MCP_PERMISSIONS.WRITE_ELEMENTS];

interface ToolJson {
  result?: {
    tools?: { name: string; inputSchema: { properties: Record<string, unknown> } }[];
    content?: { text: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
  error?: { message: string };
}

async function rpc(
  method: string,
  params: Record<string, unknown>,
  options: { permissions?: string[]; env?: Record<string, unknown> } = {}
): Promise<ToolJson> {
  const grants = [
    {
      projectId: 'id-novel',
      username: 'alice',
      slug: 'novel',
      role: 'editor',
      permissions: options.permissions ?? WRITE,
    },
  ];
  const mcpContext = {
    type: 'oauth',
    userId: 'u1',
    username: 'alice',
    grants,
    ...(options.env ? { env: options.env, authToken: 'token' } : {}),
  };
  const body = {
    jsonrpc: '2.0',
    method,
    id: 1,
    params: {
      ...params,
      _meta: {
        [META_KEYS.protocolVersion]: MCP_PROTOCOL_VERSION,
        [META_KEYS.clientInfo]: { name: 'test', version: '1.0.0' },
        [META_KEYS.clientCapabilities]: {},
      },
    },
  };
  const c = {
    req: { header: () => undefined, json: async () => body },
    get: (key: string) => (key === 'mcpContext' ? mcpContext : {}),
    json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status }),
  };
  const res = await handleMcpRequest(c as never);
  return (await res.json()) as ToolJson;
}

function call(
  name: string,
  args: Record<string, unknown>,
  options: { permissions?: string[]; env?: Record<string, unknown> } = {}
) {
  return rpc(
    'tools/call',
    { name, arguments: { project: 'alice/novel', elementId: 'doc-1', ...args } },
    options
  );
}

function textOf(json: ToolJson): string {
  return json.result?.content?.[0]?.text ?? '';
}

const BOOK =
  '<paragraph>Intro words here</paragraph>' +
  '<heading level="1">Part One</heading>' +
  '<heading level="2">Chapter 1</heading>' +
  '<paragraph>One one</paragraph>' +
  '<heading level="2">Chapter 2</heading>' +
  '<paragraph>Two two two</paragraph>' +
  '<heading level="1">Part Two</heading>' +
  '<heading level="2">Chapter 1</heading>' +
  '<paragraph>Three</paragraph>';

const elements = [
  { id: 'doc-1', name: 'Manuscript', type: 'ITEM', parentId: null, level: 0, order: 0 },
  { id: 'folder-1', name: 'Folder', type: 'FOLDER', parentId: null, level: 0, order: 1 },
];

function docWith(xml: string): Y.Doc {
  const doc = new Y.Doc();
  doc.getXmlFragment('prosemirror').insert(0, parseXmlToYjsNodes(Y, xml));
  return doc;
}

function xmlOf(doc: Y.Doc): string {
  return doc.getXmlFragment('prosemirror').toString();
}

const spies: Array<{ mockRestore: () => void }> = [];

afterEach(() => {
  while (spies.length > 0) spies.pop()?.mockRestore();
});

/** Serve `doc` as the Bun runtime's document for doc-1, and record activity calls. */
function seedBun(xml = BOOK) {
  const doc = docWith(xml);
  spies.push(spyOn(yjsService, 'getElements').mockResolvedValue(elements as never));
  spies.push(
    spyOn(yjsService, 'getDocument').mockImplementation(((docId: string) =>
      docId === 'alice:novel:doc-1/'
        ? Promise.resolve({ doc })
        : Promise.reject(new Error(`unexpected doc ${docId}`))) as never)
  );
  const activity = spyOn(activityService, 'recordOrCoalesceEdit').mockResolvedValue(undefined);
  spies.push(activity);
  return { doc, activity };
}

describe('tool registration', () => {
  it('lists the outline and section tools, and section arguments on get_document_content', async () => {
    const json = await rpc('tools/list', {});
    const tools = json.result?.tools ?? [];
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_document_outline');
    expect(names).toContain('update_document_section');
    const read = tools.find((t) => t.name === 'get_document_content');
    expect(Object.keys(read?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['section', 'sectionIndex'])
    );
  });
});

describe('get_document_outline', () => {
  it('lists the preamble and each heading with its path and size', async () => {
    seedBun();
    const json = await call('get_document_outline', {}, { permissions: READ });
    expect(json.result?.isError).toBeUndefined();
    const outline = json.result?.structuredContent as {
      blockCount: number;
      wordCount: number;
      sections: Record<string, unknown>[];
    };
    expect(outline.blockCount).toBe(9);
    expect(outline.wordCount).toBe(19);
    expect(outline.sections).toEqual([
      { index: 0, level: 0, heading: null, path: '', blockCount: 1, wordCount: 3 },
      { index: 1, level: 1, heading: 'Part One', path: 'Part One', blockCount: 5, wordCount: 11 },
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
        wordCount: 5,
      },
      { index: 4, level: 1, heading: 'Part Two', path: 'Part Two', blockCount: 3, wordCount: 5 },
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

  it('reports a missing element', async () => {
    seedBun();
    const json = await call('get_document_outline', { elementId: 'nope' });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain('element "nope" not found');
  });

  it('requires an elementId', async () => {
    seedBun();
    const json = await call('get_document_outline', { elementId: '  ' });
    expect(textOf(json)).toBe('Error: elementId is required');
  });
});

describe('get_document_content with a section', () => {
  it('returns only the section, in each format', async () => {
    seedBun();
    const xml = await call('get_document_content', { section: 'Chapter 2' }, { permissions: READ });
    expect(textOf(xml)).toBe(
      '<heading level="2">Chapter 2</heading><paragraph>Two two two</paragraph>'
    );
    expect(xml.result?.structuredContent?.section).toEqual({
      index: 3,
      level: 2,
      heading: 'Chapter 2',
      path: 'Part One > Chapter 2',
      blockCount: 2,
    });

    const markdown = await call('get_document_content', {
      section: 'Part Two > Chapter 1',
      format: 'markdown',
    });
    expect(textOf(markdown).trim()).toBe('## Chapter 1\n\nThree');

    const text = await call('get_document_content', { sectionIndex: 0, format: 'text' });
    expect(textOf(text)).toBe('Intro words here');
  });

  it('accepts a sectionIndex sent as a string', async () => {
    seedBun();
    const json = await call('get_document_content', { sectionIndex: '3' });
    expect(json.result?.structuredContent?.section).toMatchObject({ heading: 'Chapter 2' });
  });

  it('says when the section is empty', async () => {
    seedBun('<heading level="1">Only</heading>');
    const json = await call('get_document_content', { sectionIndex: 0 });
    expect(textOf(json)).toBe('(the content before the first heading is empty)');
  });

  it('reports an ambiguous heading or a bad argument', async () => {
    seedBun();
    const ambiguous = await call('get_document_content', { section: 'Chapter 1' });
    expect(ambiguous.result?.isError).toBe(true);
    expect(textOf(ambiguous)).toContain('2 headings match "Chapter 1"');

    const bad = await call('get_document_content', { sectionIndex: 'two' });
    expect(textOf(bad)).toContain('sectionIndex must be a whole number');
  });

  it('still returns the whole document without a section', async () => {
    seedBun();
    const json = await call('get_document_content', { section: '' });
    expect(textOf(json)).toBe(BOOK);
  });
});

describe('update_document_section', () => {
  it('replaces one section and leaves the other blocks untouched', async () => {
    const { doc, activity } = seedBun();
    const fragment = doc.getXmlFragment('prosemirror');
    const before = fragment.toArray();

    const json = await call('update_document_section', {
      section: 'Chapter 2',
      operation: 'replace',
      format: 'markdown',
      content: '## Chapter Two\n\nRewritten text.',
    });

    expect(json.result?.isError).toBeUndefined();
    expect(xmlOf(doc)).toBe(
      BOOK.replace(
        '<heading level="2">Chapter 2</heading><paragraph>Two two two</paragraph>',
        '<heading level="2">Chapter Two</heading><paragraph>Rewritten text.</paragraph>'
      )
    );
    // Untouched blocks are the same Yjs items, not copies.
    const after = fragment.toArray();
    expect(after[3]).toBe(before[3]);
    expect(after[6]).toBe(before[6]);

    expect(json.result?.structuredContent).toMatchObject({
      success: true,
      operation: 'replace',
      format: 'markdown',
      section: { index: 3, heading: 'Chapter 2', path: 'Part One > Chapter 2' },
      blocksRemoved: 2,
      blocksInserted: 2,
      previousWordCount: 19,
      wordCount: 18,
      wordsDelta: -1,
      sectionCount: 6,
    });
    expect(json.result?.structuredContent?.notes).toBeUndefined();
    expect(textOf(json)).toBe(
      'Replaced section "Chapter 2" in "Manuscript" (2 blocks removed, 2 added; 18 words, -1 vs. previous).'
    );

    expect(activity).toHaveBeenCalledTimes(1);
    expect(activity.mock.calls[0][1]).toMatchObject({
      projectId: 'id-novel',
      userId: 'u1',
      entityId: 'doc-1',
      entityName: 'Manuscript',
      wordsDelta: -1,
      endWordCount: 18,
      metadata: { source: 'mcp', format: 'markdown', operation: 'replace', section: 'Chapter 2' },
    });
  });

  it('replaces the body under a heading, subsections included', async () => {
    const { doc } = seedBun();
    await call('update_document_section', {
      section: 'Part One',
      operation: 'replace_body',
      content: '<paragraph>Summary</paragraph>',
    });
    expect(xmlOf(doc)).toBe(
      '<paragraph>Intro words here</paragraph><heading level="1">Part One</heading><paragraph>Summary</paragraph>' +
        '<heading level="1">Part Two</heading><heading level="2">Chapter 1</heading><paragraph>Three</paragraph>'
    );
  });

  it('prepends after the heading, appends after the subsections and inserts before the heading', async () => {
    const { doc } = seedBun(
      '<heading level="1">A</heading><paragraph>a</paragraph><heading level="2">A1</heading><heading level="1">B</heading>'
    );
    await call('update_document_section', {
      section: 'A',
      operation: 'prepend',
      content: '<paragraph>first</paragraph>',
    });
    await call('update_document_section', {
      section: 'A',
      operation: 'append',
      content: '<paragraph>last</paragraph>',
    });
    const inserted = await call('update_document_section', {
      section: 'B',
      operation: 'insert_before',
      format: 'markdown',
      content: '# Interlude',
    });
    expect(xmlOf(doc)).toBe(
      '<heading level="1">A</heading><paragraph>first</paragraph><paragraph>a</paragraph>' +
        '<heading level="2">A1</heading><paragraph>last</paragraph>' +
        '<heading level="1">Interlude</heading><heading level="1">B</heading>'
    );
    expect(inserted.result?.structuredContent?.notes).toEqual([
      'The document now has 4 headings (was 3), so later section indexes have changed; read the outline again before using one.',
    ]);
  });

  it('deletes a section, ignoring any content', async () => {
    const { doc } = seedBun();
    const json = await call('update_document_section', {
      sectionIndex: 4,
      section: 'Part Two',
      operation: 'delete',
      content: '<paragraph>ignored</paragraph>',
    });
    expect(xmlOf(doc)).toBe(BOOK.slice(0, BOOK.indexOf('<heading level="1">Part Two')));
    expect(json.result?.structuredContent).toMatchObject({ blocksRemoved: 3, blocksInserted: 0 });
    expect(textOf(json)).toContain('Deleted section "Part Two"');
  });

  it('edits the content before the first heading as section 0', async () => {
    const { doc } = seedBun();
    await call('update_document_section', {
      sectionIndex: 0,
      operation: 'replace',
      content: '<paragraph>New intro</paragraph><paragraph>More</paragraph>',
    });
    expect(
      xmlOf(doc).startsWith('<paragraph>New intro</paragraph><paragraph>More</paragraph><heading')
    ).toBe(true);
  });

  it('appends to a document without headings', async () => {
    const { doc } = seedBun('<paragraph>Only text</paragraph>');
    await call('update_document_section', {
      sectionIndex: 0,
      operation: 'append',
      format: 'markdown',
      content: 'More text',
    });
    expect(xmlOf(doc)).toBe('<paragraph>Only text</paragraph><paragraph>More text</paragraph>');
  });

  it('notes when a replacement drops the section heading', async () => {
    seedBun();
    const json = await call('update_document_section', {
      section: 'Chapter 2',
      operation: 'replace',
      content: '<paragraph>No heading</paragraph>',
    });
    expect(json.result?.structuredContent?.notes).toEqual([
      'The new content does not start with a heading, so it is now part of the section before it.',
      'The document now has 4 headings (was 5), so later section indexes have changed; read the outline again before using one.',
    ]);
  });

  it('refuses a stale index, an ambiguous heading or a missing section without writing', async () => {
    const { doc, activity } = seedBun();
    const stale = await call('update_document_section', {
      sectionIndex: 2,
      section: 'Chapter 2',
      operation: 'delete',
    });
    expect(textOf(stale)).toContain('section 2 is "Chapter 1", not "Chapter 2"');

    const ambiguous = await call('update_document_section', {
      section: 'Chapter 1',
      operation: 'delete',
    });
    expect(textOf(ambiguous)).toContain('2 headings match');

    const missing = await call('update_document_section', {
      section: 'Epilogue',
      operation: 'delete',
    });
    expect(textOf(missing)).toContain('no heading matches "Epilogue"');

    expect(xmlOf(doc)).toBe(BOOK);
    expect(activity).not.toHaveBeenCalled();
  });

  it('refuses bare text and malformed XML', async () => {
    const { doc } = seedBun();
    const bare = await call('update_document_section', {
      section: 'Chapter 2',
      operation: 'append',
      content: 'just text',
    });
    expect(textOf(bare)).toContain('content must be block nodes');

    const malformed = await call('update_document_section', {
      section: 'Chapter 2',
      operation: 'append',
      content: '<paragraph><bold>oops</paragraph></bold>',
    });
    expect(textOf(malformed)).toContain('could not parse content');
    expect(xmlOf(doc)).toBe(BOOK);
  });

  it('only edits document elements', async () => {
    seedBun();
    const folder = await call('update_document_section', {
      elementId: 'folder-1',
      sectionIndex: 0,
      operation: 'delete',
    });
    expect(textOf(folder)).toContain('is type "FOLDER", not a document (ITEM)');

    const missing = await call('update_document_section', {
      elementId: 'ghost',
      sectionIndex: 0,
      operation: 'delete',
    });
    expect(textOf(missing)).toContain('element "ghost" not found');
  });

  it('needs write permission', async () => {
    const { doc } = seedBun();
    const json = await call(
      'update_document_section',
      { sectionIndex: 0, operation: 'delete' },
      { permissions: READ }
    );
    expect(json.result?.isError ?? !!json.error).toBe(true);
    expect(xmlOf(doc)).toBe(BOOK);
  });
});

describe('parseSectionEditArgs', () => {
  const base = { elementId: 'doc-1', sectionIndex: 1 };

  it('validates the operation, format, content and section', () => {
    expect(parseSectionEditArgs({ ...base })).toEqual({
      error:
        'operation must be one of replace, replace_body, prepend, append, insert_before, delete (got null)',
    });
    expect(parseSectionEditArgs({ ...base, operation: 'rewrite' })).toMatchObject({
      error: expect.stringContaining('(got "rewrite")'),
    });
    expect(parseSectionEditArgs({ ...base, operation: 'append', format: 'html' })).toEqual({
      error: 'invalid format "html". Use "prosemirror_xml" or "markdown".',
    });
    expect(parseSectionEditArgs({ ...base, operation: 'append', content: ' ' })).toEqual({
      error: 'content is required for "append"',
    });
    expect(parseSectionEditArgs({ ...base, operation: 'replace', content: 5 })).toEqual({
      error: 'content must be a string',
    });
    expect(parseSectionEditArgs({ elementId: 'doc-1', operation: 'delete' })).toMatchObject({
      error: expect.stringContaining('name the section'),
    });
    expect(parseSectionEditArgs({ operation: 'delete', sectionIndex: 0 })).toEqual({
      error: 'elementId is required',
    });
  });

  it('allows empty content for replace and replace_body', () => {
    expect(parseSectionEditArgs({ ...base, operation: 'replace_body' })).toEqual({
      elementId: 'doc-1',
      operation: 'replace_body',
      format: 'prosemirror_xml',
      content: '',
      address: { heading: undefined, index: 1 },
    });
  });
});

describe('parseSectionAddress', () => {
  it('reads heading text and a numeric or string index', () => {
    expect(parseSectionAddress({})).toEqual({ address: null });
    expect(parseSectionAddress({ section: '  ' })).toEqual({ address: null });
    expect(parseSectionAddress({ section: 'Ch 1', sectionIndex: 2 })).toEqual({
      address: { heading: 'Ch 1', index: 2 },
    });
    expect(parseSectionAddress({ sectionIndex: ' 4 ' })).toEqual({
      address: { heading: undefined, index: 4 },
    });
    expect(parseSectionAddress({ section: 3 })).toMatchObject({
      error: expect.stringContaining('section must be a string'),
    });
    expect(parseSectionAddress({ sectionIndex: '-1' })).toMatchObject({
      error: expect.stringContaining('sectionIndex must be a whole number'),
    });
  });
});

// ---------------------------------------------------------------------------
// Cloudflare Workers runtime
// ---------------------------------------------------------------------------

type DoFetch = (request: Request) => Promise<Response> | Response;

function fakeNamespace(fetch: DoFetch): DurableObjectNamespace {
  return {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => ({ fetch: (request: Request) => Promise.resolve(fetch(request)) }),
  } as unknown as DurableObjectNamespace;
}

/**
 * A Durable Object holding `serverDoc`: serves its elements and full state,
 * and applies posted Yjs updates. `afterStateRead` runs once the state has
 * been sent, to simulate a collaborator editing in between.
 */
function fakeProjectObject(serverDoc: Y.Doc, afterStateRead?: () => void) {
  const posted: string[] = [];
  const fetch: DoFetch = async (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/elements') {
      return new Response(JSON.stringify({ elements }), { status: 200 });
    }
    if (url.pathname === '/api/document-state') {
      expect(url.searchParams.get('documentId')).toBe('alice:novel:doc-1/');
      const state = Y.encodeStateAsUpdate(serverDoc);
      afterStateRead?.();
      return new Response(state, { status: 200 });
    }
    if (url.pathname === '/api/document' && request.method === 'POST') {
      const body = (await request.json()) as { yUpdate: string };
      posted.push(body.yUpdate);
      Y.applyUpdate(
        serverDoc,
        Uint8Array.from(atob(body.yUpdate), (c) => c.codePointAt(0) ?? 0)
      );
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response('unexpected', { status: 500 });
  };
  return { env: { YJS_PROJECTS: fakeNamespace(fetch) }, posted };
}

describe('on Cloudflare Workers', () => {
  it('reads the outline and a section from the document state', async () => {
    const { env, posted } = fakeProjectObject(docWith(BOOK));
    const outline = await call('get_document_outline', {}, { env, permissions: READ });
    expect(outline.result?.structuredContent?.sections as unknown[]).toHaveLength(6);

    const section = await call(
      'get_document_content',
      { section: 'Part Two', format: 'markdown' },
      { env, permissions: READ }
    );
    expect(textOf(section).trim()).toBe('# Part Two\n\n## Chapter 1\n\nThree');
    expect(posted).toEqual([]);
  });

  it('sends only the change, merging a collaborator edit made in between', async () => {
    const serverDoc = docWith(BOOK);
    const { env, posted } = fakeProjectObject(serverDoc, () => {
      // Someone types a new paragraph at the end after MCP read the state.
      serverDoc
        .getXmlFragment('prosemirror')
        .push(parseXmlToYjsNodes(Y, '<paragraph>Typed meanwhile</paragraph>') as Y.XmlElement[]);
    });
    spies.push(spyOn(activityService, 'recordOrCoalesceEdit').mockResolvedValue(undefined));

    const json = await call(
      'update_document_section',
      { section: 'Chapter 2', operation: 'replace_body', content: '<paragraph>New</paragraph>' },
      { env }
    );
    expect(json.result?.isError).toBeUndefined();
    expect(posted).toHaveLength(1);
    expect(xmlOf(serverDoc)).toBe(
      BOOK.replace('<paragraph>Two two two</paragraph>', '<paragraph>New</paragraph>') +
        '<paragraph>Typed meanwhile</paragraph>'
    );
  });

  it('surfaces a failed state read as a read error', async () => {
    const env = {
      YJS_PROJECTS: fakeNamespace((request) =>
        new URL(request.url).pathname === '/api/elements'
          ? new Response(JSON.stringify({ elements }), { status: 200 })
          : new Response('boom', { status: 503 })
      ),
    };
    const json = await call('get_document_outline', {}, { env, permissions: READ });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain('could not read project data');
  });
});
