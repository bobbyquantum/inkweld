/**
 * Tests for the schema (template) editing tools: `create_schema`,
 * `update_schema` and `delete_schema`, and their pure editing helpers.
 */
import { describe, it, expect, afterEach, spyOn } from 'bun:test';
import * as Y from 'yjs';
import { yjsService } from '../src/services/yjs.service';
import '../src/mcp';
import { handleMcpRequest } from '../src/mcp/mcp.handler';
import { MCP_PROTOCOL_VERSION, META_KEYS } from '../src/mcp/mcp.types';
import { roleToMcpPermissions } from '../src/db/schema/project-collaborators';
import {
  applySchemaOperations,
  buildRelationshipTypeDef,
  createTabs,
  deriveKey,
  planRelationshipTypeChanges,
  validateTabs,
  type SchemaTab,
} from '../src/mcp/tools/schema-editing';

const WRITE = ['read:schemas', 'write:schemas'];

interface ToolJson {
  result?: {
    tools?: { name: string }[];
    content?: { text: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
  error?: { message: string };
}

async function rpc(
  permissions: string[],
  method: string,
  params: Record<string, unknown> = {}
): Promise<ToolJson> {
  const grants = [
    { projectId: 'id-novel', username: 'alice', slug: 'novel', role: 'editor', permissions },
  ];
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
  return (await res.json()) as ToolJson;
}

function call(name: string, args: Record<string, unknown>, permissions = WRITE) {
  return rpc(permissions, 'tools/call', { name, arguments: { project: 'alice/novel', ...args } });
}

function textOf(json: ToolJson): string {
  return json.result?.content?.[0]?.text ?? '';
}

const spies: Array<{ mockRestore: () => void }> = [];

/** Serve the project elements doc, seeded with schemas, relationship types and relationships. */
function seedProject(
  seed: { schemas?: unknown[]; types?: unknown[]; relationships?: unknown[] } = {}
) {
  const doc = new Y.Doc();
  doc.getArray('schemas').push(seed.schemas ?? []);
  doc.getArray('customRelationshipTypes').push(seed.types ?? []);
  doc.getArray('relationships').push(seed.relationships ?? []);
  spies.push(
    spyOn(yjsService, 'getDocument').mockImplementation(((docId: string) =>
      docId === 'alice:novel:elements/'
        ? Promise.resolve({ doc })
        : Promise.reject(new Error(`unexpected doc ${docId}`))) as never)
  );
  return {
    schemas: () => doc.getArray('schemas').toJSON() as StoredSchemaRow[],
    types: () => doc.getArray('customRelationshipTypes').toJSON() as Row[],
    relationships: () => doc.getArray('relationships').toJSON() as Row[],
  };
}

interface Row {
  id: string;
  [prop: string]: unknown;
}

interface StoredSchemaRow extends Row {
  tabs: Array<SchemaTab & { fields: Array<SchemaTab['fields'][number] & Row> }>;
}

const faction = {
  id: 'faction-1',
  name: 'Faction',
  icon: 'groups',
  description: 'Groups and orders',
  version: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  tabs: [
    {
      key: 'general',
      label: 'General',
      order: 0,
      fields: [
        { id: 'motto', key: 'motto', label: 'Motto', type: 'text' },
        {
          id: 'leader',
          key: 'leader',
          label: 'Leader',
          type: 'relationship',
          relationshipTypeId: 'fieldrel-leader',
        },
      ],
    },
    { key: 'history', label: 'History', order: 1, fields: [] },
  ],
};

const leaderType = {
  ...buildRelationshipTypeDef('faction-1', faction.tabs[0].fields[1] as never, 'fieldrel-leader'),
  color: '#ff0000',
};

const leaderLink = {
  id: 'rel-1',
  sourceElementId: 'el-1',
  targetElementId: 'el-2',
  relationshipTypeId: 'fieldrel-leader',
  createdAt: '',
  updatedAt: '',
};
const otherLink = { ...leaderLink, id: 'rel-2', relationshipTypeId: 'friend' };

afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
});

