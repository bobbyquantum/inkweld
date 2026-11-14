/**
 * Relationship fields over MCP. A relationship field's value is its
 * relationships (source = the element owning the field, target = the linked
 * element, type = the field's relationshipTypeId), as in the app's
 * relationship field: `update_worldbuilding` creates and deletes them,
 * `delete_relationship` takes the link out of the field, and reads derive the
 * field's value from the relationships.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import * as Y from 'yjs';
import '../src/mcp';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS } from '../src/mcp/mcp.types';
import { yjsService } from '../src/services/yjs.service';
import { activityService } from '../src/services/activity.service';
import {
  splitRelationshipUpdates,
  withRelationshipFieldValues,
  worldbuildingDefaults,
} from '../src/mcp/tools/worldbuilding-fields';
import { deleteYMapPath } from '../src/utils/yjs-map-path';

const grants = [
  {
    projectId: 'id-rising',
    username: 'alice',
    slug: 'rising',
    role: 'editor',
    permissions: ['read:elements', 'read:worldbuilding', 'write:worldbuilding'],
  },
];

const PROJECT_DOC = 'alice:rising:elements/';
const TYPE_ID = 'fieldrel-wL-_584qiI';

const assetSchema = {
  id: 'asset',
  name: 'Asset',
  icon: 'category',
  description: '',
  version: 1,
  tabs: [
    {
      key: 'general',
      label: 'General',
      fields: [
        { key: 'assetId', label: 'Asset id', type: 'text' },
        {
          key: 'partOf',
          label: 'Part of',
          type: 'relationship',
          multiple: true,
          targetSchemaId: 'asset',
          inverseLabel: 'Parts',
          relationshipTypeId: TYPE_ID,
        },
        {
          key: 'madeWith',
          label: 'Made with',
          type: 'relationship',
          multiple: false,
          relationshipTypeId: 'fieldrel-made',
        },
      ],
    },
  ],
};

const characterSchema = { ...assetSchema, id: 'character', name: 'Character', tabs: [] };

function element(id: string, name: string, schemaId?: string, type = 'WORLDBUILDING') {
  return { id, name, type, schemaId, parentId: null, level: 0, order: 0, version: 0, metadata: {} };
}

const spies: Array<{ mockRestore: () => void }> = [];

interface Seeded {
  relationships: () => Array<Record<string, unknown>>;
  worldbuilding: (id: string) => Record<string, unknown>;
}

/**
 * A project with the tyre and buggy (Assets), a truck (Asset), Mara (a
 * Character) and a chapter. `legacy` is a partOf copy an older MCP write
 * left in the tyre's worldbuilding map.
 */
function seedProject(
  options: { relationships?: unknown[]; legacy?: unknown; schemaCopy?: boolean } = {}
): Seeded {
  const projectDoc = new Y.Doc();
  projectDoc
    .getArray('elements')
    .push([
      element('tyre', 'PART-TYRE-DUST Everyday tyre', 'asset'),
      element('buggy', 'HUT-33 Buggy', 'asset'),
      element('truck', 'Truck', 'asset'),
      element('mara', 'Mara', 'character'),
      element('ch1', 'Chapter 1', undefined, 'ITEM'),
    ]);
  projectDoc.getArray('schemas').push([assetSchema, characterSchema]);
  projectDoc.getArray('relationships').push((options.relationships ?? []) as never[]);

  const docs = new Map<string, Y.Doc>([[PROJECT_DOC, projectDoc]]);
  for (const id of ['tyre', 'buggy', 'truck', 'mara']) {
    const doc = new Y.Doc();
    const schemaId = id === 'mara' ? 'character' : 'asset';
    doc.getMap('worldbuilding').set('schemaId', schemaId);
    if (options.schemaCopy !== false && schemaId === 'asset') {
      doc.getMap('schema').set('snapshot', assetSchema);
    }
    docs.set(`alice:rising:${id}/`, doc);
  }
  const elementDoc = (id: string): Y.Doc => docs.get(`alice:rising:${id}/`) ?? new Y.Doc();
  if (options.legacy !== undefined) {
    elementDoc('tyre').getMap('worldbuilding').set('partOf', options.legacy);
  }

  spies.push(
    spyOn(yjsService, 'getDocument').mockImplementation(((docId: string) => {
      const doc = docs.get(docId);
      return doc ? Promise.resolve({ doc }) : Promise.reject(new Error(`unexpected doc ${docId}`));
    }) as never),
    spyOn(activityService, 'record').mockResolvedValue(undefined as never)
  );
  return {
    relationships: () => projectDoc.getArray('relationships').toJSON() as never,
    worldbuilding: (id) => {
      const { lastModified: _lastModified, ...data } = elementDoc(id)
        .getMap('worldbuilding')
        .toJSON();
      return data;
    },
  };
}

