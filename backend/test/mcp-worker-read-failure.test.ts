/**
 * MCP read tools on Cloudflare Workers: a failed Durable Object read must
 * surface as a tool error, while a document that is legitimately empty still
 * yields an empty result.
 *
 * The Durable Object namespace is faked, so these run on Bun and exercise the
 * real YjsWorkerService, the read tools and the tools/call dispatcher.
 */
import { describe, it, expect } from 'bun:test';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PERMISSIONS } from '../src/mcp/mcp-permissions';
import { YjsDocumentReadError, YjsWorkerService } from '../src/services/yjs-worker.service';
import type { DurableObjectNamespace } from '../src/types/cloudflare';
import '../src/mcp/tools/search.tools';
import '../src/mcp/resources/projects.resource';

type DoFetch = (request: Request) => Promise<Response> | Response;

function fakeNamespace(fetch: DoFetch): DurableObjectNamespace {
  return {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => ({ fetch: (request: Request) => Promise.resolve(fetch(request)) }),
  } as unknown as DurableObjectNamespace;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface ToolCallResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
}

interface ToolCallOutcome {
  result?: ToolCallResult;
  error?: unknown;
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  fetch: DoFetch
): Promise<ToolCallOutcome> {
  const mcpContext = {
    type: 'oauth',
    userId: 'u1',
    username: 'alice',
    authToken: 'token',
    env: { YJS_PROJECTS: fakeNamespace(fetch) },
    grants: [
      {
        projectId: 'p1',
        username: 'alice',
        slug: 'novel',
        role: 'admin',
        permissions: Object.values(MCP_PERMISSIONS),
      },
    ],
  };
  const c = {
    req: {
      header: () => undefined,
      json: () =>
        Promise.resolve({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name, arguments: args },
          id: 1,
        }),
    },
    get: (key: string) => (key === 'mcpContext' ? mcpContext : undefined),
    json: (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status }),
  };
  const res = await handleMcpRequest(c as never);
  return (await res.json()) as ToolCallOutcome;
}

function expectReadError(outcome: ToolCallOutcome): string {
  expect(outcome.error).toBeUndefined();
  expect(outcome.result?.isError).toBe(true);
  const text = outcome.result?.content[0]?.text ?? '';
  expect(text).toContain('could not read project data');
  return text;
}

const project = { project: 'alice/novel' };
const elements = [{ id: 'e1', name: 'Hero', type: 'WORLDBUILDING', parentId: null, level: 0 }];

/** Elements load fine; every `/api/document` read fails with `failure`. */
function documentReadFails(failure: () => Response): DoFetch {
  return (request) =>
    new URL(request.url).pathname === '/api/elements' ? json({ elements }) : failure();
}

describe('YjsWorkerService.getDocument', () => {
  const service = (fetch: DoFetch) =>
    new YjsWorkerService({ env: { YJS_PROJECTS: fakeNamespace(fetch) }, authToken: 'token' });
  const docId = 'alice:novel:elements/';

  it('throws a typed error carrying the status on a non-2xx response', async () => {
    const read = service(() => json({ error: 'Unauthorized' }, 401)).getDocument(docId);
    await expect(read).rejects.toBeInstanceOf(YjsDocumentReadError);
    await read.catch((err: YjsDocumentReadError) => {
      expect(err.status).toBe(401);
      expect(err.docId).toBe(docId);
    });
  });

  it('throws a typed error on a transport failure', async () => {
    const read = service(() => {
      throw new Error('Network connection lost.');
    }).getDocument(docId);
    await expect(read).rejects.toBeInstanceOf(YjsDocumentReadError);
  });

  it('throws a typed error when the body is not a JSON object', async () => {
    await expect(
      service(() => new Response('<html>', { status: 200 })).getDocument(docId)
    ).rejects.toBeInstanceOf(YjsDocumentReadError);
    await expect(service(() => json(null)).getDocument(docId)).rejects.toBeInstanceOf(
      YjsDocumentReadError
    );
  });

  it('returns an empty wrapper for an empty-but-OK document', async () => {
    const doc = await service(() => json({})).getDocument(docId);
    expect(doc.doc.getArray('relationships').length).toBe(0);
    expect(doc.doc.getMap('worldbuilding').has('anything')).toBe(false);
    expect(doc.doc.getXmlFragment('prosemirror')).toBeUndefined();
  });
});