describe('schema tool permissions', () => {
  it('lists the schema tools only with write:schemas', async () => {
    const withWrite = (await rpc(WRITE, 'tools/list')).result?.tools?.map((t) => t.name) ?? [];
    expect(withWrite).toEqual(
      expect.arrayContaining(['create_schema', 'update_schema', 'delete_schema'])
    );

    const readOnly =
      (await rpc(['read:schemas'], 'tools/list')).result?.tools?.map((t) => t.name) ?? [];
    expect(readOnly).not.toContain('create_schema');
    expect(readOnly).not.toContain('update_schema');
    expect(readOnly).not.toContain('delete_schema');
  });

  it('refuses a call without write:schemas', async () => {
    seedProject();
    const json = await call('create_schema', { name: 'Spell' }, ['read:schemas']);
    expect(json.error?.message).toContain('Permission denied');
  });

  it('grants write:schemas to editors and admins, not viewers', () => {
    expect(roleToMcpPermissions('editor')).toContain('write:schemas');
    expect(roleToMcpPermissions('admin')).toContain('write:schemas');
    expect(roleToMcpPermissions('viewer')).not.toContain('write:schemas');
  });
});

describe('create_schema', () => {
  it('creates a schema with derived keys and a relationship type per relationship field', async () => {
    const project = seedProject({ schemas: [faction] });
    const json = await call('create_schema', {
      name: 'Spell',
      icon: 'auto_fix_high',
      tabs: [
        {
          label: 'Casting',
          fields: [
            { label: 'Mana Cost', type: 'number' },
            { label: 'School', type: 'select', options: ['Fire', 'Ice'] },
            { label: 'Inventor', type: 'relationship', inverseLabel: 'Invented' },
          ],
        },
      ],
    });

    expect(json.result?.isError).toBeUndefined();
    const created = project.schemas()[1];
    expect(created.id).toStartWith('custom-');
    expect(created).toMatchObject({
      name: 'Spell',
      icon: 'auto_fix_high',
      description: '',
      version: 1,
    });
    expect(created.tabs[0]).toMatchObject({ key: 'casting', label: 'Casting', order: 0 });
    const fields = created.tabs[0].fields;
    expect(fields.map((f: { key: string }) => f.key)).toEqual(['manaCost', 'school', 'inventor']);
    expect(fields[0]).toMatchObject({ id: 'manaCost', type: 'number', layout: { span: 12 } });

    const typeId = fields[2].relationshipTypeId;
    expect(typeId).toStartWith('fieldrel-');
    const newType = project.types().find((t) => t.id === typeId);
    expect(newType).toMatchObject({
      name: 'Inventor',
      inverseLabel: 'Invented',
      category: 'custom',
      sourceEndpoint: { allowedSchemas: [created.id], maxCount: 1 },
      fieldSource: { schemaId: created.id, fieldKey: 'inventor' },
    });
    expect(json.result?.structuredContent).toMatchObject({
      success: true,
      relationshipTypesChanged: 1,
    });
  });

  it('starts with an empty General tab when no tabs are given', async () => {
    const project = seedProject();
    await call('create_schema', { name: 'Spell' });
    expect(project.schemas()[0].tabs).toEqual([
      { key: 'general', label: 'General', icon: 'article', order: 0, fields: [] },
    ]);
  });

  it('clones a schema with fresh relationship type ids', async () => {
    const project = seedProject({ schemas: [faction], types: [leaderType] });
    await call('create_schema', { name: 'Guild', cloneFromSchemaId: 'faction-1' });

    const [source, clone] = project.schemas();
    expect(clone).toMatchObject({ name: 'Guild', icon: 'groups', description: 'Clone of Faction' });
    const cloneLeader = clone.tabs[0].fields[1];
    expect(cloneLeader.relationshipTypeId).not.toBe('fieldrel-leader');
    expect(source.tabs[0].fields[1].relationshipTypeId).toBe('fieldrel-leader');
    expect(project.types().map((t) => t.id)).toEqual([
      'fieldrel-leader',
      cloneLeader.relationshipTypeId,
    ]);
  });

  it('rejects a duplicate name, a reserved key and an unknown field type without writing', async () => {
    const project = seedProject({ schemas: [faction] });

    expect(textOf(await call('create_schema', { name: 'faction' }))).toContain('already exists');
    expect(
      textOf(
        await call('create_schema', {
          name: 'Spell',
          tabs: [{ label: 'A', fields: [{ label: 'Description' }] }],
        })
      )
    ).toContain('reserved');
    expect(
      textOf(
        await call('create_schema', {
          name: 'Spell',
          tabs: [{ label: 'A', fields: [{ label: 'Power', type: 'colour' }] }],
        })
      )
    ).toContain('field type must be one of');
    expect(
      textOf(await call('create_schema', { name: 'Spell', cloneFromSchemaId: 'nope' }))
    ).toContain('not found');

    expect(project.schemas()).toHaveLength(1);
  });
});

