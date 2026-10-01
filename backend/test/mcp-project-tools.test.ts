/**
 * Tests for the project discovery tools (`list_projects`, `get_project_schemas`).
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import * as Y from 'yjs';
import { yjsService } from '../src/services/yjs.service';
import '../src/mcp';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS } from '../src/mcp/mcp.types';

interface Grant {
  projectId: string;
  username: string;
  slug: string;
  role: string;
  permissions: string[];
}

const FULL = ['read:project', 'read:elements', 'read:schemas'];

function grant(slug: string, permissions: string[]): Grant {
  return { projectId: `id-${slug}`, username: 'alice', slug, role: 'viewer', permissions };
}

async function rpc(grants: Grant[], method: string, params: Record<string, unknown> = {}) {
  const mcpContext = { type: 'oauth', userId: 'u', username: 'alice', grants };
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
  return (await res.json()) as {
    result?: { tools?: { name: string }[]; content?: { text: string }[]; isError?: boolean };
    error?: { message: string };
  };
}

function textOf(json: Awaited<ReturnType<typeof rpc>>): string {
  return json.result?.content?.[0]?.text ?? '';
}

/** Make yjsService.getDocument return an elements doc seeded with `schemas`. */
function seedSchemas(schemas: unknown[]) {
  const doc = new Y.Doc();
  doc.getArray('schemas').push(schemas);
  return spyOn(yjsService, 'getDocument').mockResolvedValue({ doc } as never);
}

describe('MCP project tools', () => {
  afterEach(() => {
    (yjsService.getDocument as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it('lists list_projects in tools/list even without read permissions', async () => {
    const json = await rpc([grant('novel', [])], 'tools/list');
    const names = json.result?.tools?.map((t) => t.name) ?? [];
    expect(names).toContain('list_projects');
    expect(names).not.toContain('get_project_schemas');
  });

  it('lists get_project_schemas when read:schemas is granted', async () => {
    const json = await rpc([grant('novel', FULL)], 'tools/list');
    const names = json.result?.tools?.map((t) => t.name) ?? [];
    expect(names).toContain('get_project_schemas');
  });

  it('list_projects returns the authorized projects', async () => {
    const json = await rpc(
      [grant('novel', FULL), grant('poems', ['read:elements'])],
      'tools/call',
      {
        name: 'list_projects',
        arguments: {},
      }
    );
    const data = JSON.parse(textOf(json)) as {
      totalProjects: number;
      projects: { projectKey: string; role: string; permissionSummary: string }[];
      usage: { note: string };
    };
    expect(data.totalProjects).toBe(2);
    expect(data.projects.map((p) => p.projectKey)).toEqual(['alice/novel', 'alice/poems']);
    expect(data.projects[0].role).toBe('viewer');
    expect(data.projects[1].permissionSummary).toBe('elements (read)');
    expect(data.usage.note).toContain('projectKey');
  });

  it('list_projects returns an empty list when there are no grants', async () => {
    const json = await rpc([], 'tools/call', { name: 'list_projects', arguments: {} });
    const data = JSON.parse(textOf(json)) as { totalProjects: number };
    expect(data.totalProjects).toBe(0);
  });

  it('get_project_schemas returns the project schemas from the elements doc', async () => {
    const spy = seedSchemas([
      { id: 'character-v1', name: 'Character', icon: 'person', tabs: [{ key: 'basics' }] },
      { id: 'location-v1', name: 'Location', icon: 'place', tabs: [] },
    ]);
    const json = await rpc([grant('novel', FULL)], 'tools/call', {
      name: 'get_project_schemas',
      arguments: { project: 'alice/novel' },
    });
    expect(json.result?.isError).toBeUndefined();
    const data = JSON.parse(textOf(json)) as {
      total: number;
      schemas: { id: string; name: string; tabs: unknown[] }[];
    };
    expect(data.total).toBe(2);
    expect(data.schemas.map((x) => x.id)).toEqual(['character-v1', 'location-v1']);
    expect(data.schemas[0].name).toBe('Character');
    expect(data.schemas[0].tabs).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith('alice:novel:elements/');
  });

  it('get_project_schemas returns an empty list when the project has no schemas', async () => {
    seedSchemas([]);
    const json = await rpc([grant('novel', FULL)], 'tools/call', {
      name: 'get_project_schemas',
      arguments: { project: 'alice/novel' },
    });
    const data = JSON.parse(textOf(json)) as { total: number };
    expect(data.total).toBe(0);
  });

  it('get_project_schemas reports a read failure as a tool error', async () => {
    spyOn(yjsService, 'getDocument').mockRejectedValue(new Error('boom'));
    const json = await rpc([grant('novel', FULL)], 'tools/call', {
      name: 'get_project_schemas',
      arguments: { project: 'alice/novel' },
    });
    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0].text).toContain('failed to read schemas');
  });

  it('get_project_schemas is denied without read:schemas', async () => {
    const json = await rpc([grant('novel', ['read:elements'])], 'tools/call', {
      name: 'get_project_schemas',
      arguments: { project: 'alice/novel' },
    });
    expect(json.error?.message).toContain('Permission denied');
  });

  it('get_project_schemas rejects an unauthorized project', async () => {
    const json = await rpc([grant('novel', FULL)], 'tools/call', {
      name: 'get_project_schemas',
      arguments: { project: 'alice/other' },
    });
    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0].text).toContain('not found in authorized projects');
  });

  it('get_project_schemas denies a project whose grant lacks read:schemas', async () => {
    const json = await rpc(
      [grant('novel', FULL), grant('poems', ['read:elements'])],
      'tools/call',
      { name: 'get_project_schemas', arguments: { project: 'alice/poems' } }
    );
    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0].text).toContain('not granted');
  });

  it('exposes tools granted by any project, not only the first grant', async () => {
    seedSchemas([{ id: 'character-v1', name: 'Character' }]);
    const grants = [grant('poems', ['read:elements']), grant('novel', FULL)];

    const list = await rpc(grants, 'tools/list');
    expect(list.result?.tools?.map((t) => t.name)).toContain('get_project_schemas');

    const call = await rpc(grants, 'tools/call', {
      name: 'get_project_schemas',
      arguments: { project: 'alice/novel' },
    });
    expect(call.result?.isError).toBeUndefined();
    expect((JSON.parse(textOf(call)) as { total: number }).total).toBe(1);
  });
});

