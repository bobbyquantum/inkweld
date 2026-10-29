/**
 * Nested template fields (`description.terrain`) on worldbuilding elements
 * created through MCP. `create_element` used to bind only the schema id, so
 * the element had no `description` map and every dotted write failed; it now
 * writes the template's field skeleton, and dotted writes create a missing
 * parent so elements created before the fix heal on their next write.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import * as Y from 'yjs';
import '../src/mcp';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS } from '../src/mcp/mcp.types';
import { yjsService } from '../src/services/yjs.service';
import { activityService } from '../src/services/activity.service';
import { worldbuildingDefaults } from '../src/mcp/tools/worldbuilding-fields';

const grants = [
  {
    projectId: 'id-novel',
    username: 'alice',
    slug: 'novel',
    role: 'editor',
    permissions: ['write:elements', 'write:worldbuilding'],
  },
];

/** Trimmed copy of the built-in planet-v1 template. */
const planetSchema = {
  id: 'planet-v1',
  name: 'Planet',
  icon: 'public',
  description: 'A planet',
  version: 1,
  defaultValues: {},
  defaultAppearance: { menu: { type: 'gradient', light: '#fff' } },
  tabs: [
    {
      key: 'basic',
      label: 'Basic',
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'summary', label: 'Summary', type: 'textarea' },
      ],
    },
    {
      key: 'description',
      label: 'Description',
      fields: [
        { key: 'description.terrain', label: 'Terrain', type: 'textarea' },
        { key: 'description.climate', label: 'Climate', type: 'textarea' },
      ],
    },
    {
      key: 'astronomy',
      label: 'Astronomy',
      fields: [
        { key: 'astronomy.orbit', label: 'Orbit', type: 'text' },
        { key: 'astronomy.moons', label: 'Moons', type: 'array' },
        { key: 'related', label: 'Related', type: 'relationship' },
      ],
    },
  ],
};

const spies: Array<{ mockRestore: () => void }> = [];

/** Back yjsService with in-memory docs, created on first use. */
function seedProject() {
  const docs = new Map<string, Y.Doc>();
  const docFor = (id: string) => {
    const doc = docs.get(id) ?? new Y.Doc();
    docs.set(id, doc);
    return doc;
  };
  docFor('alice:novel:elements/').getArray('schemas').push([planetSchema]);
  spies.push(
    spyOn(yjsService, 'getDocument').mockImplementation(((docId: string) =>
      Promise.resolve({ doc: docFor(docId) })) as never),
    spyOn(activityService, 'record').mockResolvedValue(undefined as never)
  );
  return {
    element: (id: string) => docFor(`alice:novel:${id}/`),
  };
}

async function callTool(name: string, args: Record<string, unknown>) {
  const mcpContext = { type: 'oauth', userId: 'u', username: 'alice', grants };
  const body = {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: 1,
    params: {
      name,
      arguments: { project: 'alice/novel', ...args },
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
      structuredContent?: { element?: { id: string } };
    };
  };
}

async function createPlanet(): Promise<string> {
  const created = await callTool('create_element', {
    name: 'Dustmote',
    type: 'WORLDBUILDING',
    schemaId: 'planet-v1',
  });
  expect(created.result?.isError).toBeUndefined();
  const id = created.result?.structuredContent?.element?.id;
  expect(typeof id).toBe('string');
  return String(id);
}