describe('update_schema', () => {
  it('applies operations in order and bumps the version', async () => {
    const project = seedProject({ schemas: [faction], types: [leaderType] });
    const json = await call('update_schema', {
      schemaId: 'faction-1',
      name: 'Order',
      operations: [
        { op: 'add_field', tabKey: 'general', field: { label: 'Founded', type: 'date' }, index: 0 },
        {
          op: 'update_field',
          fieldKey: 'motto',
          patch: { label: 'Creed', placeholder: 'What they believe' },
        },
        { op: 'move_field', fieldKey: 'motto', toTabKey: 'history' },
        { op: 'add_tab', label: 'Ranks', icon: 'military_tech', index: 1 },
      ],
    });

    expect(json.result?.isError).toBeUndefined();
    const updated = project.schemas()[0];
    expect(updated).toMatchObject({
      id: 'faction-1',
      name: 'Order',
      version: 4,
      createdAt: faction.createdAt,
    });
    expect(updated.updatedAt).toBeString();
    expect(updated.tabs.map((t: SchemaTab) => [t.key, t.order])).toEqual([
      ['general', 0],
      ['ranks', 1],
      ['history', 2],
    ]);
    expect(updated.tabs[0].fields.map((f: { key: string }) => f.key)).toEqual([
      'founded',
      'leader',
    ]);
    expect(updated.tabs[2].fields[0]).toMatchObject({
      key: 'motto',
      label: 'Creed',
      placeholder: 'What they believe',
    });
    expect(textOf(json)).toContain('Update from shared schema');
    // The leader field is unchanged, so its type keeps the user's color and isn't rewritten.
    expect(project.types()).toEqual([leaderType]);
  });

  it('updates the relationship type when a relationship field changes', async () => {
    const project = seedProject({ schemas: [faction], types: [leaderType] });
    await call('update_schema', {
      schemaId: 'faction-1',
      operations: [
        { op: 'update_field', fieldKey: 'leader', patch: { label: 'Leaders', multiple: true } },
      ],
    });
    expect(project.types()[0]).toMatchObject({
      id: 'fieldrel-leader',
      name: 'Leaders',
      color: '#ff0000',
      sourceEndpoint: { maxCount: null },
    });
  });

  it('removes the relationship type and its relationships with the field', async () => {
    const project = seedProject({
      schemas: [faction],
      types: [leaderType],
      relationships: [leaderLink, otherLink],
    });
    const json = await call('update_schema', {
      schemaId: 'faction-1',
      operations: [{ op: 'remove_field', fieldKey: 'leader' }],
    });

    expect(project.types()).toEqual([]);
    expect(project.relationships().map((r) => r.id)).toEqual(['rel-2']);
    expect(json.result?.structuredContent).toMatchObject({
      relationshipTypesRemoved: 1,
      relationshipsRemoved: 1,
    });
  });

  it('keeps relationship type ids by key when tabs are replaced', async () => {
    const project = seedProject({
      schemas: [faction],
      types: [leaderType],
      relationships: [leaderLink],
    });
    await call('update_schema', {
      schemaId: 'faction-1',
      tabs: [
        {
          key: 'main',
          label: 'Main',
          fields: [{ key: 'leader', label: 'Leader', type: 'relationship' }],
        },
      ],
    });

    const fields = project.schemas()[0].tabs[0].fields;
    expect(fields).toHaveLength(1);
    expect(fields[0].relationshipTypeId).toBe('fieldrel-leader');
    expect(project.relationships()).toHaveLength(1);
  });

  it('leaves the schema untouched when an operation fails', async () => {
    const project = seedProject({
      schemas: [faction],
      types: [leaderType],
      relationships: [leaderLink],
    });
    const json = await call('update_schema', {
      schemaId: 'faction-1',
      operations: [
        { op: 'remove_field', fieldKey: 'leader' },
        { op: 'add_field', tabKey: 'general', field: { key: 'motto', label: 'Motto again' } },
      ],
    });

    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain('used twice');
    expect(project.schemas()[0]).toEqual(faction);
    expect(project.types()).toHaveLength(1);
    expect(project.relationships()).toHaveLength(1);
  });

  it('rejects an unknown schema, an empty change and tabs with operations', async () => {
    seedProject({ schemas: [faction] });
    expect(textOf(await call('update_schema', { schemaId: 'nope', name: 'X' }))).toContain(
      'Available: faction-1'
    );
    expect(textOf(await call('update_schema', { schemaId: 'faction-1' }))).toContain(
      'nothing to change'
    );
    expect(
      textOf(await call('update_schema', { schemaId: 'faction-1', tabs: [], operations: [] }))
    ).toContain('not both');
  });

  it('clears defaultValues with null', async () => {
    const project = seedProject({ schemas: [{ ...faction, defaultValues: { motto: 'Onward' } }] });
    await call('update_schema', { schemaId: 'faction-1', defaultValues: null });
    expect(project.schemas()[0].defaultValues).toBeUndefined();
  });
});