interface ToolResult {
  isError?: boolean;
  content?: { text: string }[];
  structuredContent?: Record<string, unknown>;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const mcpContext = { type: 'oauth', userId: 'u', username: 'alice', grants };
  const body = {
    jsonrpc: '2.0',
    method: 'tools/call',
    id: 1,
    params: {
      name,
      arguments: { project: 'alice/rising', ...args },
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
  return ((await res.json()) as { result: ToolResult }).result;
}

const update = (fields: Record<string, unknown>, elementId = 'tyre') =>
  callTool('update_worldbuilding', { elementId, fields });

async function elementFull(elementId: string) {
  const result = await callTool('get_element_full', { elementId });
  return JSON.parse(result.content?.[0].text ?? 'null') as {
    worldbuilding: Record<string, unknown> | null;
    relationships: Array<Record<string, unknown>> | null;
  };
}

function link(id: string, target: string, type = TYPE_ID, source = 'tyre') {
  const at = '2026-11-06T10:10:28.622Z';
  return {
    id,
    sourceElementId: source,
    targetElementId: target,
    relationshipTypeId: type,
    createdAt: at,
    updatedAt: at,
  };
}

describe('relationship fields over MCP', () => {
  afterEach(() => {
    spies.splice(0).forEach((s) => s.mockRestore());
  });

  it('update_worldbuilding links a relationship field: a relationship, and a backlink on the target', async () => {
    const project = seedProject();

    const result = await update({ partOf: ['buggy'], assetId: 'PART-TYRE-DUST' });

    expect(result.isError).toBeUndefined();
    expect(result.content?.[0].text).toContain('partOf: linked buggy');
    expect(project.relationships()).toEqual([
      expect.objectContaining({
        sourceElementId: 'tyre',
        targetElementId: 'buggy',
        relationshipTypeId: TYPE_ID,
      }),
    ]);
    expect(result.structuredContent?.relationshipFields).toEqual({
      partOf: { relationshipTypeId: TYPE_ID, value: ['buggy'], linked: ['buggy'], unlinked: [] },
    });
    // The value is the relationship, not a key in the map; other fields still are
    expect(project.worldbuilding('tyre')).toEqual({ schemaId: 'asset', assetId: 'PART-TYRE-DUST' });

    const tyre = await elementFull('tyre');
    expect(tyre.worldbuilding?.partOf).toEqual(['buggy']);
    expect(tyre.worldbuilding?.madeWith).toEqual([]);

    const buggy = await elementFull('buggy');
    expect(buggy.relationships).toEqual([
      expect.objectContaining({ sourceElementId: 'tyre', targetElementId: 'buggy' }),
    ]);
  });

  it('takes a single id string, and is idempotent', async () => {
    const project = seedProject();

    await update({ partOf: 'buggy' });
    const again = await update({ partOf: ['buggy'] });

    expect(again.content?.[0].text).toContain('partOf: unchanged');
    expect(project.relationships()).toHaveLength(1);
  });

  it('update_worldbuilding unlinks ids left out, and null clears the field', async () => {
    const project = seedProject({
      relationships: [link('r1', 'buggy'), link('r2', 'truck'), link('r3', 'mara', 'knows')],
    });

    const result = await update({ partOf: ['truck'] });
    expect(result.content?.[0].text).toContain('partOf: unlinked buggy');
    expect(project.relationships().map((r) => r.id)).toEqual(['r2', 'r3']);
    expect((await elementFull('buggy')).relationships).toBeNull();

    await update({ partOf: null });
    expect(project.relationships().map((r) => r.id)).toEqual(['r3']);
    expect((await elementFull('tyre')).worldbuilding?.partOf).toEqual([]);
  });

  it('rejects a target of the wrong template and writes nothing', async () => {
    const project = seedProject();

    const result = await update({ partOf: ['mara'], assetId: 'X' });

    expect(result.isError).toBe(true);
    expect(result.content?.[0].text).toContain('nothing was changed');
    expect(result.content?.[0].text).toContain('only links elements of template "Asset" (asset)');
    expect(result.content?.[0].text).toContain('"Mara" (mara) uses "Character" (character)');
    expect(project.relationships()).toEqual([]);
    expect(project.worldbuilding('tyre')).toEqual({ schemaId: 'asset' });
  });

  it('enforces multiple: false', async () => {
    const project = seedProject();

    const tooMany = await update({ madeWith: ['buggy', 'truck'] });
    expect(tooMany.isError).toBe(true);
    expect(tooMany.content?.[0].text).toContain('links a single element, but 2 ids were given');
    expect(project.relationships()).toEqual([]);

    // One id is fine, and replaces the previous link
    await update({ madeWith: 'buggy' });
    await update({ madeWith: 'mara' });
    expect(project.relationships()).toEqual([
      expect.objectContaining({ targetElementId: 'mara', relationshipTypeId: 'fieldrel-made' }),
    ]);
  });

  it('keeps a single-valued field to one link when two updates race', async () => {
    const project = seedProject();

    await Promise.all([update({ madeWith: 'buggy' }), update({ madeWith: 'mara' })]);

    expect(
      project.relationships().filter((r) => r.relationshipTypeId === 'fieldrel-made')
    ).toHaveLength(1);
  });

  it('writes nothing when the schema cannot be read', async () => {
    const project = seedProject({ schemaCopy: false });
    const getSchemas = spyOn(yjsService, 'getDocument');
    const serve = getSchemas.getMockImplementation();
    getSchemas.mockImplementation(((docId: string) =>
      docId === PROJECT_DOC
        ? Promise.reject(new Error('storage unavailable'))
        : serve?.(docId)) as never);

    const result = await update({ partOf: ['buggy'] });

    expect(result.isError).toBe(true);
    expect(project.worldbuilding('tyre')).toEqual({ schemaId: 'asset' });
  });

  it('rejects missing, non-worldbuilding and self targets, and values that are not ids', async () => {
    seedProject();

    for (const [value, message] of [
      [['ghost'], 'no element with id "ghost"'],
      [['ch1'], 'links worldbuilding elements'],
      [['tyre'], 'itself'],
      [{ id: 'buggy' }, 'give an element id'],
    ] as const) {
      const result = await update({ partOf: value });
      expect(result.isError).toBe(true);
      expect(result.content?.[0].text).toContain(message);
    }
  });

  it('uses the shared schema when the element has no schema copy', async () => {
    const project = seedProject({ schemaCopy: false });

    await update({ 'worldbuilding.partOf': ['buggy'] });

    expect(project.relationships()).toHaveLength(1);
    expect((await elementFull('tyre')).worldbuilding?.partOf).toEqual(['buggy']);
  });

  it('replaces a stale copy of the value an older write left in the map', async () => {
    const project = seedProject({ relationships: [link('r1', 'buggy')], legacy: ['truck'] });

    // Reads follow the relationships, not the copy
    expect((await elementFull('tyre')).worldbuilding?.partOf).toEqual(['buggy']);

    await update({ partOf: ['buggy', 'truck'] });
    expect(project.worldbuilding('tyre')).toEqual({ schemaId: 'asset' });
    expect(project.relationships().map((r) => r.targetElementId)).toEqual(['buggy', 'truck']);
  });

  it('delete_relationship takes the link out of the field', async () => {
    const project = seedProject({
      relationships: [link('r1', 'buggy'), link('r2', 'truck')],
      legacy: ['buggy', 'truck'],
    });

    const result = await callTool('delete_relationship', { relationshipId: 'r1' });

    expect(result.isError).toBeUndefined();
    expect(project.relationships().map((r) => r.id)).toEqual(['r2']);
    expect((await elementFull('tyre')).worldbuilding?.partOf).toEqual(['truck']);
    // The stale copy is dropped too
    expect(project.worldbuilding('tyre')).toEqual({ schemaId: 'asset' });
  });

  it('search_worldbuilding returns relationship field values from the relationships', async () => {
    seedProject({ relationships: [link('r1', 'buggy')], legacy: ['truck'] });

    const result = await callTool('search_worldbuilding', {
      query: '*',
      includeFullContent: true,
    });
    const results = (
      result.structuredContent as {
        results: Array<{
          elementId: string;
          worldbuildingData: { worldbuilding: Record<string, unknown> };
        }>;
      }
    ).results;
    const tyre = results.find((r) => r.elementId === 'tyre');
    expect(tyre?.worldbuildingData.worldbuilding.partOf).toEqual(['buggy']);
  });
});

describe('relationship field helpers', () => {
  it('splitRelationshipUpdates takes relationship values out, nested ones too', () => {
    const fields = [
      { key: 'partOf', type: 'relationship' },
      { key: 'group.leader', type: 'relationship' },
    ];
    const { relationship, rest } = splitRelationshipUpdates(
      { partOf: ['a'], group: { leader: 'b', name: 'G' }, age: 3 },
      fields
    );
    expect([...relationship.entries()].map(([field, value]) => [field.key, value])).toEqual([
      ['partOf', ['a']],
      ['group.leader', 'b'],
    ]);
    expect(rest).toEqual({ group: { name: 'G' }, age: 3 });
  });

  it('withRelationshipFieldValues never follows a field key into a prototype', () => {
    const schema = {
      tabs: [
        {
          fields: [
            { key: '__proto__.polluted', type: 'relationship', relationshipTypeId: 't' },
            { key: 'constructor.polluted', type: 'relationship', relationshipTypeId: 't' },
          ],
        },
      ],
    };
    withRelationshipFieldValues({}, schema, 'tyre', [link('r1', 'buggy', 't')]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('withRelationshipFieldValues gives a field without a relationship type no links', () => {
    const schema = { tabs: [{ fields: [{ key: 'partOf', type: 'relationship' }] }] };
    expect(withRelationshipFieldValues({ partOf: ['truck'] }, schema, 'tyre', [])).toEqual({
      partOf: [],
    });
  });

  it('worldbuildingDefaults never seeds a relationship field, even from defaultValues', () => {
    const defaults = worldbuildingDefaults({
      ...assetSchema,
      defaultValues: { partOf: ['x'], assetId: 'A' },
    });
    expect(defaults.worldbuilding).toEqual({ assetId: 'A' });
  });

  it('deleteYMapPath deletes nested keys in Y.Maps and plain objects', () => {
    const doc = new Y.Doc();
    const root = doc.getMap('worldbuilding');
    const nested = new Y.Map();
    root.set('group', nested);
    nested.set('leader', ['x']);
    root.set('plain', { leader: ['y'], keep: 1 });

    expect(deleteYMapPath(root, ['group', 'leader'])).toBe(true);
    expect(deleteYMapPath(root, ['plain', 'leader'])).toBe(true);
    expect(deleteYMapPath(root, ['missing'])).toBe(false);
    expect(deleteYMapPath(root, ['plain', 'keep', 'x'])).toBe(false);
    expect(root.toJSON()).toEqual({ group: {}, plain: { keep: 1 } });
  });
});