describe('nested worldbuilding fields on MCP-created elements', () => {
  afterEach(() => {
    spies.splice(0).forEach((s) => s.mockRestore());
  });

  it('create_element writes the template skeleton with nested Y.Maps', async () => {
    const project = seedProject();
    const id = await createPlanet();

    const data = project.element(id).getMap('worldbuilding');
    expect(data.get('description')).toBeInstanceOf(Y.Map);
    expect(data.toJSON()).toMatchObject({
      schemaId: 'planet-v1',
      id,
      name: 'Dustmote',
      summary: '',
      description: { terrain: '', climate: '' },
      astronomy: { orbit: '', moons: [] },
    });
    expect(data.has('related')).toBe(false);
    expect(project.element(id).getMap('identity').toJSON()).toEqual({
      appearance: { menu: { type: 'gradient', light: '#fff' } },
    });
    expect(project.element(id).getMap('schema').get('baseSchemaId')).toBe('planet-v1');
  });

  it('writes a dotted field on a freshly created element', async () => {
    const project = seedProject();
    const id = await createPlanet();

    const json = await callTool('update_worldbuilding', {
      elementId: id,
      fields: { 'description.terrain': 'Glass dunes' },
    });

    expect(json.result?.isError).toBeUndefined();
    const description = project.element(id).getMap('worldbuilding').get('description');
    expect(description).toBeInstanceOf(Y.Map);
    expect((description as Y.Map<unknown>).toJSON()).toEqual({
      terrain: 'Glass dunes',
      climate: '',
    });
  });

  it('heals an element created before the fix (no nested maps)', async () => {
    const project = seedProject();
    project.element('old').getMap('worldbuilding').set('schemaId', 'planet-v1');

    const json = await callTool('update_worldbuilding', {
      elementId: 'old',
      fields: { 'description.terrain': 'Glass dunes', 'astronomy.orbit': 'Tidally locked' },
    });

    expect(json.result?.isError).toBeUndefined();
    expect(project.element('old').getMap('worldbuilding').toJSON()).toMatchObject({
      description: { terrain: 'Glass dunes' },
      astronomy: { orbit: 'Tidally locked' },
    });
  });

  it('merges an object value into the nested map instead of replacing it', async () => {
    const project = seedProject();
    const id = await createPlanet();

    const json = await callTool('update_worldbuilding', {
      elementId: id,
      fields: { 'worldbuilding.description': { terrain: 'Salt flats' } },
    });

    expect(json.result?.isError).toBeUndefined();
    const description = project.element(id).getMap('worldbuilding').get('description');
    expect(description).toBeInstanceOf(Y.Map);
    expect((description as Y.Map<unknown>).toJSON()).toEqual({
      terrain: 'Salt flats',
      climate: '',
    });
  });

  it('upgrades a parent stored as a plain object', async () => {
    const project = seedProject();
    project.element('old').getMap('worldbuilding').set('description', { climate: 'Dry' });

    await callTool('update_worldbuilding', {
      elementId: 'old',
      fields: { 'description.terrain': 'Dunes' },
    });

    const description = project.element('old').getMap('worldbuilding').get('description');
    expect(description).toBeInstanceOf(Y.Map);
    expect((description as Y.Map<unknown>).toJSON()).toEqual({ climate: 'Dry', terrain: 'Dunes' });
  });

  it('refuses to overwrite a text value with nested fields and writes nothing', async () => {
    const project = seedProject();
    const data = project.element('old').getMap('worldbuilding');
    data.set('description', 'Legacy text');

    const json = await callTool('update_worldbuilding', {
      elementId: 'old',
      fields: { summary: 'New', 'description.terrain': 'Dunes' },
    });

    expect(json.result?.isError).toBe(true);
    expect(json.result?.content?.[0].text).toContain('"description" holds a string value');
    expect(data.toJSON()).toEqual({ description: 'Legacy text' });
  });

  it('updates lastModified on every write', async () => {
    const project = seedProject();
    const id = await createPlanet();
    const data = project.element(id).getMap('worldbuilding');
    const created = data.get('lastModified') as string;
    expect(typeof created).toBe('string');

    await new Promise((resolve) => setTimeout(resolve, 5));
    await callTool('update_worldbuilding', { elementId: id, fields: { summary: 'A dry world' } });
    const afterFieldWrite = data.get('lastModified') as string;
    expect(afterFieldWrite > created).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await callTool('update_worldbuilding', {
      elementId: id,
      fields: { 'identity.description': 'Panel text' },
    });
    expect((data.get('lastModified') as string) > afterFieldWrite).toBe(true);
    expect(data.get('createdDate')).toBe(created);
  });
});

describe('worldbuildingDefaults', () => {
  it('lets the first definition win when a key is both a field and a parent', () => {
    const defaults = worldbuildingDefaults({
      tabs: [
        { fields: [{ key: 'description', type: 'textarea' }, { key: 'description.terrain' }] },
        { fields: [{ key: 'notes.a' }, { key: 'notes', type: 'text' }] },
      ],
    });
    expect(defaults.worldbuilding).toEqual({ description: '', 'notes.a': '' });
  });

  it('keeps schema default values and tolerates a missing schema', () => {
    expect(
      worldbuildingDefaults({
        defaultValues: { size: 'large' },
        tabs: [{ fields: [{ key: 'size' }] }],
      }).worldbuilding
    ).toEqual({ size: 'large' });
    expect(worldbuildingDefaults(undefined)).toEqual({ worldbuilding: {}, identity: {} });
  });
});
