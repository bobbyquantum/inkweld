/**
 * `update_worldbuilding` routes each field to the element's identity map or its
 * template (`worldbuilding`) map. A template may define a field keyed
 * `description`, which must stay writable even though `description` is also an
 * identity key.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import * as Y from 'yjs';
import '../src/mcp';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS } from '../src/mcp/mcp.types';
import { yjsService } from '../src/services/yjs.service';
import { activityService } from '../src/services/activity.service';
import { routeWorldbuildingFields, schemaFieldKeys } from '../src/mcp/tools/worldbuilding-fields';

const grants = [
  {
    projectId: 'id-novel',
    username: 'alice',
    slug: 'novel',
    role: 'editor',
    permissions: ['write:worldbuilding'],
  },
];

const spies: Array<{ mockRestore: () => void }> = [];

const ELEMENT_DOC = 'alice:novel:el-1/';
const PROJECT_DOC = 'alice:novel:elements/';

const schemaWithDescription = {
  id: 'custom-1',
  name: 'Faction',
  icon: 'groups',
  description: '',
  version: 1,
  tabs: [
    {
      key: 'general',
      label: 'General',
      fields: [
        { key: 'description', label: 'Description', type: 'textarea' },
        { key: 'motto', label: 'Motto', type: 'text' },
      ],
    },
  ],
};

const schemaWithoutDescription = {
  ...schemaWithDescription,
  id: 'custom-2',
  tabs: [{ key: 'general', label: 'General', fields: [{ key: 'motto', label: 'Motto' }] }],
};

async function updateWorldbuilding(fields: Record<string, unknown>) {
  const mcpContext = { type: 'oauth', userId: 'u', username: 'alice', grants };
  const body = {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: 1,
    params: {
      name: 'update_worldbuilding',
      arguments: { project: 'alice/novel', elementId: 'el-1', fields },
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
    result?: {
      isError?: boolean;
      content?: { text: string }[];
      structuredContent?: { identityFields: string[]; worldbuildingFields: string[] };
    };
  };
}

/**
 * Serve an element doc (and the project doc holding the shared schemas) from
 * yjsService. `copy` is the element's own schema copy; `schemaId` points at a
 * shared schema when there is no copy.
 */
function seedDocs(options: { copy?: unknown; schemaId?: string; shared?: unknown[] }) {
  const elementDoc = new Y.Doc();
  if (options.copy) elementDoc.getMap('schema').set('snapshot', options.copy);
  if (options.schemaId) elementDoc.getMap('worldbuilding').set('schemaId', options.schemaId);
  const projectDoc = new Y.Doc();
  projectDoc.getArray('schemas').push(options.shared ?? []);
  spies.push(
    spyOn(yjsService, 'getDocument').mockImplementation(((docId: string) => {
      if (docId === ELEMENT_DOC) return Promise.resolve({ doc: elementDoc });
      if (docId === PROJECT_DOC) return Promise.resolve({ doc: projectDoc });
      return Promise.reject(new Error(`unexpected doc ${docId}`));
    }) as never),
    spyOn(activityService, 'record').mockResolvedValue(undefined as never)
  );
  return {
    identity: () => elementDoc.getMap('identity').toJSON(),
    // lastModified is stamped on every write; covered in mcp-worldbuilding-nested.test.ts
    worldbuilding: () => {
      const { lastModified: _lastModified, ...data } = elementDoc.getMap('worldbuilding').toJSON();
      return data;
    },
  };
}

describe('update_worldbuilding field routing', () => {
  afterEach(() => {
    spies.splice(0).forEach((s) => s.mockRestore());
  });

  it("writes a bare description to the template field when the element's schema defines one", async () => {
    const doc = seedDocs({ copy: schemaWithDescription });

    const json = await updateWorldbuilding({ description: 'Template text', motto: 'Onward' });

    expect(json.result?.isError).toBeUndefined();
    expect(doc.worldbuilding()).toEqual({ description: 'Template text', motto: 'Onward' });
    expect(doc.identity()).toEqual({});
    expect(json.result?.structuredContent?.worldbuildingFields).toEqual(['description', 'motto']);
  });

  it('writes identity.description to the identity field even when the schema defines description', async () => {
    const doc = seedDocs({ copy: schemaWithDescription });

    await updateWorldbuilding({ 'identity.description': 'Panel text', description: 'Field text' });

    expect(doc.identity()).toEqual({ description: 'Panel text' });
    expect(doc.worldbuilding()).toEqual({ description: 'Field text' });
  });

  it('falls back to the shared schema when the element has no schema copy', async () => {
    const doc = seedDocs({ schemaId: 'custom-1', shared: [schemaWithDescription] });

    await updateWorldbuilding({ description: 'Template text' });

    expect(doc.worldbuilding()).toMatchObject({ description: 'Template text' });
    expect(doc.identity()).toEqual({});
  });

  it('keeps a bare description and image on the identity map when the schema does not define them', async () => {
    const doc = seedDocs({ copy: schemaWithoutDescription });

    const json = await updateWorldbuilding({
      description: 'Panel text',
      image: 'media://a.png',
      motto: 'Onward',
    });

    expect(doc.identity()).toEqual({ description: 'Panel text', image: 'media://a.png' });
    expect(doc.worldbuilding()).toEqual({ motto: 'Onward' });
    expect(json.result?.structuredContent?.identityFields).toEqual(['description', 'image']);
  });
});

describe('routeWorldbuildingFields', () => {
  it('honours explicit prefixes regardless of the schema', () => {
    expect(
      routeWorldbuildingFields(
        { 'identity.description': 'a', 'worldbuilding.image': 'b' },
        new Set(['description'])
      )
    ).toEqual({ identity: { description: 'a' }, worldbuilding: { image: 'b' } });
  });

  it('only strips the leading prefix', () => {
    expect(routeWorldbuildingFields({ 'identity.identity.x': 1 }, new Set())).toEqual({
      identity: { 'identity.x': 1 },
      worldbuilding: {},
    });
  });
});

describe('schemaFieldKeys', () => {
  it('collects field keys across tabs and tolerates malformed schemas', () => {
    expect(schemaFieldKeys(schemaWithDescription)).toEqual(new Set(['description', 'motto']));
    expect(schemaFieldKeys({ tabs: [{}, { fields: [{}, { key: 'x' }] }] })).toEqual(new Set(['x']));
    expect(schemaFieldKeys(null)).toEqual(new Set());
  });
});