/** Make yjsService.getDocument return one elements doc built by `build`. */
function seedElementsDoc(build: (doc: Y.Doc) => void) {
  const doc = new Y.Doc();
  build(doc);
  return spyOn(yjsService, 'getDocument').mockResolvedValue({ doc } as never);
}

// These tools read the project elements doc, where the frontend stores this
// data; they used to read documents nothing ever wrote.
describe('MCP tools reading the elements doc', () => {
  const grants = [grant('novel', ['read:project', 'read:elements'])];

  afterEach(() => {
    (yjsService.getDocument as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it('get_publish_plans returns the publishPlans array', async () => {
    const spy = seedElementsDoc((doc) => {
      doc.getArray('publishPlans').push([
        { id: 'plan-1', name: 'EPUB' },
        { id: 'plan-2', name: 'PDF' },
      ]);
    });
    const json = await rpc(grants, 'tools/call', {
      name: 'get_publish_plans',
      arguments: { project: 'alice/novel' },
    });
    const structured = (json.result as { structuredContent?: { total: number; plans: unknown[] } })
      .structuredContent;
    expect(structured?.total).toBe(2);
    expect(structured?.plans).toEqual([
      { id: 'plan-1', name: 'EPUB' },
      { id: 'plan-2', name: 'PDF' },
    ]);
    expect(spy).toHaveBeenCalledWith('alice:novel:elements/');

    const one = await rpc(grants, 'tools/call', {
      name: 'get_publish_plans',
      arguments: { project: 'alice/novel', planId: 'plan-2' },
    });
    expect(JSON.parse(textOf(one))).toEqual({ id: 'plan-2', name: 'PDF' });
  });

  it('get_project_metadata returns projectMeta with pinned ids parsed', async () => {
    seedElementsDoc((doc) => {
      const meta = doc.getMap('projectMeta');
      meta.set('name', 'Novel');
      meta.set('coverMediaId', 'cover-1');
      meta.set('pinnedElementIds', '["el-1","el-2"]');
    });
    const json = await rpc(grants, 'tools/call', {
      name: 'get_project_metadata',
      arguments: { project: 'alice/novel' },
    });
    const data = JSON.parse(textOf(json)) as Record<string, unknown>;
    expect(data.projectKey).toBe('alice/novel');
    expect(data.name).toBe('Novel');
    expect(data.coverMediaId).toBe('cover-1');
    expect(data.pinnedElementIds).toEqual(['el-1', 'el-2']);
  });

  it('get_project_metadata drops an unparseable pinnedElementIds value', async () => {
    seedElementsDoc((doc) => {
      doc.getMap('projectMeta').set('pinnedElementIds', 'not json');
    });
    const json = await rpc(grants, 'tools/call', {
      name: 'get_project_metadata',
      arguments: { project: 'alice/novel' },
    });
    const data = JSON.parse(textOf(json)) as Record<string, unknown>;
    expect(data).not.toHaveProperty('pinnedElementIds');
  });

  it('get_relationships_graph names edges from customRelationshipTypes', async () => {
    seedElementsDoc((doc) => {
      doc.getArray('elements').push([
        { id: 'a', name: 'Ann', type: 'WORLDBUILDING', level: 0, order: 0 },
        { id: 'b', name: 'Bob', type: 'WORLDBUILDING', level: 0, order: 1 },
      ]);
      doc
        .getArray('relationships')
        .push([
          { id: 'r1', sourceElementId: 'a', targetElementId: 'b', relationshipTypeId: 'rival' },
        ]);
      doc.getArray('customRelationshipTypes').push([{ id: 'rival', name: 'Rival' }]);
    });
    const json = await rpc(grants, 'tools/call', {
      name: 'get_relationships_graph',
      arguments: { project: 'alice/novel' },
    });
    expect(json.result?.isError).toBeUndefined();
    expect(JSON.stringify(json.result)).toContain('Rival');
  });
});