describe('delete_schema', () => {
  it('deletes the schema, its relationship types and their relationships', async () => {
    const strayType = {
      ...leaderType,
      id: 'fieldrel-old',
      fieldSource: { schemaId: 'faction-1', fieldKey: 'old' },
    };
    const unrelated = { id: 'friend', name: 'Friend' };
    const project = seedProject({
      schemas: [faction, { ...faction, id: 'other', name: 'Other' }],
      types: [leaderType, strayType, unrelated],
      relationships: [leaderLink, otherLink],
    });

    const json = await call('delete_schema', { schemaId: 'faction-1' });

    expect(project.schemas().map((s) => s.id)).toEqual(['other']);
    expect(project.types()).toEqual([unrelated]);
    expect(project.relationships().map((r) => r.id)).toEqual(['rel-2']);
    expect(json.result?.structuredContent).toMatchObject({
      deletedSchemaId: 'faction-1',
      name: 'Faction',
      relationshipTypesRemoved: 2,
      relationshipsRemoved: 1,
    });
  });

  it('reports an unknown schema', async () => {
    seedProject();
    const json = await call('delete_schema', { schemaId: 'nope' });
    expect(json.result?.isError).toBe(true);
    expect(textOf(json)).toContain('not found');
  });
});

describe('schema editing helpers', () => {
  it('derives unique camelCase keys from labels', () => {
    expect(deriveKey('Eye Colour', new Set(), 'field')).toBe('eyeColour');
    expect(deriveKey('Eye Colour', new Set(['eyeColour', 'eyeColour2']), 'field')).toBe(
      'eyeColour3'
    );
    expect(deriveKey('2nd Name', new Set(), 'field')).toBe('field2ndName');
    expect(deriveKey('!!!', new Set(), 'tab')).toBe('tab');
  });

  it('validates like the template editor', () => {
    const tab = (key: string, fields: { key: string; label: string; type: string }[]) => ({
      key,
      label: key,
      fields,
    });
    expect(validateTabs([tab('a', []), tab('a', [])])).toContain('used twice');
    expect(
      validateTabs([
        tab('a', [
          { key: 'stats', label: 'Stats', type: 'text' },
          { key: 'stats.str', label: 'Str', type: 'number' },
        ]),
      ])
    ).toContain('nested field group');
    expect(validateTabs([tab('a', [{ key: 'x', label: 'X', type: 'text' }])])).toBeNull();
  });

  it('rejects unknown field properties and unknown operations', () => {
    const tabs = createTabs([{ key: 'a', label: 'A' }]);
    expect(tabs.ok).toBe(true);
    if (!tabs.ok) return;
    expect(
      applySchemaOperations(tabs.value, [
        { op: 'add_field', tabKey: 'a', field: { label: 'X', colour: 'red' } },
      ])
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('unsupported field properties: colour'),
    });
    expect(applySchemaOperations(tabs.value, [{ op: 'explode' }])).toMatchObject({
      ok: false,
      error: 'operation 1: unknown operation "explode"',
    });
  });

  it('plans no change for a relationship type that already matches', () => {
    const changes = planRelationshipTypeChanges(
      'faction-1',
      faction.tabs as never,
      faction.tabs as never,
      [leaderType]
    );
    expect(changes).toEqual({ upserts: [], removedTypeIds: [] });
  });
});