describe('MCP read tools on Workers when the Durable Object read fails', () => {
  const failing = documentReadFails(() => json({ error: 'Internal server error' }, 500));

  it('get_publish_plans returns a tool error, not "no publish plans"', async () => {
    const text = expectReadError(await callTool('get_publish_plans', project, failing));
    expect(text).toContain('500');
    expect(text).toContain('retry');
  });

  it('get_project_metadata returns a tool error', async () => {
    expectReadError(await callTool('get_project_metadata', project, failing));
  });

  it('search_relationships returns a tool error', async () => {
    expectReadError(
      await callTool('search_relationships', { ...project, elementId: 'e1' }, failing)
    );
  });

  it('get_relationships_graph returns a tool error', async () => {
    expectReadError(await callTool('get_relationships_graph', project, failing));
  });

  it('search_worldbuilding returns a tool error', async () => {
    expectReadError(await callTool('search_worldbuilding', { ...project, query: 'hero' }, failing));
  });

  it('get_element_full returns a tool error', async () => {
    expectReadError(await callTool('get_element_full', { ...project, elementId: 'e1' }, failing));
  });

  it('get_document_content returns a tool error', async () => {
    expectReadError(
      await callTool('get_document_content', { ...project, elementId: 'e1' }, failing)
    );
  });

  it('reports a transport failure as a retryable tool error', async () => {
    const text = expectReadError(
      await callTool(
        'get_publish_plans',
        project,
        documentReadFails(() => {
          throw new Error('Network connection lost.');
        })
      )
    );
    expect(text).toContain('retry');
  });

  it('reports an unparseable response as a tool error', async () => {
    expectReadError(
      await callTool(
        'get_publish_plans',
        project,
        documentReadFails(() => new Response('not json', { status: 200 }))
      )
    );
  });

  it('says retrying will not help when access is denied', async () => {
    const text = expectReadError(
      await callTool(
        'get_publish_plans',
        project,
        documentReadFails(() => json({ error: 'Unauthorized' }, 401))
      )
    );
    expect(text).toContain('denied');
    expect(text).not.toContain('retry the call');
  });
});

describe('MCP read tools on Workers with an empty-but-OK document', () => {
  const empty = documentReadFails(() => json({}));

  it('get_publish_plans reports zero plans', async () => {
    const outcome = await callTool('get_publish_plans', project, empty);
    expect(outcome.result?.isError).toBeUndefined();
    expect(outcome.result?.structuredContent).toEqual({ total: 0, plans: [] });
  });

  it('search_relationships reports no relationships', async () => {
    const outcome = await callTool('search_relationships', { ...project, elementId: 'e1' }, empty);
    expect(outcome.result?.isError).toBeUndefined();
    expect(outcome.result?.content[0]?.text).not.toContain('could not read project data');
  });

  it('get_project_metadata succeeds', async () => {
    const outcome = await callTool('get_project_metadata', project, empty);
    expect(outcome.result?.isError).toBeUndefined();
  });

  it('get_document_content reports an empty document', async () => {
    const outcome = await callTool('get_document_content', { ...project, elementId: 'e1' }, empty);
    expect(outcome.result?.isError).toBeUndefined();
    expect(outcome.result?.structuredContent?.content).toBe('');
  });
});

describe('MCP read tools on Workers with project data in the elements doc', () => {
  const plans = [
    { id: 'plan-1', name: 'Paperback' },
    { id: 'plan-2', name: 'EPUB' },
  ];
  const requested: string[] = [];
  const populated: DoFetch = (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/api/elements') return json({ elements });
    const documentId = url.searchParams.get('documentId') ?? '';
    requested.push(documentId);
    if (documentId === 'alice:novel:elements/') {
      return json({
        publishPlans: plans,
        customRelationshipTypes: [{ id: 'rival', name: 'Rival' }],
        projectMeta: { name: 'My Novel', coverMediaId: 'cover-1' },
        relationships: [
          { id: 'r1', sourceElementId: 'e1', targetElementId: 'e1', relationshipTypeId: 'rival' },
        ],
      });
    }
    return json({});
  };

  it('get_publish_plans lists the plans', async () => {
    const outcome = await callTool('get_publish_plans', project, populated);
    expect(outcome.result?.structuredContent).toEqual({ total: 2, plans });
  });

  it('get_publish_plans returns one plan by id', async () => {
    const outcome = await callTool(
      'get_publish_plans',
      { ...project, planId: 'plan-2' },
      populated
    );
    expect(outcome.result?.structuredContent).toEqual(plans[1]);
  });

  it('get_project_metadata includes projectMeta', async () => {
    const outcome = await callTool('get_project_metadata', project, populated);
    expect(outcome.result?.structuredContent).toMatchObject({
      name: 'My Novel',
      coverMediaId: 'cover-1',
    });
  });

  it('get_relationships_graph names custom relationship types', async () => {
    const outcome = await callTool('get_relationships_graph', project, populated);
    expect(JSON.stringify(outcome.result?.structuredContent)).toContain('"Rival"');
  });

  it('reads only documents the frontend writes', () => {
    expect(requested.length).toBeGreaterThan(0);
    expect(requested.every((id) => id === 'alice:novel:elements/')).toBe(true);
  });
});
